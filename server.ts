import express from 'express';
import { config as loadLocalEnv } from 'dotenv';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { Pool } from 'pg';
import { createClient } from '@supabase/supabase-js';
import { loadDB, saveDB, emptyDB, withRequestDB, seed40Cards, ensureCurrentAndNextMonthObligations, ensureMonthObligations, ensureYearObligations, enrichObligation, getMonthSummary, updateObligationReminderPrediction } from './src/server/db.ts';
import type { DatabaseSchema } from './src/server/db.ts';
import { runReminderCheck } from './src/server/cron.ts';
import { runAllTestCases } from './src/server/testRunner.ts';
import type { Card, Obligation, Payment, AuditLog, UserConfig } from './src/types.ts';
import {
  calculateDueDate,
  getCurrentDateStr,
  getCurrentYearMonth,
  getNextMonth,
  getDaysInMonth,
  parseYearMonth,
  addDays,
  parseDueDayValue,
} from './src/utils/dateUtils.ts';

loadLocalEnv({ path: '.env.local', quiet: true });

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: true } });
const supabase = process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

export async function createApp(serveFrontend = false) {
  const app = express();
  const PORT = process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000;

  app.use(express.json({ limit: '10mb' }));

  // Each request owns a locked, per-user document. Commit before responding.
  // PostgreSQL row locks prevent simultaneous devices from overwriting each other.
  app.use('/api', async (req: Request, res: Response, next) => {
    if (req.path === '/health') return next();
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token || !supabase || !process.env.DATABASE_URL) {
      res.status(401).json({ error: 'Vui lòng đăng nhập bằng Supabase.' });
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user?.email) {
      res.status(401).json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' });
      return;
    }
    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');
      await client.query('INSERT INTO public.app_state (user_id, document) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING', [authData.user.id, JSON.stringify(emptyDB())]);
      const result = await client.query('SELECT document FROM public.app_state WHERE user_id = $1 FOR UPDATE', [authData.user.id]);
      const context = { db: result.rows[0].document as DatabaseSchema, dirty: false };
      const db = context.db;
      let user = db.users.find(u => u.id === authData.user.id);
      if (!user) {
        user = {
          id: authData.user.id, username: authData.user.email.split('@')[0],
          name: String(authData.user.user_metadata?.full_name || authData.user.email.split('@')[0]),
          email: authData.user.email, role: 'user', createdAt: new Date().toISOString(),
        };
        db.users = [user];
        db.userConfigs[user.id] = { userId: user.id, dailyDigestTime: '08:00', emailEnabled: false, targetEmail: user.email, discreteMode: false };
        context.dirty = true;
      }
      (req as any).user = user;
      const activeClient = client;
      const originalSend = res.send.bind(res);
      let ended = false;
      res.send = ((body: any) => {
        if (ended) return res;
        ended = true;
        void (async () => {
          try {
            if (context.dirty) {
              await activeClient.query('UPDATE public.app_state SET document = $2, updated_at = now() WHERE user_id = $1', [user.id, JSON.stringify(db)]);
            }
            await activeClient.query('COMMIT');
            originalSend(body);
          } catch (err) {
            await activeClient.query('ROLLBACK').catch(() => {});
            res.statusCode = 500;
            originalSend(JSON.stringify({ error: 'Không thể lưu dữ liệu. Vui lòng thử lại.' }));
          } finally {
            activeClient.release();
          }
        })();
        return res;
      }) as typeof res.send;
      res.on('close', () => {
        if (!ended) { ended = true; void activeClient.query('ROLLBACK').finally(() => activeClient.release()); }
      });
      withRequestDB(context, next);
    } catch (err) {
      if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
      if (!res.headersSent) res.status(503).json({ error: 'Không kết nối được cơ sở dữ liệu Supabase.' });
    }
  });
  const authMiddleware = (req: Request, res: Response, next: express.NextFunction) => {
    if (!(req as any).user) return res.status(401).json({ error: 'Chưa đăng nhập.' });
    next();
  };
  const db = new Proxy({} as DatabaseSchema, {
    get: (_target, key) => (loadDB() as any)[key],
    set: (_target, key, value) => { (loadDB() as any)[key] = value; saveDB(); return true; },
  });

  // -------------------------------------------------------------
  // API Routes
  // -------------------------------------------------------------

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Supabase Auth is handled by the browser SDK; user identity is checked above.
  app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    res.json({ user, config: db.userConfigs[user.id] });
  });

  // Month Summary
  app.get('/api/summary/:month', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const month = req.params.month || getCurrentYearMonth();
    const summary = getMonthSummary(user.id, month);
    res.json(summary);
  });

  // Cards CRUD
  app.get('/api/cards', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const cards = db.cards.filter(c => c.userId === user.id);
    res.json(cards);
  });

  app.post('/api/cards', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { name, bankName, defaultDueDay, autoWeekendShift, startTrackingMonth, notes, customReminderDays } = req.body;

    if (!name || !bankName || !defaultDueDay) {
      res.status(400).json({ error: 'Vui lòng cung cấp tên thẻ, ngân hàng và ngày đến hạn (1-31).' });
      return;
    }

    const day = parseInt(defaultDueDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      res.status(400).json({ error: 'Ngày đến hạn mặc định phải từ 1 đến 31.' });
      return;
    }

    const startMonth = startTrackingMonth || getCurrentYearMonth();

    const newCard: Card = {
      id: `card_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId: user.id,
      name: name.trim(),
      bankName: bankName.trim(),
      defaultDueDay: day,
      status: 'active',
      autoWeekendShift: Boolean(autoWeekendShift),
      startTrackingMonth: startMonth,
      customReminderDays: customReminderDays || [7, 3, 1, 0],
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.cards.push(newCard);

    // Create obligations from startMonth up to next month
    const curMonth = getCurrentYearMonth();
    const nextMonth = getNextMonth(curMonth);
    const monthsToCreate: string[] = [];

    let scanMonth = startMonth;
    while (scanMonth <= nextMonth) {
      monthsToCreate.push(scanMonth);
      if (scanMonth === nextMonth) break;
      scanMonth = getNextMonth(scanMonth);
      if (monthsToCreate.length > 24) break; // safety boundary
    }

    for (const m of monthsToCreate) {
      const { year, month } = parseYearMonth(m);
      const dueCalc = calculateDueDate(year, month, newCard.defaultDueDay, newCard.autoWeekendShift);

      const newObl: Obligation = {
        id: `obl_${newCard.id}_${m}`,
        userId: user.id,
        cardId: newCard.id,
        month: m,
        dataState: 'UNUPDATED',
        amount: 0,
        dueDay: dueCalc.dueDay,
        actualDueDate: dueCalc.actualDueDate,
        dueDateSource: dueCalc.dueDateSource,
        isEstimatedDue: dueCalc.isEstimatedDue,
        firstDeclaredAt: null,
        noExpenseConfirmedAt: null,
        updateReminderDate: addDays(dueCalc.actualDueDate, -7),
        updateReminderSource: 'DEFAULT_7_DAYS',
        updateReminderReason: 'Mặc định trước ngày đến hạn 7 ngày',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.obligations.push(newObl);
    }

    const audit: AuditLog = {
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'CARD',
      entityId: newCard.id,
      action: 'CREATE',
      previousValue: null,
      newValue: newCard,
      reason: 'Thêm thẻ mới',
      createdAt: new Date().toISOString(),
    };
    db.auditLogs.push(audit);

    saveDB();
    res.status(201).json(newCard);
  });

  app.put('/api/cards/:id', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const card = db.cards.find(c => c.id === req.params.id && c.userId === user.id);
    if (!card) {
      res.status(404).json({ error: 'Không tìm thấy thẻ.' });
      return;
    }

    const { name, bankName, defaultDueDay, autoWeekendShift, status, notes, customReminderDays, applyDueDayFromMonth } = req.body;

    const oldValues = { ...card };

    if (name) card.name = name.trim();
    if (bankName) card.bankName = bankName.trim();
    if (autoWeekendShift !== undefined) card.autoWeekendShift = Boolean(autoWeekendShift);
    if (status && (status === 'active' || status === 'archived')) card.status = status;
    if (notes !== undefined) card.notes = notes;
    if (customReminderDays) card.customReminderDays = customReminderDays;

    if (defaultDueDay && defaultDueDay >= 1 && defaultDueDay <= 31 && defaultDueDay !== card.defaultDueDay) {
      const oldDueDay = card.defaultDueDay;
      card.defaultDueDay = defaultDueDay;

      // Update future/pending obligations if requested
      const fromMonth = applyDueDayFromMonth || getCurrentYearMonth();
      const targetObls = db.obligations.filter(
        o => o.userId === user.id && o.cardId === card.id && o.month >= fromMonth && o.dataState === 'UNUPDATED'
      );

      for (const obl of targetObls) {
        const { year, month } = parseYearMonth(obl.month);
        const dueCalc = calculateDueDate(year, month, card.defaultDueDay, card.autoWeekendShift);
        obl.dueDay = dueCalc.dueDay;
        obl.actualDueDate = dueCalc.actualDueDate;
        obl.dueDateSource = dueCalc.dueDateSource;
        obl.isEstimatedDue = dueCalc.isEstimatedDue;
        obl.updateReminderDate = addDays(dueCalc.actualDueDate, -7);
      }
    }

    card.updatedAt = new Date().toISOString();

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'CARD',
      entityId: card.id,
      action: 'CREATE',
      previousValue: oldValues,
      newValue: card,
      reason: 'Cập nhật thông tin thẻ',
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json(card);
  });

  // Delete single card with associated obligations and payments
  app.delete('/api/cards/:id', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const card = db.cards.find(c => c.id === req.params.id && c.userId === user.id);
    if (!card) {
      res.status(404).json({ error: 'Không tìm thấy thẻ.' });
      return;
    }

    const oblIdsToDelete = db.obligations.filter(o => o.cardId === card.id && o.userId === user.id).map(o => o.id);
    db.cards = db.cards.filter(c => c.id !== card.id);
    db.obligations = db.obligations.filter(o => !oblIdsToDelete.includes(o.id));
    db.payments = db.payments.filter(p => !oblIdsToDelete.includes(p.obligationId));

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'CARD',
      entityId: card.id,
      action: 'DELETE',
      previousValue: card,
      newValue: null,
      reason: `Xóa thẻ ${card.name}`,
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json({ success: true, deletedCardId: card.id });
  });

  // Batch delete multiple cards with associated obligations and payments
  app.post('/api/cards/batch-delete', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { cardIds } = req.body;

    if (!Array.isArray(cardIds) || cardIds.length === 0) {
      res.status(400).json({ error: 'Danh sách ID thẻ cần xóa không hợp lệ.' });
      return;
    }

    const cardsToDelete = db.cards.filter(c => cardIds.includes(c.id) && c.userId === user.id);
    if (cardsToDelete.length === 0) {
      res.status(404).json({ error: 'Không tìm thấy thẻ nào để xóa.' });
      return;
    }

    const validCardIds = cardsToDelete.map(c => c.id);
    const oblIdsToDelete = db.obligations.filter(o => validCardIds.includes(o.cardId) && o.userId === user.id).map(o => o.id);

    db.cards = db.cards.filter(c => !validCardIds.includes(c.id));
    db.obligations = db.obligations.filter(o => !oblIdsToDelete.includes(o.id));
    db.payments = db.payments.filter(p => !oblIdsToDelete.includes(p.obligationId));

    db.auditLogs.push({
      id: `audit_${Date.now()}_batch_del`,
      userId: user.id,
      entityType: 'CARD',
      entityId: 'BATCH_DELETE',
      action: 'DELETE',
      previousValue: { cardCount: cardsToDelete.length, names: cardsToDelete.map(c => c.name) },
      newValue: null,
      reason: `Xóa hàng loạt ${cardsToDelete.length} thẻ: ${cardsToDelete.map(c => c.name).join(', ')}`,
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json({ success: true, count: cardsToDelete.length, deletedCardIds: validCardIds });
  });

  // Batch import cards (CSV / Excel format) - replaceExisting: true by default to wipe old cards
  app.post('/api/cards/import-batch', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { cards: importList, replaceExisting = true } = req.body;

    if (!Array.isArray(importList) || importList.length === 0) {
      res.status(400).json({ error: 'Danh sách thẻ import rỗng.' });
      return;
    }

    const shouldReplace = replaceExisting !== false;

    // If replace requested: wipe all existing cards and obligations for this user
    if (shouldReplace) {
      const oldCount = db.cards.filter(c => c.userId === user.id).length;
      db.cards = db.cards.filter(c => c.userId !== user.id);
      db.obligations = db.obligations.filter(o => o.userId !== user.id);
      db.payments = db.payments.filter(p => p.userId !== user.id);
      db.notifications = db.notifications.filter(n => n.userId !== user.id);

      db.auditLogs.push({
        id: `audit_${Date.now()}_del`,
        userId: user.id,
        entityType: 'CARD',
        entityId: 'BATCH_IMPORT',
        action: 'DELETE',
        previousValue: { cardCount: oldCount },
        newValue: null,
        reason: 'Xóa bỏ toàn bộ danh mục thẻ cũ khi nhập danh sách thẻ mới',
        createdAt: new Date().toISOString(),
      });
    }

    const curMonth = getCurrentYearMonth();
    const nextMonth = getNextMonth(curMonth);
    const addedCards: Card[] = [];

    for (const item of importList) {
      if (!item.name || !item.bankName) continue;
      const day = parseDueDayValue(item.defaultDueDay);
      if (day === null) continue; // Adhere strictly to file data; do not default to 15!

      // Duplicate check: Same name for this user
      const exists = db.cards.some(c => c.userId === user.id && c.name.toLowerCase() === item.name.trim().toLowerCase());
      if (exists) continue;

      const card: Card = {
        id: `card_${user.id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        userId: user.id,
        name: item.name.trim(),
        bankName: item.bankName.trim(),
        defaultDueDay: day,
        status: 'active',
        autoWeekendShift: Boolean(item.autoWeekendShift),
        startTrackingMonth: item.startTrackingMonth || curMonth,
        notes: item.notes || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.cards.push(card);
      addedCards.push(card);

      // Create obligations from startTrackingMonth up to nextMonth
      const startMonth = item.startTrackingMonth || curMonth;
      const monthsToCreate: string[] = [];
      let scanMonth = startMonth;
      while (scanMonth <= nextMonth) {
        monthsToCreate.push(scanMonth);
        if (scanMonth === nextMonth) break;
        scanMonth = getNextMonth(scanMonth);
        if (monthsToCreate.length > 24) break;
      }

      for (const m of monthsToCreate) {
        const { year, month } = parseYearMonth(m);
        const dueCalc = calculateDueDate(year, month, card.defaultDueDay, card.autoWeekendShift);
        db.obligations.push({
          id: `obl_${card.id}_${m}`,
          userId: user.id,
          cardId: card.id,
          month: m,
          dataState: 'UNUPDATED',
          amount: 0,
          dueDay: dueCalc.dueDay,
          actualDueDate: dueCalc.actualDueDate,
          dueDateSource: dueCalc.dueDateSource,
          isEstimatedDue: dueCalc.isEstimatedDue,
          firstDeclaredAt: null,
          noExpenseConfirmedAt: null,
          updateReminderDate: addDays(dueCalc.actualDueDate, -7),
          updateReminderSource: 'DEFAULT_7_DAYS',
          updateReminderReason: 'Mặc định trước ngày đến hạn 7 ngày',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    ensureCurrentAndNextMonthObligations(user.id);

    db.auditLogs.push({
      id: `audit_${Date.now()}_add`,
      userId: user.id,
      entityType: 'CARD',
      entityId: 'BATCH_IMPORT',
      action: 'CREATE',
      previousValue: null,
      newValue: { importedCount: addedCards.length, replaced: shouldReplace },
      reason: shouldReplace
        ? `Đã xóa thẻ cũ và nhập mới ${addedCards.length} thẻ vào danh mục`
        : `Đã bổ sung ${addedCards.length} thẻ vào danh mục`,
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json({ success: true, count: addedCards.length, cards: addedCards, replaced: shouldReplace });
  });

  // Obligations
  app.get('/api/obligations', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const month = (req.query.month as string) || getCurrentYearMonth();
    ensureCurrentAndNextMonthObligations(user.id);
    ensureMonthObligations(user.id, month);

    const obls = db.obligations.filter(o => o.userId === user.id && o.month === month);
    const enriched = obls.map(o => enrichObligation(o, user.id));
    res.json(enriched);
  });

  // Single obligation update (Amount, actualDueDate, notes) with audit log
  app.put('/api/obligations/:id', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const obl = db.obligations.find(o => o.id === req.params.id && o.userId === user.id);
    if (!obl) {
      res.status(404).json({ error: 'Không tìm thấy nghĩa vụ thanh toán.' });
      return;
    }

    const { amount, actualDueDate, notes, reason } = req.body;
    const oldValues = { ...obl };

    const validPayments = db.payments.filter(p => p.obligationId === obl.id && p.status === 'VALID');
    const totalPaid = validPayments.reduce((s, p) => s + p.amount, 0);

    if (amount !== undefined) {
      const numAmount = Math.max(0, Math.floor(Number(amount)));

      // RULE: Cannot decrease amount below total paid
      if (numAmount < totalPaid) {
        res.status(400).json({
          error: `Không thể điều chỉnh số tiền (${numAmount.toLocaleString('vi-VN')} ₫) thấp hơn tổng số tiền đã ghi nhận thanh toán (${totalPaid.toLocaleString('vi-VN')} ₫). Vui lòng điều chỉnh hoặc hủy các bản ghi thanh toán trước.`,
        });
        return;
      }

      if (numAmount === 0) {
        res.status(400).json({
          error: 'Số tiền phải lớn hơn 0 hoặc chọn "Không phát sinh" thay vì nhập 0.',
        });
        return;
      }

      obl.amount = numAmount;
      obl.dataState = 'DECLARED';
      if (!obl.firstDeclaredAt) {
        obl.firstDeclaredAt = new Date().toISOString();
      }
    }

    if (actualDueDate && actualDueDate !== obl.actualDueDate) {
      obl.actualDueDate = actualDueDate;
      obl.dueDateSource = 'MANUAL_OVERRIDE';
      obl.isEstimatedDue = false;
    }

    if (notes !== undefined) obl.notes = notes;
    obl.updatedAt = new Date().toISOString();

    // Re-predict reminder
    updateObligationReminderPrediction(user.id, obl);

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'OBLIGATION',
      entityId: obl.id,
      action: 'UPDATE_AMOUNT',
      previousValue: oldValues,
      newValue: obl,
      reason: reason || 'Cập nhật số tiền nghĩa vụ thanh toán',
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json(enrichObligation(obl, user.id));
  });

  // Confirm NO_EXPENSE
  app.post('/api/obligations/:id/confirm-no-expense', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const obl = db.obligations.find(o => o.id === req.params.id && o.userId === user.id);
    if (!obl) {
      res.status(404).json({ error: 'Không tìm thấy nghĩa vụ thanh toán.' });
      return;
    }

    const validPayments = db.payments.filter(p => p.obligationId === obl.id && p.status === 'VALID');
    if (validPayments.length > 0) {
      res.status(400).json({
        error: 'Không thể chuyển sang "Không phát sinh" khi kỳ này vẫn còn các bản ghi thanh toán có hiệu lực.',
      });
      return;
    }

    const oldValues = { ...obl };
    obl.dataState = 'NO_EXPENSE';
    obl.amount = 0;
    obl.noExpenseConfirmedAt = new Date().toISOString();
    obl.updatedAt = new Date().toISOString();

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'OBLIGATION',
      entityId: obl.id,
      action: 'CONFIRM_NO_EXPENSE',
      previousValue: oldValues,
      newValue: obl,
      reason: 'Xác nhận không phát sinh chi tiêu kỳ này',
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json(enrichObligation(obl, user.id));
  });

  // Batch update (Quick batch update screen - Mục 6.C)
  app.post('/api/obligations/batch-update', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { updates, reason } = req.body;

    if (!Array.isArray(updates)) {
      res.status(400).json({ error: 'Dữ liệu cập nhật không hợp lệ.' });
      return;
    }

    const results: any[] = [];
    const errors: { id: string; cardName: string; error: string }[] = [];

    for (const item of updates) {
      const obl = db.obligations.find(o => o.id === item.id && o.userId === user.id);
      if (!obl) continue;

      const card = db.cards.find(c => c.id === obl.cardId) || { name: 'Thẻ' };
      const validPayments = db.payments.filter(p => p.obligationId === obl.id && p.status === 'VALID');
      const totalPaid = validPayments.reduce((s, p) => s + p.amount, 0);

      if (item.isNoExpense) {
        if (validPayments.length > 0) {
          errors.push({
            id: obl.id,
            cardName: card.name,
            error: 'Không thể chọn Không phát sinh khi đã có thanh toán ghi nhận.',
          });
          continue;
        }
        obl.dataState = 'NO_EXPENSE';
        obl.amount = 0;
        obl.noExpenseConfirmedAt = new Date().toISOString();
      } else if (item.amount !== undefined && item.amount !== null && item.amount !== '') {
        const num = Math.floor(Number(item.amount));
        if (num === 0) {
          if (validPayments.length > 0) {
            errors.push({
              id: obl.id,
              cardName: card.name,
              error: 'Không thể đặt số tiền 0 khi đã có thanh toán ghi nhận.',
            });
            continue;
          }
          obl.dataState = 'NO_EXPENSE';
          obl.amount = 0;
          obl.noExpenseConfirmedAt = new Date().toISOString();
        } else {
          if (num < totalPaid) {
            errors.push({
              id: obl.id,
              cardName: card.name,
              error: `Số tiền (${num.toLocaleString('vi-VN')} ₫) thấp hơn số đã trả (${totalPaid.toLocaleString('vi-VN')} ₫).`,
            });
            continue;
          }
          obl.amount = num;
          obl.dataState = 'DECLARED';
          if (!obl.firstDeclaredAt) {
            obl.firstDeclaredAt = new Date().toISOString();
          }
        }
      }

      if (item.actualDueDate && item.actualDueDate !== obl.actualDueDate) {
        obl.actualDueDate = item.actualDueDate;
        obl.dueDateSource = 'MANUAL_OVERRIDE';
        obl.isEstimatedDue = false;
      }

      if (item.notes !== undefined) {
        obl.notes = item.notes;
      }

      obl.updatedAt = new Date().toISOString();
      updateObligationReminderPrediction(user.id, obl);
      results.push(enrichObligation(obl, user.id));
    }

    if (results.length > 0) {
      db.auditLogs.push({
        id: `audit_${Date.now()}`,
        userId: user.id,
        entityType: 'OBLIGATION',
        entityId: 'BATCH_UPDATE',
        action: 'UPDATE_AMOUNT',
        previousValue: null,
        newValue: { count: results.length },
        reason: reason || 'Cập nhật nhanh hàng loạt theo tháng',
        createdAt: new Date().toISOString(),
      });
      saveDB();
    }

    res.json({
      success: true,
      updatedCount: results.length,
      updated: results,
      errors,
    });
  });

  // Apply weekend Friday shift
  app.post('/api/obligations/:id/apply-weekend-shift', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const obl = db.obligations.find(o => o.id === req.params.id && o.userId === user.id);
    if (!obl) {
      res.status(404).json({ error: 'Không tìm thấy nghĩa vụ thanh toán.' });
      return;
    }

    const { year, month } = parseYearMonth(obl.month);
    const dueCalc = calculateDueDate(year, month, obl.dueDay, true);

    const oldValues = { ...obl };
    obl.actualDueDate = dueCalc.actualDueDate;
    obl.dueDay = dueCalc.dueDay;
    obl.dueDateSource = 'WEEKEND_FRIDAY_SUGGESTION';
    obl.updatedAt = new Date().toISOString();

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'OBLIGATION',
      entityId: obl.id,
      action: 'WEEKEND_SHIFT',
      previousValue: oldValues,
      newValue: obl,
      reason: 'Dời ngày đến hạn từ cuối tuần sang thứ 6 trước đó',
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json(enrichObligation(obl, user.id));
  });

  // Payments CRUD
  app.post('/api/payments', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { obligationId, amount, paidDate, notes, referenceCode, receiptUrl, declaredAmount } = req.body;

    const obl = db.obligations.find(o => o.id === obligationId && o.userId === user.id);
    if (!obl) {
      res.status(404).json({ error: 'Không tìm thấy nghĩa vụ thanh toán tương ứng.' });
      return;
    }

    const numAmount = Math.floor(Number(amount));
    if (isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ error: 'Số tiền thanh toán phải lớn hơn 0.' });
      return;
    }

    // If obligation is UNUPDATED or NO_EXPENSE, declare it with declaredAmount or payment amount
    if (obl.dataState !== 'DECLARED') {
      const decl = declaredAmount ? Math.floor(Number(declaredAmount)) : numAmount;
      if (decl < numAmount) {
        res.status(400).json({
          error: `Số tiền sao kê (${decl.toLocaleString('vi-VN')} ₫) không được nhỏ hơn số tiền thanh toán (${numAmount.toLocaleString('vi-VN')} ₫).`,
        });
        return;
      }
      obl.amount = decl;
      obl.dataState = 'DECLARED';
      if (!obl.firstDeclaredAt) {
        obl.firstDeclaredAt = new Date().toISOString();
      }
      obl.updatedAt = new Date().toISOString();
    }

    const validPayments = db.payments.filter(p => p.obligationId === obl.id && p.status === 'VALID');
    const totalPaid = validPayments.reduce((s, p) => s + p.amount, 0);
    const remaining = obl.amount - totalPaid;

    if (numAmount > remaining) {
      res.status(400).json({
        error: `Số tiền thanh toán (${numAmount.toLocaleString('vi-VN')} ₫) vượt quá số dư còn phải trả (${remaining.toLocaleString('vi-VN')} ₫). Phiên bản hiện tại không cho phép trả dư vào kỳ này.`,
      });
      return;
    }

    const paymentDate = paidDate || getCurrentDateStr();

    const payment: Payment = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId: user.id,
      obligationId: obl.id,
      cardId: obl.cardId,
      amount: numAmount,
      paidDate: paymentDate,
      createdAt: new Date().toISOString(),
      notes: notes || '',
      referenceCode: referenceCode || '',
      receiptUrl: receiptUrl || null,
      status: 'VALID',
    };

    db.payments.push(payment);

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'PAYMENT',
      entityId: payment.id,
      action: 'CREATE',
      previousValue: null,
      newValue: payment,
      reason: `Ghi nhận thanh toán ${numAmount.toLocaleString('vi-VN')} ₫`,
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.status(201).json({ payment, updatedObligation: enrichObligation(obl, user.id) });
  });

  // Cancel / delete payment with reason
  app.delete('/api/payments/:id', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const payment = db.payments.find(p => p.id === req.params.id && p.userId === user.id);
    if (!payment) {
      res.status(404).json({ error: 'Không tìm thấy bản ghi thanh toán.' });
      return;
    }

    const { reason } = req.body;
    payment.status = 'CANCELLED';
    payment.cancellationReason = reason || 'Người dùng hủy bản ghi thanh toán';

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'PAYMENT',
      entityId: payment.id,
      action: 'CANCEL_PAYMENT',
      previousValue: payment,
      newValue: null,
      reason: reason || 'Hủy ghi nhận thanh toán do nhập sai',
      createdAt: new Date().toISOString(),
    });

    saveDB();
    const obl = db.obligations.find(o => o.id === payment.obligationId);
    res.json({ success: true, updatedObligation: obl ? enrichObligation(obl, user.id) : null });
  });

  // Yearly Matrix (MUST be registered before /api/matrix/:year/:month so :year doesn't catch 'year')
  const handleYearlyMatrix = (req: Request, res: Response) => {
    const user = (req as any).user;
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ error: 'Năm không hợp lệ' });
    }

    const userCards = db.cards
      .filter(c => c.userId === user.id)
      .sort((a, b) => a.defaultDueDay - b.defaultDueDay);

    let hasAdded = false;
    const matrix: any[] = [];
    const monthlyTotals: Record<number, { declared: number; paid: number; remaining: number; cardCount: number; unupdatedCount: number }> = {};

    for (let m = 1; m <= 12; m++) {
      monthlyTotals[m] = { declared: 0, paid: 0, remaining: 0, cardCount: 0, unupdatedCount: 0 };
    }

    let grandTotalObligation = 0;
    let grandTotalPaid = 0;

    for (const card of userCards) {
      const monthData: Record<number, any> = {};
      let totalYearObligation = 0;
      let totalYearPaid = 0;

      for (let m = 1; m <= 12; m++) {
        const ym = `${year}-${String(m).padStart(2, '0')}`;
        let obl = db.obligations.find(o => o.userId === user.id && o.cardId === card.id && o.month === ym);

        // Auto-initialize obligation for active card if tracked in this month
        if (!obl && card.status === 'active' && (!card.startTrackingMonth || ym >= card.startTrackingMonth)) {
          const dueCalc = calculateDueDate(year, m, card.defaultDueDay, card.autoWeekendShift);
          obl = {
            id: `obl_${card.id}_${ym}`,
            userId: user.id,
            cardId: card.id,
            month: ym,
            dataState: 'UNUPDATED',
            amount: 0,
            dueDay: dueCalc.dueDay,
            actualDueDate: dueCalc.actualDueDate,
            dueDateSource: dueCalc.dueDateSource,
            isEstimatedDue: dueCalc.isEstimatedDue,
            firstDeclaredAt: null,
            noExpenseConfirmedAt: null,
            updateReminderDate: addDays(dueCalc.actualDueDate, -7),
            updateReminderSource: 'DEFAULT_7_DAYS',
            updateReminderReason: 'Mặc định trước ngày đến hạn 7 ngày',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          db.obligations.push(obl);
          hasAdded = true;
        }

        if (obl) {
          const enriched = enrichObligation(obl, user.id);
          monthData[m] = {
            obligation: enriched,
            obligationId: obl.id,
            dataState: enriched.dataState,
            amount: enriched.amount,
            totalPaid: enriched.totalPaid,
            remaining: enriched.remainingAmount,
            status: enriched.paymentStatus,
            actualDueDate: enriched.actualDueDate,
            dueDay: enriched.dueDay,
          };

          totalYearObligation += enriched.amount;
          totalYearPaid += enriched.totalPaid;

          monthlyTotals[m].cardCount++;
          if (enriched.dataState === 'DECLARED') {
            monthlyTotals[m].declared += enriched.amount;
            monthlyTotals[m].paid += enriched.totalPaid;
            monthlyTotals[m].remaining += enriched.remainingAmount;
          } else if (enriched.dataState === 'UNUPDATED') {
            monthlyTotals[m].unupdatedCount++;
          }
        } else {
          monthData[m] = null;
        }
      }

      grandTotalObligation += totalYearObligation;
      grandTotalPaid += totalYearPaid;

      matrix.push({
        card,
        months: monthData,
        totalYearObligation,
        totalYearPaid,
        totalYearRemaining: totalYearObligation - totalYearPaid,
      });
    }

    if (hasAdded) {
      saveDB();
    }

    res.json({
      year,
      matrix,
      monthlyTotals,
      grandTotal: {
        declared: grandTotalObligation,
        paid: grandTotalPaid,
        remaining: grandTotalObligation - grandTotalPaid,
      },
    });
  };

  app.get('/api/matrix/year/:year', authMiddleware, handleYearlyMatrix);
  app.get('/api/matrix/yearly/:year', authMiddleware, handleYearlyMatrix);

  // Matrix View Month (Using strict regex so it never matches /api/matrix/year/...)
  app.get('/api/matrix/:year(\\d{4})/:month(\\d{1,2})', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const year = parseInt(req.params.year, 10);
    const month = parseInt(req.params.month, 10);
    const ym = `${year}-${String(month).padStart(2, '0')}`;

    ensureCurrentAndNextMonthObligations(user.id);

    const totalDays = getDaysInMonth(year, month);
    const userCards = db.cards
      .filter(c => c.userId === user.id && (c.status === 'active' || c.startTrackingMonth <= ym))
      .sort((a, b) => a.defaultDueDay - b.defaultDueDay);

    const obligations = db.obligations.filter(o => o.userId === user.id && o.month === ym);
    const enrichedMap = new Map<string, any>();

    for (const obl of obligations) {
      enrichedMap.set(obl.cardId, enrichObligation(obl, user.id));
    }

    // Compute day columns metadata (day 1..totalDays)
    const dayColumns = [];
    const dailyTotals: Record<number, { declared: number; remaining: number; cardCount: number; unupdatedCount: number }> = {};

    for (let d = 1; d <= totalDays; d++) {
      const dt = new Date(Date.UTC(year, month - 1, d));
      const dow = dt.getUTCDay();
      dayColumns.push({
        day: d,
        dateStr: `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        isWeekend: dow === 0 || dow === 6,
        dayOfWeek: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][dow],
      });

      dailyTotals[d] = { declared: 0, remaining: 0, cardCount: 0, unupdatedCount: 0 };
    }

    // Matrix rows
    const rows = userCards.map(card => {
      const obl = enrichedMap.get(card.id);
      if (obl) {
        const day = obl.dueDay;
        if (dailyTotals[day]) {
          dailyTotals[day].cardCount++;
          if (obl.dataState === 'DECLARED') {
            dailyTotals[day].declared += obl.amount;
            dailyTotals[day].remaining += obl.remainingAmount;
          } else if (obl.dataState === 'UNUPDATED') {
            dailyTotals[day].unupdatedCount++;
          }
        }
      }
      return {
        card,
        obligation: obl || null,
      };
    });

    res.json({
      year,
      month,
      totalDays,
      dayColumns,
      dailyTotals,
      rows,
    });
  });

  // Audit Logs
  app.get('/api/audit-logs', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const logs = db.auditLogs.filter(a => a.userId === user.id).slice(-50).reverse();
    res.json(logs);
  });

  // Notifications
  app.get('/api/notifications', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    runReminderCheck(user.id);
    const notifs = db.notifications.filter(n => n.userId === user.id).slice(0, 50);
    const unreadCount = db.notifications.filter(n => n.userId === user.id && !n.read).length;
    res.json({ notifications: notifs, unreadCount });
  });

  app.post('/api/notifications/:id/read', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const notif = db.notifications.find(n => n.id === req.params.id && n.userId === user.id);
    if (notif) {
      notif.read = true;
      saveDB();
    }
    res.json({ success: true });
  });

  app.post('/api/notifications/mark-all-read', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    db.notifications.filter(n => n.userId === user.id).forEach(n => (n.read = true));
    saveDB();
    res.json({ success: true });
  });

  app.post('/api/notifications/run-check', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const resRun = runReminderCheck(user.id);
    res.json(resRun);
  });

  // User Config / Settings
  app.put('/api/settings/config', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { dailyDigestTime, emailEnabled, targetEmail, discreteMode } = req.body;

    const config: UserConfig = db.userConfigs[user.id] || {
      userId: user.id,
      dailyDigestTime: '08:00',
      emailEnabled: false,
      targetEmail: user.email,
      discreteMode: false,
    };

    if (dailyDigestTime) config.dailyDigestTime = dailyDigestTime;
    if (emailEnabled !== undefined) config.emailEnabled = Boolean(emailEnabled);
    if (targetEmail) config.targetEmail = targetEmail;
    if (discreteMode !== undefined) config.discreteMode = Boolean(discreteMode);
    db.userConfigs[user.id] = config;
    saveDB();
    res.json(config);
  });

  // Backup Export
  app.get('/api/backup/export', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const userBackup = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      user: { id: user.id, name: user.name, email: user.email },
      cards: db.cards.filter(c => c.userId === user.id),
      obligations: db.obligations.filter(o => o.userId === user.id),
      payments: db.payments.filter(p => p.userId === user.id),
      auditLogs: db.auditLogs.filter(a => a.userId === user.id),
      notifications: db.notifications.filter(n => n.userId === user.id),
      userConfig: db.userConfigs[user.id],
    };

    res.setHeader('Content-Disposition', `attachment; filename=so-thanh-toan-the-backup-${getCurrentDateStr()}.json`);
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(userBackup, null, 2));
  });

  // Backup Import
  app.post('/api/backup/import', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const backupData = req.body;

    if (!backupData || !Array.isArray(backupData.cards)) {
      res.status(400).json({ error: 'Dữ liệu sao lưu không hợp lệ.' });
      return;
    }

    // Clean current user data
    db.cards = db.cards.filter(c => c.userId !== user.id);
    db.obligations = db.obligations.filter(o => o.userId !== user.id);
    db.payments = db.payments.filter(p => p.userId !== user.id);
    db.auditLogs = db.auditLogs.filter(a => a.userId !== user.id);
    db.notifications = db.notifications.filter(n => n.userId !== user.id);

    // Restore cards
    for (const c of backupData.cards) {
      c.userId = user.id;
      db.cards.push(c);
    }

    // Restore obligations
    if (Array.isArray(backupData.obligations)) {
      for (const o of backupData.obligations) {
        o.userId = user.id;
        db.obligations.push(o);
      }
    }

    // Restore payments
    if (Array.isArray(backupData.payments)) {
      for (const p of backupData.payments) {
        p.userId = user.id;
        db.payments.push(p);
      }
    }

    if (Array.isArray(backupData.auditLogs)) {
      for (const log of backupData.auditLogs) {
        log.userId = user.id;
        db.auditLogs.push(log);
      }
    }

    if (Array.isArray(backupData.notifications)) {
      for (const notification of backupData.notifications) {
        notification.userId = user.id;
        db.notifications.push(notification);
      }
    }

    if (backupData.userConfig) {
      backupData.userConfig.userId = user.id;
      db.userConfigs[user.id] = backupData.userConfig;
    }

    db.auditLogs.push({
      id: `audit_${Date.now()}`,
      userId: user.id,
      entityType: 'SYSTEM',
      entityId: 'BACKUP_RESTORE',
      action: 'RESTORE',
      previousValue: null,
      newValue: { cards: db.cards.length, obligations: db.obligations.length },
      reason: 'Phục hồi dữ liệu từ tệp sao lưu JSON',
      createdAt: new Date().toISOString(),
    });

    saveDB();
    res.json({ success: true, restoredCards: backupData.cards.length });
  });

  // Run Test Suite
  app.get('/api/tests/run-all', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const testResults = runAllTestCases(user.id);
    res.json(testResults);
  });

  if (serveFrontend) {
    const distPath = path.join(process.cwd(), 'dist');
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
      app.use(vite.middlewares);
    } else {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
    }
  }
  return app;
}

if (!process.env.VERCEL) {
  createApp(true).then(app => {
    const port = Number(process.env.PORT || 3000);
    app.listen(port, '0.0.0.0', () => console.log(`Server running on ${port}`));
  }).catch(err => console.error('Server startup failed:', err));
}

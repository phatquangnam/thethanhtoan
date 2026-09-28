import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  loadDB,
  saveDB,
  onDBChange,
  getDefaultUser,
  findUserByEmail,
  findUserById,
  createUser,
  validateUserLogin,
  updateUserPassword,
  hashPassword,
  seed40Cards,
  ensureCurrentAndNextMonthObligations,
  ensureMonthObligations,
  ensureYearObligations,
  enrichObligation,
  getMonthSummary,
  updateObligationReminderPrediction,
} from './src/server/db.ts';
import { runReminderCheck, startBackgroundScheduler } from './src/server/cron.ts';
import { runAllTestCases } from './src/server/testRunner.ts';
import { getFirebaseStatus, syncUserDataToFirebase } from './src/server/firebaseSync.ts';
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

async function startServer() {
  const app = express();
  const PORT = process.env.PORT && process.env.PORT !== '8080' ? Number(process.env.PORT) : 3000;

  app.use(express.json({ limit: '10mb' }));

  // Initialize DB and ensure default user + 40 sample cards
  const adminUser = getDefaultUser();
  const db = loadDB();
  const existingCards = db.cards.filter(c => c.userId === adminUser.id);
  if (existingCards.length === 0) {
    seed40Cards(adminUser.id, false);
  }
  ensureCurrentAndNextMonthObligations(adminUser.id);

  // Start background cron scheduler
  startBackgroundScheduler();

  // Auth middleware (Extracts user from Authorization token, x-user-id, or x-user-email; defaults to adminUser)
  const authMiddleware = (req: Request, res: Response, next: express.NextFunction) => {
    let user = null;
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
        if (decoded && decoded.userId) {
          user = findUserById(decoded.userId);
        } else if (decoded && decoded.email) {
          user = findUserByEmail(decoded.email);
        }
      } catch (e) {
        // invalid base64 token format, fallback
      }
    }

    if (!user) {
      const userId = req.headers['x-user-id'] as string;
      if (userId) {
        user = findUserById(userId);
      }
    }

    if (!user) {
      const email = req.headers['x-user-email'] as string;
      if (email) {
        user = findUserByEmail(email);
      }
    }

    if (!user) {
      user = adminUser;
    }

    (req as any).user = user;
    next();
  };

  // -------------------------------------------------------------
  // API Routes
  // -------------------------------------------------------------

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Real-time Server-Sent Events (SSE) for instant cross-tab and client synchronization
  const sseClients = new Set<Response>();

  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if ((res as any).flushHeaders) {
      (res as any).flushHeaders();
    }

    // Initial connection handshake
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
  });

  // Heartbeat ping every 25 seconds to keep connection alive through proxies
  setInterval(() => {
    for (const client of sseClients) {
      try {
        client.write(': ping\n\n');
      } catch (e) {
        sseClients.delete(client);
      }
    }
  }, 25000);

  // Broadcast any database change to all connected clients immediately
  onDBChange(event => {
    const payload = `data: ${JSON.stringify({ type: 'data_changed', ...event })}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch (e) {
        sseClients.delete(client);
      }
    }

    // Realtime synchronization to Firebase Cloud Firestore for user
    const defaultUser = getDefaultUser();
    syncUserDataToFirebase(defaultUser.id, db).catch(err => {
      console.warn('Background Firebase sync error:', err?.message || err);
    });
  });

  // Initial sync to Firebase on server startup
  const startupUser = getDefaultUser();
  syncUserDataToFirebase(startupUser.id, db).catch(() => {});

  // Firebase Realtime Status & Manual Trigger
  app.get('/api/firebase/status', (req: Request, res: Response) => {
    res.json(getFirebaseStatus());
  });

  app.post('/api/firebase/sync', authMiddleware, async (req: Request, res: Response) => {
    const user = (req as any).user;
    const result = await syncUserDataToFirebase(user.id, db);
    res.json({ ...result, ...getFirebaseStatus() });
  });

  // Auth
  app.post('/api/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Vui lòng cung cấp địa chỉ email.' });
      return;
    }

    const result = validateUserLogin(email, password);
    if (!result.success || !result.user) {
      res.status(401).json({ error: result.error || 'Đăng nhập không thành công.' });
      return;
    }

    const user = result.user;
    const token = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, time: Date.now() })).toString('base64');
    const config = db.userConfigs[user.id] || {
      userId: user.id,
      dailyDigestTime: '08:00',
      emailEnabled: false,
      targetEmail: user.email,
      discreteMode: false,
    };

    res.json({ token, user, config });
  });

  app.post('/api/auth/register', (req: Request, res: Response) => {
    const { email, password, name } = req.body;
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Vui lòng cung cấp email hợp lệ.' });
      return;
    }

    const normalized = email.trim().toLowerCase();
    const existing = findUserByEmail(normalized);
    if (existing) {
      res.status(400).json({ error: 'Tài khoản email này đã tồn tại. Vui lòng đăng nhập.' });
      return;
    }

    if (password && password.length < 6) {
      res.status(400).json({ error: 'Mật khẩu cần tối thiểu 6 ký tự.' });
      return;
    }

    const newUser = createUser(normalized, name, password);
    const token = Buffer.from(JSON.stringify({ userId: newUser.id, email: newUser.email, time: Date.now() })).toString('base64');
    const config = db.userConfigs[newUser.id];

    res.status(201).json({ token, user: newUser, config });
  });

  app.post('/api/auth/google-login', (req: Request, res: Response) => {
    const { email, name, avatarUrl } = req.body;
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'Email Google không hợp lệ.' });
      return;
    }

    const normalized = email.trim().toLowerCase();
    let user = findUserByEmail(normalized);
    if (!user) {
      user = createUser(normalized, name);
    }
    if (avatarUrl && !user.avatarUrl) {
      user.avatarUrl = avatarUrl;
    }
    user.lastLoginAt = new Date().toISOString();
    saveDB();

    const token = Buffer.from(JSON.stringify({ userId: user.id, email: user.email, time: Date.now() })).toString('base64');
    const config = db.userConfigs[user.id];

    res.json({ token, user, config });
  });

  app.post('/api/auth/change-password', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const { oldPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Mật khẩu mới cần tối thiểu 6 ký tự.' });
      return;
    }

    if (user.passwordHash) {
      const hashedOld = hashPassword(oldPassword || '');
      if (user.passwordHash !== hashedOld) {
        res.status(400).json({ error: 'Mật khẩu hiện tại không chính xác.' });
        return;
      }
    }

    updateUserPassword(user.id, newPassword);
    res.json({ success: true, message: 'Đổi mật khẩu thành công.' });
  });

  app.post('/api/auth/logout', authMiddleware, (req: Request, res: Response) => {
    res.json({ success: true, message: 'Đã đăng xuất.' });
  });

  app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const config = db.userConfigs[user.id] || {
      userId: user.id,
      dailyDigestTime: '08:00',
      emailEnabled: false,
      targetEmail: user.email,
      discreteMode: false,
    };
    res.json({ user, config });
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
    const { dailyDigestTime, emailEnabled, targetEmail, discreteMode, smtpHost, smtpPort, smtpUser, smtpPass } = req.body;

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
    if (smtpHost !== undefined) config.smtpHost = smtpHost;
    if (smtpPort !== undefined) config.smtpPort = Number(smtpPort);
    if (smtpUser !== undefined) config.smtpUser = smtpUser;
    if (smtpPass !== undefined) config.smtpPass = smtpPass;

    db.userConfigs[user.id] = config;
    saveDB();
    res.json(config);
  });

  // Reset / Reseed 40 Sample Cards
  app.post('/api/settings/seed-40-cards', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user;
    const result = seed40Cards(user.id, true);
    res.json({ success: true, ...result });
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

  // -------------------------------------------------------------
  // Vite Middleware & Static Serving Setup
  // -------------------------------------------------------------
  const distPath = path.join(process.cwd(), 'dist');
  const hasDist = fs.existsSync(path.join(distPath, 'index.html'));
  const isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'dev';
  const isProduction = process.env.NODE_ENV === 'production' || (!isDev && hasDist);

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static frontend assets for both root and GitHub Pages base prefix
    app.use('/THANHTOAN4300', express.static(distPath));
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Fatal error starting server:', err);
});

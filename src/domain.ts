import type { Card, Obligation, Payment, AuditLog, UserConfig, NotificationLog, ObligationViewItem, MonthSummary, PaymentStatus, DueDateStatus } from './types';
import { getCurrentDateStr, diffDays, addDays, getDaysInMonth, pad2 } from './utils/dateUtils';
export interface Snapshot { cards: Card[]; obligations: Obligation[]; payments: Payment[]; auditLogs: AuditLog[]; notifications: NotificationLog[]; config: UserConfig; }
export function enrichObligation(db: Snapshot, obl: Obligation, userId: string): ObligationViewItem {
  const card = db.cards.find(c => c.id === obl.cardId && c.userId === userId) || {
    name: 'Thẻ không xác định',
    bankName: 'Ngân hàng',
    status: 'archived' as const,
    autoWeekendShift: false,
    defaultDueDay: obl.dueDay,
  };

  const payments = db.payments.filter(p => p.obligationId === obl.id && p.status === 'VALID');
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const remainingAmount = obl.dataState === 'DECLARED' ? Math.max(0, obl.amount - totalPaid) : 0;

  // Payment status
  let paymentStatus: PaymentStatus = 'UNDETERMINED';
  if (obl.dataState === 'NO_EXPENSE') {
    paymentStatus = 'NOT_APPLICABLE';
  } else if (obl.dataState === 'UNUPDATED') {
    paymentStatus = 'UNDETERMINED';
  } else if (totalPaid === 0) {
    paymentStatus = 'UNPAID';
  } else if (totalPaid < obl.amount) {
    paymentStatus = 'PARTIAL';
  } else {
    paymentStatus = 'PAID';
  }

  // Due Date status
  const today = getCurrentDateStr();
  let dueDateStatus: DueDateStatus = 'NOT_DUE';
  const diff = diffDays(today, obl.actualDueDate); // > 0 if dueDate is in future, < 0 if in past, 0 if today

  if (obl.dataState === 'UNUPDATED') {
    if (diff < 0) {
      dueDateStatus = 'OVERDUE_UNUPDATED';
    } else if (diff === 0) {
      dueDateStatus = 'DUE_TODAY';
    } else if (diff <= 7) {
      dueDateStatus = 'UPCOMING';
    } else {
      dueDateStatus = 'NOT_DUE';
    }
  } else if (obl.dataState === 'NO_EXPENSE' || paymentStatus === 'PAID') {
    dueDateStatus = 'NOT_DUE';
  } else {
    // DECLARED and still has remaining debt
    if (diff < 0) {
      dueDateStatus = 'OVERDUE';
    } else if (diff === 0) {
      dueDateStatus = 'DUE_TODAY';
    } else if (diff <= 7) {
      dueDateStatus = 'UPCOMING';
    } else {
      dueDateStatus = 'NOT_DUE';
    }
  }

  // Check weekend friday suggestion
  const day = new Date(obl.actualDueDate + 'T00:00:00Z').getUTCDay();
  const weekend = day === 0 || day === 6;
  const friday = weekend ? addDays(obl.actualDueDate, day === 0 ? -2 : -1) : undefined;

  return {
    ...obl,
    cardName: card.name,
    bankName: card.bankName,
    cardStatus: card.status,
    totalPaid,
    remainingAmount,
    paymentStatus,
    dueDateStatus,
    payments,
    isWeekendFridaySuggested: weekend && obl.dueDateSource !== 'WEEKEND_FRIDAY_SUGGESTION',
    suggestedFridayDate: friday,
  };
}

/**
 * Generate Summary Statistics for a month
 */
export function getMonthSummary(db: Snapshot, userId: string, targetMonth: string): MonthSummary {

  const obligations = db.obligations.filter(o => o.userId === userId && o.month === targetMonth);
  const enriched = obligations.map(o => enrichObligation(db, o, userId));

  const totalCardsTracked = enriched.length;
  let totalObligationDeclared = 0;
  let totalPaidForMonthObligations = 0;
  let totalRemaining = 0;
  let totalOverdueAmount = 0;
  let unupdatedCardsCount = 0;
  let noExpenseCardsCount = 0;
  let fullyPaidCardsCount = 0;
  let partialPaidCardsCount = 0;
  let unpaidCardsCount = 0;

  for (const item of enriched) {
    if (item.dataState === 'UNUPDATED') {
      unupdatedCardsCount++;
    } else if (item.dataState === 'NO_EXPENSE') {
      noExpenseCardsCount++;
    } else if (item.dataState === 'DECLARED') {
      totalObligationDeclared += item.amount;
      totalPaidForMonthObligations += item.totalPaid;
      totalRemaining += item.remainingAmount;

      if (item.dueDateStatus === 'OVERDUE') {
        totalOverdueAmount += item.remainingAmount;
      }

      if (item.paymentStatus === 'PAID') {
        fullyPaidCardsCount++;
      } else if (item.paymentStatus === 'PARTIAL') {
        partialPaidCardsCount++;
      } else if (item.paymentStatus === 'UNPAID') {
        unpaidCardsCount++;
      }
    }
  }

  // Actual cashflow paid in this calendar month (actual payments made with paidDate in this month)
  const actualCashflowPayments = db.payments.filter(
    p => p.userId === userId && p.status === 'VALID' && p.paidDate.startsWith(targetMonth)
  );
  const actualCashflowPaidInMonth = actualCashflowPayments.reduce((s, p) => s + p.amount, 0);

  // Today and next 7 days
  const today = getCurrentDateStr();
  const dueToday = enriched.filter(e => e.actualDueDate === today && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'NOT_APPLICABLE');
  const upcomingDueNext7Days = enriched.filter(e => {
    const d = diffDays(today, e.actualDueDate);
    return d > 0 && d <= 7 && e.paymentStatus !== 'PAID' && e.paymentStatus !== 'NOT_APPLICABLE';
  });

  const overdueObligations = enriched.filter(e => e.dueDateStatus === 'OVERDUE' || e.dueDateStatus === 'OVERDUE_UNUPDATED');
  const unupdatedObligations = enriched.filter(e => e.dataState === 'UNUPDATED');

  // "Khoản tồn từ kỳ trước": All past months obligations (month < targetMonth) that still have remaining balance!
  const pastObls = db.obligations
    .filter(o => o.userId === userId && o.month < targetMonth)
    .map(o => enrichObligation(db, o, userId))
    .filter(e => e.dataState === 'DECLARED' && e.remainingAmount > 0);

  const isFullyUpdated = unupdatedCardsCount === 0;

  return {
    month: targetMonth,
    totalCardsTracked,
    totalObligationDeclared,
    totalPaidForMonthObligations,
    totalRemaining,
    totalOverdueAmount,
    unupdatedCardsCount,
    noExpenseCardsCount,
    fullyPaidCardsCount,
    partialPaidCardsCount,
    unpaidCardsCount,
    actualCashflowPaidInMonth,
    upcomingDueNext7Days,
    dueToday,
    overdueObligations,
    unupdatedObligations,
    priorUnpaidObligations: pastObls,
    isFullyUpdated,
  };
}

export function matrixMonth(db: Snapshot, userId: string, year: number, month: number) {
  const ym = `${year}-${pad2(month)}`;
  const totalDays = getDaysInMonth(year, month);
  const dayColumns = Array.from({length: totalDays}, (_,i) => {
    const day = i+1, dow = new Date(Date.UTC(year, month-1, day)).getUTCDay();
    return { day, dateStr: `${ym}-${pad2(day)}`, isWeekend: dow === 0 || dow === 6, dayOfWeek: ['CN','T2','T3','T4','T5','T6','T7'][dow] };
  });
  const dailyTotals: Record<number, any> = Object.fromEntries(dayColumns.map(d => [d.day,{declared:0,remaining:0,cardCount:0,unupdatedCount:0}]));
  const rows = db.cards.filter(c => c.status === 'active' || db.obligations.some(o => o.cardId===c.id && o.month===ym)).map(card => {
    const raw=db.obligations.find(o=>o.cardId===card.id && o.month===ym);
    const obligation=raw?enrichObligation(db,raw,userId):null;
    // A manual date or Friday shift may belong to another month: never put it on a wrong day column.
    if(obligation && obligation.actualDueDate.startsWith(ym)) {
      const t=dailyTotals[Number(obligation.actualDueDate.slice(-2))];
      if(t) { t.cardCount++; if(obligation.dataState==='DECLARED'){t.declared+=obligation.amount;t.remaining+=obligation.remainingAmount;} if(obligation.dataState==='UNUPDATED')t.unupdatedCount++; }
    }
    return {card,obligation};
  });
  return {year,month,totalDays,dayColumns,dailyTotals,rows};
}
export function matrixYear(db: Snapshot,userId: string,year: number) {
  const monthlyTotals: Record<number, any> = {};
  for(let m=1;m<=12;m++)monthlyTotals[m]={declared:0,paid:0,remaining:0,cardCount:0,unupdatedCount:0};
  const matrix=db.cards.filter(c=>c.status==='active'||db.obligations.some(o=>o.cardId===c.id&&o.month.startsWith(`${year}-`))).map(card=>{
    const months: Record<number,any>={};let totalYearObligation=0,totalYearPaid=0;
    for(let m=1;m<=12;m++){
      const raw=db.obligations.find(o=>o.cardId===card.id&&o.month===`${year}-${pad2(m)}`);
      if(!raw){months[m]=null;continue;}
      const o=enrichObligation(db,raw,userId),t=monthlyTotals[m];
      months[m]={obligation:o,obligationId:o.id,dataState:o.dataState,amount:o.amount,totalPaid:o.totalPaid,remaining:o.remainingAmount,status:o.paymentStatus,actualDueDate:o.actualDueDate,dueDay:o.dueDay};
      totalYearObligation+=o.amount;totalYearPaid+=o.totalPaid;t.cardCount++;
      if(o.dataState==='DECLARED'){t.declared+=o.amount;t.paid+=o.totalPaid;t.remaining+=o.remainingAmount;}if(o.dataState==='UNUPDATED')t.unupdatedCount++;
    }
    return {card,months,totalYearObligation,totalYearPaid,totalYearRemaining:totalYearObligation-totalYearPaid};
  });
  const declared=matrix.reduce((s,r)=>s+r.totalYearObligation,0),paid=matrix.reduce((s,r)=>s+r.totalYearPaid,0);
  return {year,matrix,monthlyTotals,grandTotal:{declared,paid,remaining:declared-paid}};
}

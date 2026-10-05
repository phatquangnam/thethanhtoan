export type CardStatus = 'active' | 'archived';

export type ObligationDataState = 'UNUPDATED' | 'DECLARED' | 'NO_EXPENSE';

export type PaymentStatus = 
  | 'UNPAID'       // Chưa thanh toán (amount > 0, paid == 0)
  | 'PARTIAL'      // Thanh toán một phần (0 < paid < amount)
  | 'PAID'         // Đã thanh toán đủ (paid == amount)
  | 'NOT_APPLICABLE' // Không phát sinh (amount == 0)
  | 'UNDETERMINED'; // Chưa xác định (chưa cập nhật số tiền)

export type DueDateStatus = 
  | 'NOT_DUE'      // Chưa đến hạn (> 7 ngày)
  | 'UPCOMING'     // Sắp đến hạn (1-7 ngày)
  | 'DUE_TODAY'    // Đến hạn hôm nay
  | 'OVERDUE'      // Quá hạn
  | 'OVERDUE_UNUPDATED'; // Chưa cập nhật — đã qua ngày dự kiến đến hạn

export type DueDateSource = 'DEFAULT' | 'MANUAL_OVERRIDE' | 'MONTH_END_FALLBACK' | 'WEEKEND_FRIDAY_SUGGESTION';

export type ReminderSource = 'CUSTOM' | 'MEDIAN_DECLARATION' | 'MEDIAN_PAYMENT' | 'DEFAULT_7_DAYS';

export interface Card {
  id: string;
  userId: string;
  name: string;
  bankName: string;
  defaultDueDay: number; // 1 - 31
  status: CardStatus;
  autoWeekendShift: boolean; // Auto shift Sat/Sun to preceding Friday
  startTrackingMonth: string; // YYYY-MM
  customReminderDays?: number[]; // e.g. [7, 3, 1, 0]
  customUpdateReminderDaysBefore?: number | null; // e.g. 7
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Obligation {
  id: string;
  userId: string;
  cardId: string;
  month: string; // YYYY-MM
  dataState: ObligationDataState;
  amount: number; // VND integer, 0 if NO_EXPENSE or UNUPDATED
  dueDay: number; // Day of month 1-31
  actualDueDate: string; // YYYY-MM-DD
  dueDateSource: DueDateSource;
  isEstimatedDue: boolean; // true if adjusted e.g. day 31 in Feb
  firstDeclaredAt: string | null;
  noExpenseConfirmedAt: string | null;
  updateReminderDate: string | null; // YYYY-MM-DD
  updateReminderSource: ReminderSource;
  updateReminderReason: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  userId: string;
  obligationId: string;
  cardId: string;
  amount: number; // VND integer
  paidDate: string; // YYYY-MM-DD
  createdAt: string; // ISO
  notes?: string;
  referenceCode?: string;
  receiptUrl?: string | null;
  status: 'VALID' | 'CANCELLED';
  cancellationReason?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  entityType: 'OBLIGATION' | 'PAYMENT' | 'CARD' | 'SYSTEM';
  entityId: string;
  action: 
    | 'CREATE'
    | 'UPDATE'
    | 'UPDATE_AMOUNT'
    | 'CONFIRM_NO_EXPENSE'
    | 'ADJUST_PAYMENT'
    | 'CANCEL_PAYMENT'
    | 'UPDATE_DUE_DATE'
    | 'RESTORE'
    | 'WEEKEND_SHIFT'
    | 'DELETE';
  previousValue: any;
  newValue: any;
  reason?: string;
  createdAt: string;
}

export interface NotificationLog {
  id: string;
  userId: string;
  type: 'MISSING_UPDATE' | 'PAYMENT_REMINDER' | 'OVERDUE_ALERT' | 'DAILY_DIGEST';
  cardId?: string;
  obligationId?: string;
  channel: 'IN_APP' | 'EMAIL';
  title: string;
  content: string;
  isDiscrete: boolean;
  sentAt: string;
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  read: boolean;
  snoozedUntil?: string | null;
}

export interface UserConfig {
  userId: string;
  dailyDigestTime: string; // "08:00"
  emailEnabled: boolean;
  targetEmail: string;
  discreteMode: boolean; // hide balances on external notifications

}

export interface User {
  id: string;
  username: string;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: string;
}

// Computed view item for an obligation
export interface ObligationViewItem extends Obligation {
  cardName: string;
  bankName: string;
  cardStatus: CardStatus;
  totalPaid: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  dueDateStatus: DueDateStatus;
  payments: Payment[];
  isWeekendFridaySuggested?: boolean;
  suggestedFridayDate?: string;
}

// Month overview summary statistics
export interface MonthSummary {
  month: string; // YYYY-MM
  totalCardsTracked: number;
  totalObligationDeclared: number;
  totalPaidForMonthObligations: number;
  totalRemaining: number;
  totalOverdueAmount: number;
  unupdatedCardsCount: number;
  noExpenseCardsCount: number;
  fullyPaidCardsCount: number;
  partialPaidCardsCount: number;
  unpaidCardsCount: number;
  actualCashflowPaidInMonth: number; // Actual money outflow in this calendar month
  upcomingDueNext7Days: ObligationViewItem[];
  dueToday: ObligationViewItem[];
  overdueObligations: ObligationViewItem[];
  unupdatedObligations: ObligationViewItem[];
  priorUnpaidObligations: ObligationViewItem[]; // Khoản tồn từ kỳ trước
  isFullyUpdated: boolean;
}

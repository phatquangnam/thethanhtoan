import {
  Card,
  ObligationViewItem,
  MonthSummary,
  User,
  UserConfig,
  NotificationLog,
  AuditLog,
  AuthResponse,
} from './types.ts';
import { supabase } from './supabase.ts';

const TOKEN_KEY = 'so_the_auth_token';
const USER_KEY = 'so_the_auth_user';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(token: string, user: User): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('Error saving session', e);
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (e) {
    console.error('Error clearing session', e);
  }
}

async function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(init.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    headers,
  });
}

export const api = {
  // Authentication
  getStoredToken,
  getStoredUser,
  setStoredSession,
  clearStoredSession,

  async loginWithEmail(email: string, password?: string): Promise<AuthResponse> {
    if (!password) throw new Error('Vui lòng nhập mật khẩu.');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const me = await this.getMe();
    setStoredSession(data.session.access_token, me.user);
    return { token: data.session.access_token, ...me };
  },

  async registerWithEmail(email: string, password?: string, name?: string): Promise<AuthResponse> {
    if (!password || password.length < 8) throw new Error('Mật khẩu cần ít nhất 8 ký tự.');
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) throw error;
    if (!data.session) throw new Error('Đã gửi email xác nhận. Hãy mở email, xác nhận tài khoản rồi đăng nhập.');
    const me = await this.getMe();
    setStoredSession(data.session.access_token, me.user);
    return { token: data.session.access_token, ...me };
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) throw new Error('Phiên đăng nhập đã hết hạn.');
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPassword });
    if (verifyError) throw new Error('Mật khẩu hiện tại không chính xác.');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async logout(): Promise<void> {
    await supabase.auth.signOut();
    clearStoredSession();
  },

  async getMe(): Promise<{ user: User; config: UserConfig }> {
    const res = await authFetch('/api/auth/me');
    if (!res.ok) throw new Error('Không thể tải thông tin tài khoản');
    const data = await res.json();
    if (data.user) {
      // update stored user data with latest
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setStoredSession(session.access_token, data.user);
    }
    return data;
  },

  async getMonthSummary(month: string): Promise<MonthSummary> {
    const res = await authFetch(`/api/summary/${month}`);
    if (!res.ok) throw new Error('Không thể tải tổng quan tháng');
    return res.json();
  },

  async getCards(): Promise<Card[]> {
    const res = await authFetch('/api/cards');
    if (!res.ok) throw new Error('Không thể tải danh mục thẻ');
    return res.json();
  },

  async createCard(data: Partial<Card>): Promise<Card> {
    const res = await authFetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi thêm thẻ mới');
    }
    return res.json();
  },

  async updateCard(id: string, data: Partial<Card> & { applyDueDayFromMonth?: string }): Promise<Card> {
    const res = await authFetch(`/api/cards/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi cập nhật thẻ');
    }
    return res.json();
  },

  async deleteCard(id: string): Promise<{ success: boolean; deletedCardId: string }> {
    const res = await authFetch(`/api/cards/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi xóa thẻ');
    }
    return res.json();
  },

  async deleteBatchCards(cardIds: string[]): Promise<{ success: boolean; count: number; deletedCardIds: string[] }> {
    const res = await authFetch('/api/cards/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardIds }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi xóa hàng loạt thẻ');
    }
    return res.json();
  },

  async getObligations(month: string): Promise<ObligationViewItem[]> {
    const res = await authFetch(`/api/obligations?month=${month}`);
    if (!res.ok) throw new Error('Không thể tải danh sách nghĩa vụ');
    return res.json();
  },

  async updateObligation(id: string, data: { amount?: number; actualDueDate?: string; notes?: string; reason?: string }): Promise<ObligationViewItem> {
    const res = await authFetch(`/api/obligations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi cập nhật nghĩa vụ');
    }
    return res.json();
  },

  async confirmNoExpense(id: string): Promise<ObligationViewItem> {
    const res = await authFetch(`/api/obligations/${id}/confirm-no-expense`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi xác nhận không phát sinh');
    }
    return res.json();
  },

  async batchUpdateObligations(updates: any[], reason?: string): Promise<{ success: boolean; updatedCount: number; updated: ObligationViewItem[]; errors: any[] }> {
    const res = await authFetch('/api/obligations/batch-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, reason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi cập nhật hàng loạt');
    }
    return res.json();
  },

  async applyWeekendShift(id: string): Promise<ObligationViewItem> {
    const res = await authFetch(`/api/obligations/${id}/apply-weekend-shift`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi áp dụng chuyển ngày sang thứ 6');
    }
    return res.json();
  },

  async recordPayment(data: {
    obligationId: string;
    amount: number;
    paidDate: string;
    notes?: string;
    referenceCode?: string;
    receiptUrl?: string | null;
    declaredAmount?: number;
  }): Promise<{ payment: any; updatedObligation: ObligationViewItem }> {
    const res = await authFetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi ghi nhận thanh toán');
    }
    return res.json();
  },

  async cancelPayment(paymentId: string, cancellationReason: string): Promise<{ payment: any; updatedObligation: ObligationViewItem }> {
    const res = await authFetch(`/api/payments/${paymentId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancellationReason }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi hủy giao dịch');
    }
    return res.json();
  },

  async getMatrixMonth(year: number, month: number): Promise<any> {
    const res = await authFetch(`/api/matrix/${year}/${month}`);
    if (!res.ok) throw new Error('Không thể tải ma trận tháng');
    return res.json();
  },

  async getMatrixYear(year: number): Promise<any> {
    const res = await authFetch(`/api/matrix/year/${year}`);
    if (!res.ok) throw new Error('Không thể tải ma trận năm');
    return res.json();
  },

  async getCalendarEvents(year: number, month: number): Promise<any> {
    const res = await authFetch(`/api/calendar/${year}/${month}`);
    if (!res.ok) throw new Error('Không thể tải lịch thanh toán');
    return res.json();
  },

  async getNotifications(): Promise<{ notifications: NotificationLog[]; unreadCount: number }> {
    const res = await authFetch('/api/notifications');
    if (!res.ok) throw new Error('Không thể tải thông báo');
    return res.json();
  },

  async markNotificationRead(id: string): Promise<any> {
    const res = await authFetch(`/api/notifications/${id}/read`, { method: 'POST' });
    return res.json();
  },

  async markAllNotificationsRead(): Promise<any> {
    const res = await authFetch('/api/notifications/mark-all-read', { method: 'POST' });
    return res.json();
  },

  async triggerReminderCheck(): Promise<any> {
    const res = await authFetch('/api/notifications/run-check', { method: 'POST' });
    return res.json();
  },

  async updateSettings(config: Partial<UserConfig>): Promise<UserConfig> {
    const res = await authFetch('/api/settings/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error('Không thể cập nhật cấu hình');
    return res.json();
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await authFetch('/api/audit-logs');
    if (!res.ok) throw new Error('Không thể tải nhật ký điều chỉnh');
    return res.json();
  },

  async runTestCases(): Promise<any> {
    const res = await authFetch('/api/tests/run-all');
    if (!res.ok) throw new Error('Lỗi chạy kiểm thử hệ thống');
    return res.json();
  },

  async exportBackup(): Promise<Blob> {
    const res = await authFetch('/api/backup/export');
    if (!res.ok) throw new Error('Không thể tải bản sao lưu');
    return res.blob();
  },

  async importBackup(data: unknown): Promise<any> {
    const res = await authFetch('/api/backup/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Dữ liệu sao lưu không hợp lệ');
    }
    return res.json();
  },

  async importBatchCards(cards: any[], replaceExisting: boolean = true): Promise<any> {
    const res = await authFetch('/api/cards/import-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards, replaceExisting }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Lỗi import danh sách thẻ');
    }
    return res.json();
  },

};

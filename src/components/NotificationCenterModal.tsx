import React from 'react';
import {
  X,
  Bell,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CheckCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { NotificationLog } from '../types.ts';
import { formatDateVN } from '../utils/dateUtils.ts';

interface NotificationCenterModalProps {
  notifications: NotificationLog[];
  onClose: () => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onTriggerCheck: () => Promise<void>;
  isLoading: boolean;
}

export const NotificationCenterModal: React.FC<NotificationCenterModalProps> = ({
  notifications,
  onClose,
  onMarkRead,
  onMarkAllRead,
  onTriggerCheck,
  isLoading,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Trung tâm thông báo & Nhắc việc</h3>
              <p className="text-xs text-slate-500">
                Lịch sử các thông báo nhắc hạn và cảnh báo thẻ chưa cập nhật
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
          <span className="text-slate-500 font-medium">{notifications.length} thông báo</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onTriggerCheck}
              disabled={isLoading}
              className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Quét ngay</span>
            </button>
            <span className="text-slate-300">•</span>
            <button
              onClick={onMarkAllRead}
              className="text-slate-600 hover:text-slate-900 font-semibold flex items-center gap-1"
            >
              <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đánh dấu đã đọc hết</span>
            </button>
          </div>
        </div>

        {/* List */}
        <div className="p-5 space-y-2.5 overflow-y-auto flex-1">
          {notifications.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-50" />
              Chưa có thông báo nào.
            </div>
          ) : (
            notifications.map(notif => {
              let icon = <Clock className="w-4 h-4 text-amber-600" />;
              let border = 'border-slate-200';
              if (notif.type === 'PAYMENT_REMINDER') {
                icon = <AlertTriangle className="w-4 h-4 text-rose-600" />;
                border = 'border-rose-200 bg-rose-50/30';
              } else if (notif.type === 'OVERDUE_ALERT') {
                icon = <AlertTriangle className="w-4 h-4 text-red-600" />;
                border = 'border-red-200 bg-red-50/40';
              } else if (notif.type === 'MISSING_UPDATE') {
                icon = <Bell className="w-4 h-4 text-purple-600" />;
                border = 'border-purple-200 bg-purple-50/30';
              }

              return (
                <div
                  key={notif.id}
                  onClick={() => onMarkRead(notif.id)}
                  className={`p-3 rounded-2xl border text-xs cursor-pointer transition-all hover:shadow-xs flex items-start justify-between gap-3 ${
                    notif.read ? 'bg-white opacity-70' : `${border} font-medium`
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-1.5 rounded-xl bg-white shadow-2xs mt-0.5">{icon}</div>
                    <div>
                      <h4 className="font-bold text-slate-900">{notif.title}</h4>
                      <p className="text-slate-600 text-[11px] mt-0.5">{notif.content}</p>
                      <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                        {new Date(notif.sentAt).toLocaleString('vi-VN', {timeZone:'Asia/Ho_Chi_Minh'})} · {notif.channel === 'EMAIL' ? (notif.status === 'SUCCESS' ? 'Email đã gửi' : notif.status === 'FAILED' ? 'Email gửi lỗi' : 'Email chờ gửi') : 'Trong ứng dụng'}
                      </span>
                    </div>
                  </div>

                  {!notif.read && (
                    <span className="h-2 w-2 rounded-full bg-indigo-600 shrink-0 mt-2"></span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

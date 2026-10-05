import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  Calendar,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Edit2,
  CalendarDays,
  History,
  Sparkles,
  Info,
} from 'lucide-react';
import { ObligationViewItem } from '../types.ts';
import { formatVND, formatDateVN, parseVNDInput } from '../utils/dateUtils.ts';

interface ObligationDetailModalProps {
  obligation: ObligationViewItem;
  discreteMode: boolean;
  onClose: () => void;
  onUpdateObligation: (id: string, data: { amount?: number; actualDueDate?: string; notes?: string; reason?: string }) => Promise<void>;
  onConfirmNoExpense: (id: string) => Promise<void>;
  onApplyWeekendShift: (id: string) => Promise<void>;
  onOpenPaymentModal: (item: ObligationViewItem) => void;
}

export const ObligationDetailModal: React.FC<ObligationDetailModalProps> = ({
  obligation,
  discreteMode,
  onClose,
  onUpdateObligation,
  onConfirmNoExpense,
  onApplyWeekendShift,
  onOpenPaymentModal,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [amountStr, setAmountStr] = useState(obligation.dataState === 'DECLARED' ? obligation.amount.toLocaleString('vi-VN') : '');
  const [actualDueDate, setActualDueDate] = useState(obligation.actualDueDate);
  const [notes, setNotes] = useState(obligation.notes || '');
  const [editReason, setEditReason] = useState('Điều chỉnh số tiền cần thanh toán theo sao kê');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmountStr(obligation.dataState === 'DECLARED' ? obligation.amount.toLocaleString('vi-VN') : '');
    setActualDueDate(obligation.actualDueDate);
    setNotes(obligation.notes || '');
    setError(null);
  }, [obligation]);

  const handleSaveEdit = async () => {
    const num = parseVNDInput(amountStr);
    if (num <= 0) {
      setError('Số tiền phải lớn hơn 0 hoặc chọn nút "Xác nhận không phát sinh".');
      return;
    }
    if (num < obligation.totalPaid) {
      setError(`Không thể chỉnh số tiền nhỏ hơn số tiền đã thanh toán (${obligation.totalPaid.toLocaleString('vi-VN')} ₫).`);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onUpdateObligation(obligation.id, {
        amount: num,
        actualDueDate,
        notes,
        reason: editReason,
      });
      setIsEditing(false);
    } catch (err: any) {
      setError(err.message || 'Lỗi lưu thay đổi');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmZero = async () => {
    if (obligation.totalPaid > 0) {
      setError('Không thể xác nhận "Không phát sinh" khi đã có các bản ghi thanh toán ghi nhận trong kỳ.');
      return;
    }
    setError(null);
    try {
      await onConfirmNoExpense(obligation.id);
    } catch (err: any) {
      setError(err.message || 'Lỗi khi xác nhận không phát sinh');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{obligation.cardName}</h3>
              <p className="text-xs text-slate-500">
                {obligation.bankName} • Kỳ thanh toán {obligation.month}
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

        {/* Content */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Status summary banner */}
          <div className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-between">
            <div>
              <span className="text-slate-400 block text-[11px]">Trạng thái dữ liệu</span>
              <span className="font-bold text-slate-900 text-sm">
                {obligation.dataState === 'UNUPDATED' ? (
                  <span className="text-purple-600">Chưa cập nhật số tiền</span>
                ) : obligation.dataState === 'NO_EXPENSE' ? (
                  <span className="text-slate-600">Không phát sinh chi tiêu (0 ₫)</span>
                ) : (
                  <span className="text-emerald-600">Đã khai báo số tiền</span>
                )}
              </span>
            </div>

            <div className="text-right">
              <span className="text-slate-400 block text-[11px]">Thanh toán</span>
              <span className="font-bold text-sm">
                {obligation.paymentStatus === 'PAID' ? (
                  <span className="text-emerald-600">Đã thanh toán đủ</span>
                ) : obligation.paymentStatus === 'PARTIAL' ? (
                  <span className="text-sky-600">Trả một phần</span>
                ) : (
                  <span className="text-rose-600">Chưa thanh toán</span>
                )}
              </span>
            </div>
          </div>

          {/* Key Dates & Prediction Explanation (Mục 8) */}
          <div className="space-y-2 border border-slate-200 rounded-2xl p-3.5 bg-white">
            <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Thông tin ngày hạn & Dự đoán mốc nhắc cập nhật</span>
            </h4>

            <div className="grid grid-cols-2 gap-3 text-slate-600">
              <div>
                <span className="text-slate-400 block">Ngày đến hạn thực tế:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {formatDateVN(obligation.actualDueDate)} (Ngày {obligation.dueDay})
                </span>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Nguồn: {obligation.dueDateSource}
                  {obligation.isEstimatedDue && ' (Dự kiến do tháng thiếu ngày/nhuận)'}
                </div>
              </div>

              <div>
                <span className="text-slate-400 block">Mốc nhắc cập nhật dự đoán:</span>
                <span className="font-bold text-indigo-700 font-mono">
                  {formatDateVN(obligation.updateReminderDate)}
                </span>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {obligation.updateReminderReason || 'Mặc định'}
                </div>
              </div>
            </div>

            {/* Weekend Shift Suggestion Button */}
            {obligation.isWeekendFridaySuggested && (
              <div className="mt-2 p-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-amber-900">
                <span className="text-[11px]">
                  Hạn rơi vào cuối tuần. Bạn có muốn dời theo dõi sang thứ 6 trước đó?
                </span>
                <button
                  onClick={() => onApplyWeekendShift(obligation.id)}
                  className="px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] transition-colors"
                >
                  Dời thứ 6
                </button>
              </div>
            )}
          </div>

          {/* Amounts view or edit */}
          {!isEditing ? (
            <div className="border border-slate-200 rounded-2xl p-4 bg-white space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900">Chi tiết số tiền</h4>
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Sửa số tiền / Ghi chú</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-xl">
                <div>
                  <span className="text-slate-400 block text-[11px]">Nghĩa vụ tháng</span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {obligation.dataState === 'UNUPDATED'
                      ? 'Chưa cập nhật'
                      : formatVND(obligation.amount, discreteMode)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Đã thanh toán</span>
                  <span className="font-mono font-bold text-sm text-emerald-600">
                    {formatVND(obligation.totalPaid, discreteMode)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Còn nợ</span>
                  <span className="font-mono font-bold text-sm text-rose-600">
                    {obligation.dataState === 'UNUPDATED'
                      ? '—'
                      : formatVND(obligation.remainingAmount, discreteMode)}
                  </span>
                </div>
              </div>

              {obligation.notes && (
                <div className="text-slate-600 bg-slate-50 p-2.5 rounded-xl">
                  <span className="font-bold">Ghi chú:</span> {obligation.notes}
                </div>
              )}
            </div>
          ) : (
            /* Editing form */
            <div className="border border-indigo-200 rounded-2xl p-4 bg-indigo-50/30 space-y-3">
              <h4 className="font-bold text-slate-900">Chỉnh sửa số tiền & ghi chú</h4>

              {error && (
                <div className="p-2 rounded-lg bg-red-100 text-red-800 text-xs font-semibold">
                  {error}
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Số tiền cần thanh toán (₫) *</label>
                <input
                  type="text"
                  value={amountStr}
                  onChange={e => {
                    const cleaned = e.target.value.replace(/[^0-9]/g, '');
                    setAmountStr(cleaned ? parseInt(cleaned, 10).toLocaleString('vi-VN') : '');
                  }}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-white"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Lý do điều chỉnh (lưu audit log) *</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white"
                  placeholder="Ví dụ: Nhập theo sao kê ngân hàng..."
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Ghi chú kỳ này</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  Lưu thay đổi
                </button>
              </div>
            </div>
          )}

          {/* Quick Actions Footer */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
            {obligation.dataState !== 'NO_EXPENSE' && (
              <button
                onClick={handleConfirmZero}
                className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold"
              >
                Xác nhận không phát sinh (0 ₫)
              </button>
            )}

            <button
              onClick={() => {
                onClose();
                onOpenPaymentModal(obligation);
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center gap-1.5 ml-auto shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Ghi nhận thanh toán</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

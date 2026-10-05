import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  DollarSign,
  Calendar,
  FileText,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ShieldAlert,
} from 'lucide-react';
import { ObligationViewItem } from '../types.ts';
import { formatVND, formatDateVN, getCurrentDateStr, parseVNDInput } from '../utils/dateUtils.ts';

interface PaymentModalProps {
  obligation: ObligationViewItem;
  discreteMode: boolean;
  onClose: () => void;
  onRecordPayment: (data: {
    obligationId: string;
    amount: number;
    paidDate: string;
    notes?: string;
    referenceCode?: string;
    receiptUrl?: string | null;
    declaredAmount?: number;
    requestId?: string;
  }) => Promise<void>;
  onCancelPayment: (paymentId: string, reason: string) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  obligation,
  discreteMode,
  onClose,
  onRecordPayment,
  onCancelPayment,
}) => {
  const [amountStr, setAmountStr] = useState<string>(
    obligation.remainingAmount > 0 ? obligation.remainingAmount.toLocaleString('vi-VN') : ''
  );
  const [declaredAmountStr, setDeclaredAmountStr] = useState<string>('');
  const [paidDate, setPaidDate] = useState<string>(getCurrentDateStr());
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cancelModalId, setCancelModalId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Keep state synchronized whenever the obligation prop updates
  useEffect(() => {
    setAmountStr(
      obligation.remainingAmount > 0
        ? obligation.remainingAmount.toLocaleString('vi-VN')
        : ''
    );
    setDeclaredAmountStr(obligation.amount > 0 ? obligation.amount.toLocaleString('vi-VN') : '');
    setPaidDate(getCurrentDateStr());
    setError(null);
  }, [obligation]);

  const handleAmountChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    const num = cleaned ? parseInt(cleaned, 10) : 0;
    setAmountStr(cleaned ? num.toLocaleString('vi-VN') : '');
  };

  const handleDeclaredAmountChange = (val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    const num = cleaned ? parseInt(cleaned, 10) : 0;
    setDeclaredAmountStr(cleaned ? num.toLocaleString('vi-VN') : '');
  };

  const handleSetFullAmount = () => {
    setAmountStr(obligation.remainingAmount.toLocaleString('vi-VN'));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseVNDInput(amountStr);

    if (numAmount <= 0) {
      setError('Vui lòng nhập số tiền thanh toán lớn hơn 0.');
      return;
    }

    let numDeclared: number | undefined = undefined;
    if (obligation.dataState === 'UNUPDATED') {
      if (declaredAmountStr) {
        numDeclared = parseVNDInput(declaredAmountStr);
        if (numDeclared < numAmount) {
          setError(
            `Số tiền sao kê (${numDeclared.toLocaleString('vi-VN')} ₫) không thể nhỏ hơn số tiền thanh toán (${numAmount.toLocaleString('vi-VN')} ₫).`
          );
          return;
        }
      } else {
        numDeclared = numAmount;
      }
    } else if (numAmount > obligation.remainingAmount) {
      setError(
        `Số tiền thanh toán (${numAmount.toLocaleString('vi-VN')} ₫) không được vượt quá số dư còn lại (${obligation.remainingAmount.toLocaleString('vi-VN')} ₫).`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onRecordPayment({
        obligationId: obligation.id,
        amount: numAmount,
        paidDate,
        notes,
        referenceCode,
        receiptUrl: receiptUrl || null,
        declaredAmount: numDeclared,
        requestId,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi ghi nhận thanh toán');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancelPayment = async (paymentId: string) => {
    if (!cancelReason.trim()) {
      alert('Vui lòng nhập lý do hủy bản ghi thanh toán.');
      return;
    }
    try {
      await onCancelPayment(paymentId, cancelReason.trim());
      setCancelModalId(null);
      setCancelReason('');
    } catch (err: any) {
      alert(err.message || 'Lỗi khi hủy thanh toán');
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
              <h3 className="font-bold text-slate-900 text-base">Ghi nhận thanh toán thẻ</h3>
              <p className="text-xs text-slate-500">
                {obligation.cardName} • {obligation.bankName} (Kỳ {obligation.month})
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

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1">
          {/* CRITICAL DISCLAIMER (Mục 1 & Mục 6.E) */}
          <div className="p-3 bg-amber-50/80 border border-amber-200/90 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Lưu ý quan trọng: </span>
              Ứng dụng <strong>không tự động chuyển tiền</strong> và không coi thao tác này là xác nhận từ phía ngân hàng. Đây là thao tác ghi nhận vào sổ tay cá nhân của bạn sau khi bạn đã thực hiện thanh toán trên ứng dụng ngân hàng.
            </div>
          </div>

          {/* Debt Summary Pill */}
          <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200/70 text-center">
            <div>
              <span className="text-[11px] text-slate-500 block">Nghĩa vụ kỳ này</span>
              <span className="font-mono font-bold text-sm text-slate-900">
                {formatVND(obligation.amount, discreteMode)}
              </span>
            </div>
            <div className="border-x border-slate-200">
              <span className="text-[11px] text-slate-500 block">Đã thanh toán</span>
              <span className="font-mono font-bold text-sm text-emerald-600">
                {formatVND(obligation.totalPaid, discreteMode)}
              </span>
            </div>
            <div>
              <span className="text-[11px] text-slate-500 block">Còn lại phải trả</span>
              <span className="font-mono font-bold text-sm text-rose-600">
                {formatVND(obligation.remainingAmount, discreteMode)}
              </span>
            </div>
          </div>

          {/* Existing Payments List */}
          {obligation.payments.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-700 mb-2">Các lần thanh toán đã ghi nhận kỳ này:</h4>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {obligation.payments.map((p, idx) => (
                  <div
                    key={p.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-mono font-bold text-emerald-600">
                        +{formatVND(p.amount, discreteMode)}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Ngày {formatDateVN(p.paidDate)}
                        {p.referenceCode ? ` • Mã: ${p.referenceCode}` : ''}
                        {p.notes ? ` • ${p.notes}` : ''}
                      </div>
                    </div>

                    <button
                      onClick={() => setCancelModalId(p.id)}
                      className="p-1 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Hủy bản ghi thanh toán do nhập sai"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment Cancellation Reason Box */}
          {cancelModalId && (
            <div className="p-3 rounded-2xl bg-red-50 border border-red-200 text-xs space-y-2">
              <div className="font-bold text-red-900">Xác nhận hủy bản ghi thanh toán:</div>
              <input
                type="text"
                placeholder="Nhập lý do hủy (ví dụ: Chuyển khoản thất bại, nhập nhầm số tiền)..."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-red-300 rounded-lg text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCancelModalId(null)}
                  className="px-2.5 py-1 text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmCancelPayment(cancelModalId)}
                  className="px-3 py-1 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700"
                >
                  Xác nhận hủy
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          {obligation.remainingAmount > 0 || obligation.dataState === 'UNUPDATED' ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {error}
                </div>
              )}

              {obligation.dataState === 'UNUPDATED' && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-purple-800 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Thẻ chưa khai báo số tiền sao kê kỳ này</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-purple-700">
                    Bạn có thể nhập số tiền sao kê cần thanh toán bên dưới. Nếu chỉ thanh toán một phần, hệ thống sẽ tự động ghi nhận số tiền sao kê và trừ dần số dư.
                  </p>
                  <div>
                    <label className="block text-[11px] font-bold text-purple-900 mb-1">
                      Tổng số tiền theo sao kê kỳ này (₫) *
                    </label>
                    <input
                      type="text"
                      value={declaredAmountStr}
                      onChange={e => handleDeclaredAmountChange(e.target.value)}
                      placeholder="Nhập tổng nợ theo sao kê (để trống sẽ lấy bằng số tiền trả)"
                      className="w-full px-3 py-1.5 rounded-lg border border-purple-300 bg-white font-mono text-xs focus:ring-1 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )}

              {/* Amount input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Số tiền thanh toán lần này (₫) *</label>
                  {obligation.remainingAmount > 0 && (
                    <button
                      type="button"
                      onClick={handleSetFullAmount}
                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      Trả toàn bộ số dư còn lại
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    id="input-payment-amount"
                    type="text"
                    value={amountStr}
                    onChange={e => handleAmountChange(e.target.value)}
                    placeholder="0"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-base focus:ring-2 focus:ring-indigo-500"
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">
                    ₫
                  </span>
                </div>
              </div>

              {/* Paid Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ngày chuyển tiền thực tế *</label>
                <input
                  id="input-payment-date"
                  type="date"
                  value={paidDate}
                  onChange={e => setPaidDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs"
                />
              </div>

              {/* Reference Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mã giao dịch ngân hàng / Ref Code (tùy chọn)
                </label>
                <input
                  id="input-payment-ref"
                  type="text"
                  placeholder="Ví dụ: FT24098234823"
                  value={referenceCode}
                  onChange={e => setReferenceCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú (tùy chọn)</label>
                <input
                  id="input-payment-notes"
                  type="text"
                  placeholder="Ví dụ: Chuyển từ tài khoản Techcombank..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                />
              </div>

              {/* Submit button */}
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
                >
                  Hủy bỏ
                </button>
                <button
                  id="btn-confirm-record-payment"
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Xác nhận đã thanh toán</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="py-6 text-center text-slate-500 text-sm">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              Thẻ này đã được thanh toán đủ toàn bộ số tiền cần trả cho kỳ này!
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { X, CreditCard, ShieldCheck, Calendar, Info } from 'lucide-react';
import { Card } from '../types.ts';
import { getCurrentYearMonth } from '../utils/dateUtils.ts';

interface CardModalProps {
  cardToEdit: Card | null;
  onClose: () => void;
  onSave: (data: Partial<Card> & { applyDueDayFromMonth?: string }) => Promise<void>;
}

export const CardModal: React.FC<CardModalProps> = ({ cardToEdit, onClose, onSave }) => {
  const [name, setName] = useState(cardToEdit?.name || '');
  const [bankName, setBankName] = useState(cardToEdit?.bankName || '');
  const [defaultDueDay, setDefaultDueDay] = useState(String(cardToEdit?.defaultDueDay || '15'));
  const [autoWeekendShift, setAutoWeekendShift] = useState(cardToEdit?.autoWeekendShift || false);
  const [startTrackingMonth, setStartTrackingMonth] = useState(
    cardToEdit?.startTrackingMonth || getCurrentYearMonth()
  );
  const [notes, setNotes] = useState(cardToEdit?.notes || '');
  const [applyDueDayFromMonth, setApplyDueDayFromMonth] = useState(getCurrentYearMonth());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commonBanks = [
    'Techcombank',
    'Vietcombank',
    'MBBank',
    'VPBank',
    'TPBank',
    'VIB',
    'ACB',
    'BIDV',
    'VietinBank',
    'Sacombank',
    'HSBC',
    'Standard Chartered',
    'Shinhan Bank',
    'OCB',
    'MSB',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Vui lòng nhập tên thẻ.');
      return;
    }
    if (!bankName.trim()) {
      setError('Vui lòng nhập hoặc chọn tên ngân hàng.');
      return;
    }
    const day = parseInt(defaultDueDay, 10);
    if (isNaN(day) || day < 1 || day > 31) {
      setError('Ngày đến hạn mặc định phải từ 1 đến 31.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        bankName: bankName.trim(),
        defaultDueDay: day,
        autoWeekendShift,
        startTrackingMonth,
        notes,
        applyDueDayFromMonth,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi lưu thông tin thẻ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-2xl">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                {cardToEdit ? 'Sửa thông tin thẻ tín dụng' : 'Thêm thẻ tín dụng mới'}
              </h3>
              <p className="text-xs text-slate-500">
                Khai báo thông tin định danh và ngày đến hạn mặc định
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Security Banner (Mục 13) */}
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2.5 text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">An toàn bảo mật: </span>
              Chỉ nhập tên gợi nhớ của thẻ. <strong>Tuyệt đối không nhập</strong> số thẻ 16 số, ngày hết hạn, mã CVV/CVC, mã PIN hay mật khẩu!
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Tên gợi nhớ của thẻ *</label>
            <input
              type="text"
              required
              placeholder="Ví dụ: Techcombank Visa Signature, VIB Online Plus..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Bank */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ngân hàng phát hành *</label>
            <input
              type="text"
              required
              list="bank-suggestions"
              placeholder="Nhập hoặc chọn ngân hàng..."
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500"
            />
            <datalist id="bank-suggestions">
              {commonBanks.map(b => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>

          {/* Default Due Day */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Ngày đến hạn mặc định (1-31) *
              </label>
              <input
                type="number"
                min={1}
                max={31}
                required
                value={defaultDueDay}
                onChange={e => setDefaultDueDay(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-[10px] text-slate-500 mt-0.5">
                Nếu chọn ngày 29, 30 hoặc 31 vào tháng thiếu ngày, hệ thống sẽ tự động điều chỉnh về ngày cuối cùng của tháng đó.
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Bắt đầu theo dõi từ tháng
              </label>
              <input
                type="month"
                value={startTrackingMonth}
                onChange={e => setStartTrackingMonth(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-mono focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Weekend shift checkbox */}
          <div className="pt-1">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoWeekendShift}
                onChange={e => setAutoWeekendShift(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <span className="font-semibold text-slate-800">
                Tự động đề xuất dời ngày hạn sang thứ Sáu nếu rơi vào cuối tuần
              </span>
            </label>
          </div>

          {/* If editing default due day, offer effective month */}
          {cardToEdit && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <label className="block font-bold text-slate-700 mb-1">
                Áp dụng ngày đến hạn mới cho các tháng chưa cập nhật từ:
              </label>
              <input
                type="month"
                value={applyDueDayFromMonth}
                onChange={e => setApplyDueDayFromMonth(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-mono text-xs bg-white"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Giúp bảo toàn các kỳ trong quá khứ đã được xác nhận.
              </p>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">Ghi chú (tùy chọn)</label>
            <textarea
              rows={2}
              placeholder="Ghi chú hạn mức, ưu đãi hoàn tiền..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Footer */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition-colors disabled:opacity-50"
            >
              {cardToEdit ? 'Lưu thay đổi' : 'Tạo thẻ mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

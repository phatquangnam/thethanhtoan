import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Check,
  Save,
  Sparkles,
} from 'lucide-react';
import { ObligationViewItem, MonthSummary } from '../types.ts';
import { formatVND, parseVNDInput } from '../utils/dateUtils.ts';
import confetti from 'canvas-confetti';

interface CheckCompletionModalProps {
  summary: MonthSummary;
  unupdatedObligations: ObligationViewItem[];
  onClose: () => void;
  onBatchSave: (updates: any[], reason?: string) => Promise<boolean>;
}

export const CheckCompletionModal: React.FC<CheckCompletionModalProps> = ({
  summary,
  unupdatedObligations,
  onClose,
  onBatchSave,
}) => {
  const [inputs, setInputs] = useState<Record<string, { amountStr: string; isNoExpense: boolean }>>(() => {
    const init: Record<string, { amountStr: string; isNoExpense: boolean }> = {};
    unupdatedObligations.forEach(o => {
      init[o.id] = { amountStr: '', isNoExpense: false };
    });
    return init;
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleAmountChange = (id: string, val: string) => {
    const cleaned = val.replace(/[^0-9]/g, '');
    const formatted = cleaned ? parseInt(cleaned, 10).toLocaleString('vi-VN') : '';
    setInputs(prev => ({
      ...prev,
      [id]: { amountStr: formatted, isNoExpense: false },
    }));
  };

  const handleToggleNoExpense = (id: string) => {
    setInputs(prev => {
      const current = prev[id]?.isNoExpense || false;
      return {
        ...prev,
        [id]: { amountStr: !current ? '0' : '', isNoExpense: !current },
      };
    });
  };

  const handleSave = async () => {
    const updates: any[] = [];
    for (const [id, stateVal] of Object.entries(inputs)) {
      const state = stateVal as { amountStr: string; isNoExpense: boolean };
      if (state.isNoExpense) {
        updates.push({ id, isNoExpense: true });
      } else if (state.amountStr) {
        const num = parseVNDInput(state.amountStr);
        if (num > 0) {
          updates.push({ id, amount: num });
        }
      }
    }

    if (updates.length === 0) {
      alert('Vui lòng nhập số tiền hoặc tick "Không phát sinh" cho ít nhất một thẻ trước khi lưu.');
      return;
    }

    setIsSaving(true);
    const success = await onBatchSave(updates, 'Hoàn tất cập nhật thẻ còn thiếu');
    setIsSaving(false);

    if (success) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.6 } });
      onClose();
    }
  };

  const totalCards = summary.totalCardsTracked;
  const completedCards = totalCards - summary.unupdatedCardsCount;
  const percent = Math.round((completedCards / (totalCards || 1)) * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-2xl ${
                summary.isFullyUpdated
                  ? 'bg-emerald-50 text-emerald-600'
                  : 'bg-amber-50 text-amber-600'
              }`}
            >
              {summary.isFullyUpdated ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Kiểm tra tiến độ cập nhật số tiền tháng {summary.month}
              </h3>
              <p className="text-xs text-slate-500">
                Đã hoàn thành {completedCards}/{totalCards} thẻ ({percent}%)
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

        {/* Progress bar */}
        <div className="w-full bg-slate-100 h-2">
          <div
            className={`h-full transition-all duration-500 ${
              summary.isFullyUpdated ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${percent}%` }}
          ></div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {summary.isFullyUpdated ? (
            <div className="py-12 text-center space-y-3">
              <div className="h-14 w-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-base font-bold text-slate-900">
                Tuyệt vời! Đã hoàn tất cập nhật 100% (40/40 thẻ)
              </h4>
              <p className="text-slate-500 max-w-md mx-auto text-xs">
                Toàn bộ các thẻ tín dụng theo dõi trong tháng {summary.month} đều đã được khai báo số tiền cần thanh toán hoặc xác nhận không phát sinh chi tiêu. Tổng nghĩa vụ hiện tại là hoàn toàn chính xác!
              </p>
              <button
                onClick={onClose}
                className="px-5 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-xs hover:bg-indigo-700"
              >
                Đóng
              </button>
            </div>
          ) : (
            <>
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-amber-900">
                <span className="font-bold">Còn {summary.unupdatedCardsCount} thẻ chưa khai báo: </span>
                Bạn có thể nhập trực tiếp số tiền hoặc chọn "0 ₫" ngay bên dưới để hoàn tất sổ theo dõi trong vài giây.
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {unupdatedObligations.map((o, idx) => {
                  const state = inputs[o.id] || { amountStr: '', isNoExpense: false };
                  return (
                    <div
                      key={o.id}
                      className="p-3 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-indigo-300 transition-colors"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 font-bold">#{idx + 1}</span>
                          <span className="font-bold text-slate-900 text-sm">{o.cardName}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {o.bankName} • Hạn thanh toán: ngày {o.dueDay} ({o.actualDueDate})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Amount input */}
                        <div className="relative w-36">
                          <input
                            type="text"
                            disabled={state.isNoExpense}
                            placeholder="Số tiền..."
                            value={state.amountStr}
                            onChange={e => handleAmountChange(o.id, e.target.value)}
                            className={`w-full px-2.5 py-1.5 rounded-lg border font-mono font-bold text-xs ${
                              state.isNoExpense
                                ? 'bg-slate-100 text-slate-400 border-slate-200'
                                : 'bg-white border-slate-300 focus:ring-2 focus:ring-indigo-500'
                            }`}
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                            ₫
                          </span>
                        </div>

                        {/* No expense toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleNoExpense(o.id)}
                          className={`px-2.5 py-1.5 rounded-lg font-semibold border transition-colors ${
                            state.isNoExpense
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {state.isNoExpense ? 'Đã chọn 0 ₫' : 'Không tiêu'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Đang lưu...' : 'Lưu tất cả'}</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

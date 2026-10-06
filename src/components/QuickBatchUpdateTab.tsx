import React, { useState, useEffect } from 'react';
import {
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Search,
  Filter,
  Check,
  X,
  Sparkles,
  Info,
  Calendar,
} from 'lucide-react';
import { ObligationViewItem } from '../types.ts';
import { formatVND, formatDateVN, parseVNDInput } from '../utils/dateUtils.ts';

interface QuickBatchUpdateTabProps {
  obligations: ObligationViewItem[];
  onBatchSave: (updates: any[], reason?: string) => Promise<boolean>;
  onRefresh: () => void;
  isLoading: boolean;
}

interface RowState {
  id: string;
  cardName: string;
  bankName: string;
  dueDay: number;
  actualDueDate: string;
  amountStr: string;
  isNoExpense: boolean;
  notes: string;
  dataState: string;
  totalPaid: number;
  isDirty: boolean;
  error?: string;
}

export const QuickBatchUpdateTab: React.FC<QuickBatchUpdateTabProps> = ({
  obligations,
  onBatchSave,
  onRefresh,
  isLoading,
}) => {
  const [rows, setRows] = useState<RowState[]>([]);
  const [onlyUnupdated, setOnlyUnupdated] = useState(false);
  const [search, setSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [batchReason, setBatchReason] = useState('Cập nhật nhanh sao kê tháng');
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');

  // Sync rows from obligations
  useEffect(() => {
    const newRows: RowState[] = obligations.map(o => ({
      id: o.id,
      cardName: o.cardName,
      bankName: o.bankName,
      dueDay: o.dueDay,
      actualDueDate: o.actualDueDate,
      amountStr: o.dataState === 'DECLARED' ? o.amount.toLocaleString('vi-VN') : '',
      isNoExpense: o.dataState === 'NO_EXPENSE',
      notes: o.notes || '',
      dataState: o.dataState,
      totalPaid: o.totalPaid,
      isDirty: false,
    }));
    setRows(prev=>newRows.map(n=>{
      const draft=prev.find(r=>r.id===n.id);
      if(!draft?.isDirty)return n;
      const amount=parseVNDInput(draft.amountStr);
      return {...draft,totalPaid:n.totalPaid,error:(draft.isNoExpense && n.totalPaid>0)||(amount>0&&amount<n.totalPaid)?'Dữ liệu thanh toán đã thay đổi. Vui lòng kiểm tra lại số tiền.':draft.error};
    }));
  }, [obligations]);

  const handleAmountChange = (id: string, value: string) => {
    // Only digits and commas/dots
    const cleaned = value.replace(/[^0-9]/g, '');
    const num = cleaned ? parseInt(cleaned, 10) : 0;
    const formatted = cleaned ? num.toLocaleString('vi-VN') : '';

    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        let error = undefined;
        if (num < r.totalPaid && num > 0) {
          error = `Không được nhỏ hơn số đã trả (${r.totalPaid.toLocaleString('vi-VN')} ₫)`;
        }
        return {
          ...r,
          amountStr: formatted,
          isNoExpense: false,
          isDirty: true,
          error,
        };
      })
    );
  };

  const handleToggleNoExpense = (id: string) => {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        if (r.totalPaid > 0) {
          return {
            ...r,
            error: 'Đã có thanh toán ghi nhận, không thể tick Không phát sinh',
          };
        }
        const nextState = !r.isNoExpense;
        return {
          ...r,
          isNoExpense: nextState,
          amountStr: nextState ? '0' : '',
          isDirty: true,
          error: undefined,
        };
      })
    );
  };

  const handleDueDateChange = (id: string, newDate: string) => {
    setRows(prev =>
      prev.map(r => (r.id === id ? { ...r, actualDueDate: newDate, isDirty: true } : r))
    );
  };

  const handleNotesChange = (id: string, notes: string) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, notes, isDirty: true } : r)));
  };

  const handleSaveAll = async () => {
    const dirtyRows = rows.filter(r => r.isDirty);
    if (dirtyRows.length === 0) return;

    // Validate
    const hasErrors = dirtyRows.some(r => r.error);
    if (hasErrors) {
      alert('Vui lòng sửa các dòng có lỗi màu đỏ trước khi lưu!');
      return;
    }

    const updates = dirtyRows.map(r => {
      const num = r.amountStr ? parseVNDInput(r.amountStr) : undefined;
      return {
        id: r.id,
        amount: num,
        isNoExpense: r.isNoExpense,
        actualDueDate: r.actualDueDate,
        notes: r.notes,
      };
    });

    setIsSaving(true);
    const success = await onBatchSave(updates, batchReason);
    setIsSaving(false);

    if (success) {
      setRows(prev=>prev.map(r=>({...r,isDirty:false})));
      setSaveSuccessMsg(`Đã lưu thành công ${dirtyRows.length} thẻ!`);
      setTimeout(() => setSaveSuccessMsg(''), 4000);
    }
  };

  const dirtyCount = rows.filter(r => r.isDirty).length;
  const unupdatedCount = rows.filter(r => r.dataState === 'UNUPDATED' && !r.isDirty).length;

  const filteredRows = rows.filter(r => {
    if (onlyUnupdated && (r.dataState !== 'UNUPDATED' || r.isDirty)) return false;
    if (search) {
      const q = search.toLowerCase();
      return r.cardName.toLowerCase().includes(q) || r.bankName.toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) =>
    a.cardName.trim().localeCompare(b.cardName.trim(), 'vi', { sensitivity: 'base', numeric: true })
  );

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Cập nhật nhanh sao kê tháng</h2>
            <p className="text-xs text-slate-500">
              Nhập số tiền hoặc đánh dấu "Không phát sinh" cho 40 thẻ. Dùng phím <kbd className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-700 font-mono font-bold">Tab</kbd> để nhảy nhanh qua các dòng.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {saveSuccessMsg && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              {saveSuccessMsg}
            </span>
          )}

          <button
            id="btn-filter-unupdated"
            onClick={() => setOnlyUnupdated(!onlyUnupdated)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
              onlyUnupdated
                ? 'bg-amber-100 text-amber-900 border-amber-300'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Chỉ xem thẻ chưa cập nhật ({unupdatedCount})</span>
          </button>

          <button
            id="btn-save-batch"
            onClick={handleSaveAll}
            disabled={dirtyCount === 0 || isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all ${
              dirtyCount > 0
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white animate-bounce'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>Lưu tất cả ({dirtyCount} thay đổi)</span>
          </button>
        </div>
      </div>

      {/* 2. Guidelines Callout (Mục 3: Nguyên tắc cốt lõi) */}
      <div className="bg-sky-50/70 rounded-xl p-3 border border-sky-200 text-xs text-sky-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Quy tắc vàng: </span>
          <span>
            Ô trống không được hiểu là 0 ₫. Nếu kỳ này bạn không dùng thẻ hoặc số dư bằng 0, vui lòng tick vào ô <strong>"Không phát sinh"</strong> để hệ thống ghi nhận chính thức. Không thể sửa số tiền thấp hơn số tiền bạn đã thanh toán trước đó.
          </span>
        </div>
      </div>

      {/* 3. Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[620px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/90 text-slate-700 sticky top-0 z-10 shadow-2xs backdrop-blur font-bold border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 w-12 text-center">STT</th>
                <th className="px-3 py-2.5 min-w-[200px]">Tên thẻ & Ngân hàng</th>
                <th className="px-3 py-2.5 w-32">Ngày đến hạn</th>
                <th className="px-3 py-2.5 min-w-[180px]">Số tiền cần thanh toán (₫)</th>
                <th className="px-3 py-2.5 w-36 text-center">Không phát sinh</th>
                <th className="px-3 py-2.5 min-w-[180px]">Ghi chú kỳ này</th>
                <th className="px-3 py-2.5 w-28 text-center">Trạng thái</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((r, idx) => {
                const isPaidAny = r.totalPaid > 0;
                return (
                  <tr
                    key={r.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      r.isDirty ? 'bg-indigo-50/30' : ''
                    }`}
                  >
                    {/* Index */}
                    <td className="px-3 py-2 text-center text-slate-400 font-mono">
                      {idx + 1}
                    </td>

                    {/* Card & Bank */}
                    <td className="px-3 py-2">
                      <div className="font-bold text-slate-900 text-sm truncate" title={r.cardName}>
                        {r.cardName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {r.bankName} • Hạn mặc định: ngày {r.dueDay}
                      </div>
                    </td>

                    {/* Actual Due Date Input */}
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={r.actualDueDate}
                        onChange={e => handleDueDateChange(r.id, e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 font-mono focus:ring-1 focus:ring-indigo-500 bg-white"
                      />
                    </td>

                    {/* Amount Input */}
                    <td className="px-3 py-2">
                      <div className="relative">
                        <input
                          id={`input-batch-amount-${r.id}`}
                          type="text"
                          disabled={r.isNoExpense}
                          placeholder="Nhập số tiền..."
                          value={r.amountStr}
                          onChange={e => handleAmountChange(r.id, e.target.value)}
                          className={`w-full px-2.5 py-1.5 text-xs sm:text-sm font-mono font-bold rounded-lg border focus:ring-2 focus:ring-indigo-500 ${
                            r.isNoExpense
                              ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                              : r.error
                              ? 'border-red-400 text-red-700 bg-red-50 focus:ring-red-400'
                              : 'border-slate-200 text-slate-900 bg-white'
                          }`}
                        />
                        {r.error && (
                          <div className="text-[10px] font-semibold text-red-600 mt-0.5">
                            {r.error}
                          </div>
                        )}
                      </div>
                    </td>

                    {/* No Expense Checkbox */}
                    <td className="px-3 py-2 text-center">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                        <input
                          id={`checkbox-no-expense-${r.id}`}
                          type="checkbox"
                          checked={r.isNoExpense}
                          disabled={isPaidAny}
                          onChange={() => handleToggleNoExpense(r.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 disabled:opacity-40"
                        />
                        <span className={`text-[11px] font-semibold ${r.isNoExpense ? 'text-slate-700 font-bold' : 'text-slate-500'}`}>
                          {r.isNoExpense ? 'Đã tick' : 'Tick 0 ₫'}
                        </span>
                      </label>
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        placeholder="Ghi chú (tùy chọn)..."
                        value={r.notes}
                        onChange={e => handleNotesChange(r.id, e.target.value)}
                        className="w-full px-2 py-1 text-xs rounded-lg border border-slate-200 focus:ring-1 focus:ring-indigo-500 bg-white text-slate-700"
                      />
                    </td>

                    {/* Status Pill */}
                    <td className="px-3 py-2 text-center">
                      {r.isDirty ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">
                          Đã sửa
                        </span>
                      ) : r.dataState === 'UNUPDATED' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800">
                          Chưa nhập
                        </span>
                      ) : r.dataState === 'NO_EXPENSE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                          0 ₫
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Đã lưu
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

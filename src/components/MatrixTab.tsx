import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  MinusCircle,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  Calendar,
  Grid,
  List,
} from 'lucide-react';
import { ObligationViewItem, Card } from '../types.ts';
import { formatVND, formatDateVN, getCurrentDateStr } from '../utils/dateUtils.ts';

interface MatrixTabProps {
  matrixData: any;
  discreteMode: boolean;
  onOpenPaymentModal: (item: ObligationViewItem) => void;
  onOpenDetailModal: (item: ObligationViewItem) => void;
  isLoading: boolean;
}

export const MatrixTab: React.FC<MatrixTabProps> = ({
  matrixData,
  discreteMode,
  onOpenPaymentModal,
  onOpenDetailModal,
  isLoading,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBank, setSelectedBank] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'matrix' | 'daily_list'>('matrix');

  const today = getCurrentDateStr();

  const banks = useMemo(() => {
    if (!matrixData || !matrixData.rows) return [];
    const bSet = new Set<string>();
    matrixData.rows.forEach((r: any) => {
      if (r.card && r.card.bankName) bSet.add(r.card.bankName);
    });
    return Array.from(bSet).sort();
  }, [matrixData]);

  const filteredRows = useMemo(() => {
    if (!matrixData || !matrixData.rows) return [];
    return matrixData.rows.filter((r: any) => {
      const card = r.card as Card;
      const obl = r.obligation as ObligationViewItem | null;

      // Bank filter
      if (selectedBank !== 'ALL' && card.bankName !== selectedBank) {
        return false;
      }

      // Search term
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matchName = card.name.toLowerCase().includes(q);
        const matchBank = card.bankName.toLowerCase().includes(q);
        if (!matchName && !matchBank) return false;
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if (!obl) return false;
        if (statusFilter === 'UNUPDATED' && obl.dataState !== 'UNUPDATED') return false;
        if (statusFilter === 'REMAINING' && (obl.dataState !== 'DECLARED' || obl.remainingAmount <= 0)) return false;
        if (statusFilter === 'OVERDUE' && obl.dueDateStatus !== 'OVERDUE' && obl.dueDateStatus !== 'OVERDUE_UNUPDATED') return false;
        if (statusFilter === 'PAID' && obl.paymentStatus !== 'PAID') return false;
        if (statusFilter === 'NO_EXPENSE' && obl.dataState !== 'NO_EXPENSE') return false;
      }

      return true;
    });
  }, [matrixData, selectedBank, searchTerm, statusFilter]);

  if (isLoading || !matrixData) {
    return (
      <div className="bg-white rounded-2xl p-12 border border-slate-200 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
        <p className="mt-3 text-sm text-slate-500 font-medium">Đang tải ma trận thanh toán...</p>
      </div>
    );
  }

  const { totalDays, dayColumns, dailyTotals } = matrixData;

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Search & Bank Filter */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="input-matrix-search"
              type="text"
              placeholder="Tìm theo tên thẻ, ngân hàng..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Bank Select */}
          <select
            id="select-matrix-bank"
            value={selectedBank}
            onChange={e => setSelectedBank(e.target.value)}
            className="px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tất cả ngân hàng ({banks.length})</option>
            {banks.map(b => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>

          {/* Status Select */}
          <select
            id="select-matrix-status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="UNUPDATED">Chưa cập nhật số tiền</option>
            <option value="REMAINING">Còn tiền phải trả</option>
            <option value="OVERDUE">Quá hạn thanh toán</option>
            <option value="PAID">Đã thanh toán đủ</option>
            <option value="NO_EXPENSE">Không phát sinh</option>
          </select>
        </div>

        {/* View Mode Toggle (Mobile Friendly) */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            id="btn-view-matrix"
            onClick={() => setViewMode('matrix')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              viewMode === 'matrix' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ma trận bảng</span>
          </button>
          <button
            id="btn-view-list"
            onClick={() => setViewMode('daily_list')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
              viewMode === 'daily_list' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <List className="w-3.5 h-3.5" />
            <span>Theo từng ngày</span>
          </button>
        </div>
      </div>

      {/* 2. Color Legend Guide (Mục 7) */}
      <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-200/80 text-xs flex flex-wrap items-center gap-3">
        <span className="font-bold text-slate-600">Chú giải trạng thái:</span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
          Đã thanh toán đủ
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 font-semibold">
          <span className="w-2 h-2 rounded-full bg-sky-600"></span>
          Trả một phần
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold">
          <span className="w-2 h-2 rounded-full bg-amber-600"></span>
          Sắp đến hạn / Hôm nay
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-800 font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-600"></span>
          Quá hạn nợ
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-semibold">
          <span className="w-2 h-2 rounded-full bg-purple-600"></span>
          Chưa cập nhật
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 font-semibold">
          <span className="w-2 h-2 rounded-full bg-slate-500"></span>
          Không phát sinh
        </span>
      </div>

      {/* 3. Main Matrix View (Desktop Spreadsheet) */}
      {viewMode === 'matrix' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto max-h-[650px] relative">
            <table className="w-full border-collapse text-left text-xs">
              {/* Table Header */}
              <thead className="bg-slate-100/90 text-slate-700 sticky top-0 z-20 shadow-2xs backdrop-blur">
                <tr>
                  {/* Fixed Columns */}
                  <th className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 font-bold border-b border-r border-slate-200 min-w-[200px]">
                    Tên thẻ & Ngân hàng
                  </th>
                  <th className="sticky left-[200px] z-30 bg-slate-100 px-3 py-2.5 font-bold border-b border-r border-slate-200 text-right min-w-[110px]">
                    Phải trả
                  </th>
                  <th className="sticky left-[310px] z-30 bg-slate-100 px-3 py-2.5 font-bold border-b border-r border-slate-200 text-right min-w-[100px]">
                    Đã trả
                  </th>
                  <th className="sticky left-[410px] z-30 bg-slate-100 px-3 py-2.5 font-bold border-b border-r border-slate-200 text-right min-w-[110px]">
                    Còn lại
                  </th>

                  {/* Day Columns (1..totalDays) */}
                  {dayColumns.map((col: any) => {
                    const isToday = col.dateStr === today;
                    return (
                      <th
                        key={col.day}
                        className={`px-2 py-1.5 text-center border-b border-r border-slate-200 min-w-[70px] ${
                          col.isWeekend ? 'bg-amber-50/50 text-amber-900' : 'bg-slate-100 text-slate-700'
                        } ${isToday ? 'ring-2 ring-indigo-500 ring-inset font-black' : ''}`}
                      >
                        <div className="font-mono text-sm font-extrabold">{col.day}</div>
                        <div className="text-[10px] uppercase font-semibold text-slate-500">{col.dayOfWeek}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map(({ card, obligation: obl }: any) => {
                  const hasObl = !!obl;
                  const isPaid = obl && obl.paymentStatus === 'PAID';
                  const isPartial = obl && obl.paymentStatus === 'PARTIAL';
                  const isOverdue = obl && (obl.dueDateStatus === 'OVERDUE' || obl.dueDateStatus === 'OVERDUE_UNUPDATED');
                  const isUnupdated = obl && obl.dataState === 'UNUPDATED';
                  const isNoExpense = obl && obl.dataState === 'NO_EXPENSE';

                  return (
                    <tr key={card.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Fixed: Card Name */}
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 border-r border-slate-200 font-semibold text-slate-900 max-w-[200px] truncate shadow-2xs">
                        <div className="truncate text-xs font-bold" title={card.name}>
                          {card.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          {card.bankName} • Hạn gốc: ngày {card.defaultDueDay}
                        </div>
                      </td>

                      {/* Fixed: Must Pay */}
                      <td className="sticky left-[200px] z-10 bg-white px-3 py-2 border-r border-slate-200 text-right font-mono font-bold text-slate-800 shadow-2xs">
                        {isUnupdated ? (
                          <span className="text-purple-600 font-semibold text-[11px]">Chưa nhập</span>
                        ) : isNoExpense ? (
                          <span className="text-slate-400 text-[11px]">0 ₫</span>
                        ) : (
                          formatVND(obl.amount, discreteMode)
                        )}
                      </td>

                      {/* Fixed: Paid */}
                      <td className="sticky left-[310px] z-10 bg-white px-3 py-2 border-r border-slate-200 text-right font-mono text-emerald-600 font-semibold shadow-2xs">
                        {hasObl && obl.totalPaid > 0 ? formatVND(obl.totalPaid, discreteMode) : '0 ₫'}
                      </td>

                      {/* Fixed: Remaining */}
                      <td className="sticky left-[410px] z-10 bg-white px-3 py-2 border-r border-slate-200 text-right font-mono font-bold shadow-2xs">
                        {isUnupdated ? (
                          <span className="text-purple-600 text-[11px]">—</span>
                        ) : isNoExpense ? (
                          <span className="text-slate-400 text-[11px]">0 ₫</span>
                        ) : (
                          <span className={obl.remainingAmount > 0 ? 'text-rose-600' : 'text-slate-400'}>
                            {formatVND(obl.remainingAmount, discreteMode)}
                          </span>
                        )}
                      </td>

                      {/* Day Columns */}
                      {dayColumns.map((col: any) => {
                        const isDueDay = hasObl && obl.actualDueDate === col.dateStr;

                        if (!isDueDay) {
                          return (
                            <td
                              key={col.day}
                              className={`px-1 py-2 text-center border-r border-slate-100 ${
                                col.isWeekend ? 'bg-amber-50/20' : ''
                              }`}
                            ></td>
                          );
                        }

                        // Due Day Cell Styling
                        let cellBg = 'bg-slate-100 text-slate-700 border-slate-300';
                        let labelText = '';

                        if (isUnupdated) {
                          cellBg = 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200';
                          labelText = 'Chưa cập nhật';
                        } else if (isNoExpense) {
                          cellBg = 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200';
                          labelText = 'Không phát sinh';
                        } else if (isPaid) {
                          cellBg = 'bg-emerald-100 text-emerald-950 border-emerald-300 hover:bg-emerald-200';
                          labelText = 'Đã trả đủ';
                        } else if (isOverdue) {
                          cellBg = 'bg-red-100 text-red-950 border-red-300 hover:bg-red-200 font-bold';
                          labelText = 'Quá hạn';
                        } else if (isPartial) {
                          cellBg = 'bg-sky-100 text-sky-950 border-sky-300 hover:bg-sky-200';
                          labelText = 'Trả một phần';
                        } else {
                          cellBg = 'bg-amber-100 text-amber-950 border-amber-300 hover:bg-amber-200';
                          labelText = 'Chưa trả';
                        }

                        return (
                          <td
                            key={col.day}
                            className={`p-1 text-center border-r border-slate-200 cursor-pointer ${
                              col.isWeekend ? 'ring-1 ring-amber-300/40' : ''
                            }`}
                            onClick={() => onOpenDetailModal(obl)}
                            title={`Bấm xem chi tiết / thanh toán thẻ ${card.name}`}
                          >
                            <div
                              className={`rounded-lg p-1.5 border shadow-2xs transition-transform hover:scale-105 ${cellBg}`}
                            >
                              <div className="font-mono text-[10px] font-bold leading-tight truncate">
                                {isUnupdated ? 'Chưa nhập' : isNoExpense ? '0 ₫' : formatVND(obl.amount, discreteMode)}
                              </div>
                              <div className="text-[9px] font-extrabold uppercase tracking-tight mt-0.5">
                                {labelText}
                              </div>
                              {obl.isEstimatedDue && (
                                <div className="text-[8px] text-amber-800 font-semibold mt-0.5">Dự kiến</div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>

              {/* Sticky Footer: Daily Totals Row (Mục 7) */}
              <tfoot className="bg-slate-200 text-slate-800 sticky bottom-0 z-20 font-bold border-t-2 border-slate-300 shadow-xs">
                <tr>
                  <td className="sticky left-0 z-30 bg-slate-200 px-3 py-2 border-r border-slate-300 font-extrabold text-slate-900">
                    TỔNG CỘNG THEO NGÀY
                  </td>
                  <td
                    colSpan={3}
                    className="sticky left-[200px] z-30 bg-slate-200 px-3 py-2 border-r border-slate-300 text-right text-slate-600 text-[11px]"
                  >
                    Tổng số tiền đến hạn:
                  </td>

                  {dayColumns.map((col: any) => {
                    const dTot = dailyTotals[col.day] || { declared: 0, remaining: 0, cardCount: 0, unupdatedCount: 0 };
                    const hasItems = dTot.cardCount > 0;

                    return (
                      <td
                        key={col.day}
                        className={`px-1 py-2 text-center border-r border-slate-300 font-mono text-[10px] ${
                          hasItems && dTot.remaining > 0 ? 'text-rose-700 bg-rose-50/60' : 'text-slate-600'
                        }`}
                      >
                        {hasItems ? (
                          <div>
                            <div className="font-bold leading-tight">
                              {dTot.declared > 0 ? formatVND(dTot.declared, discreteMode) : '0 ₫'}
                            </div>
                            <div className="text-[9px] text-slate-500 font-normal">
                              {dTot.cardCount} thẻ
                              {dTot.unupdatedCount > 0 && ` (${dTot.unupdatedCount} ?)`}
                            </div>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        /* 4. Daily List View (Mobile & Quick Scan) */
        <div className="space-y-3">
          {dayColumns.map((col: any) => {
            const dayCards = filteredRows.filter((r: any) => r.obligation && r.obligation.actualDueDate === col.dateStr);
            if (dayCards.length === 0) return null;

            const dTot = dailyTotals[col.day] || { declared: 0, remaining: 0 };

            return (
              <div
                key={col.day}
                className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-indigo-300 transition-colors"
              >
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-8 w-8 rounded-xl font-mono font-black text-sm flex items-center justify-center ${
                        col.isWeekend ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {col.day}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        Ngày {col.day} ({col.dayOfWeek})
                      </h4>
                      <span className="text-xs text-slate-500">{dayCards.length} thẻ đến hạn</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-slate-400 block">Tổng cần chuẩn bị</span>
                    <span className="font-mono font-bold text-sm text-slate-900">
                      {formatVND(dTot.declared, discreteMode)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 divide-y divide-slate-100">
                  {dayCards.map(({ card, obligation: obl }: any) => (
                    <div
                      key={card.id}
                      className="py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 px-2 rounded-xl"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm truncate">{card.name}</span>
                          <span className="text-xs text-slate-500">• {card.bankName}</span>
                          {obl.isEstimatedDue && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                              Ngày dự kiến
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {obl.dataState === 'UNUPDATED' ? (
                            <span className="text-purple-600 font-semibold">Chưa cập nhật số tiền</span>
                          ) : obl.dataState === 'NO_EXPENSE' ? (
                            <span className="text-slate-500">Xác nhận không phát sinh</span>
                          ) : (
                            <span>
                              Phải trả: {formatVND(obl.amount, discreteMode)} | Đã trả:{' '}
                              {formatVND(obl.totalPaid, discreteMode)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {obl.dataState === 'DECLARED' && obl.remainingAmount > 0 && (
                          <button
                            onClick={() => onOpenPaymentModal(obl)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-2xs"
                          >
                            Trả {formatVND(obl.remainingAmount, discreteMode)}
                          </button>
                        )}
                        <button
                          onClick={() => onOpenDetailModal(obl)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
                        >
                          Chi tiết
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

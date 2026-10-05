import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ObligationViewItem } from '../types.ts';
import {
  parseYearMonth,
  getDaysInMonth,
  formatVND,
  getCurrentDateStr,
} from '../utils/dateUtils.ts';

interface CalendarTabProps {
  currentMonth: string;
  obligations: ObligationViewItem[];
  discreteMode: boolean;
  onOpenDetailModal: (item: ObligationViewItem) => void;
  onOpenPaymentModal: (item: ObligationViewItem) => void;
}

export const CalendarTab: React.FC<CalendarTabProps> = ({
  currentMonth,
  obligations,
  discreteMode,
  onOpenDetailModal,
  onOpenPaymentModal,
}) => {
  const { year, month } = parseYearMonth(currentMonth);
  const totalDays = getDaysInMonth(year, month);
  const today = getCurrentDateStr();

  // Day 1 Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const firstDayDt = new Date(Date.UTC(year, month - 1, 1));
  const firstDow = firstDayDt.getUTCDay(); // 0 is Sun, 1 is Mon
  // Adjust so Monday is column 0 (0..6)
  const startCol = firstDow === 0 ? 6 : firstDow - 1;

  // Map day -> obligations
  const dayMap = useMemo(() => {
    const map = new Map<number, ObligationViewItem[]>();
    for (let d = 1; d <= totalDays; d++) {
      map.set(d, []);
    }
    obligations.forEach(o => {
      if(!o.actualDueDate.startsWith(currentMonth))return;
      const list = map.get(Number(o.actualDueDate.slice(-2)));
      if (list) list.push(o);
    });
    return map;
  }, [obligations, totalDays, currentMonth]);

  const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

  // Calendar cells array: blank cells before day 1 + 1..totalDays
  const calendarCells = [];
  for (let i = 0; i < startCol; i++) {
    calendarCells.push({ day: null, isBlank: true });
  }
  for (let d = 1; d <= totalDays; d++) {
    const dt = new Date(Date.UTC(year, month - 1, d));
    const dow = dt.getUTCDay();
    const isWeekend = dow === 0 || dow === 6;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({
      day: d,
      isBlank: false,
      isWeekend,
      isToday: dateStr === today,
      dateStr,
      items: dayMap.get(d) || [],
    });
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-900">Lịch thanh toán thẻ theo tuần & ngày</h2>
          <p className="text-xs text-slate-500">
            Xem lịch trực quan các khoản phải chi theo cấu trúc 7 ngày trong tuần
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-100 text-center text-xs font-bold text-slate-700">
          {daysOfWeek.map((dow, idx) => (
            <div
              key={dow}
              className={`py-2.5 ${idx >= 5 ? 'bg-amber-50/60 text-amber-900' : ''}`}
            >
              {dow}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100 min-h-[550px]">
          {calendarCells.map((cell, idx) => {
            if (cell.isBlank) {
              return <div key={`blank-${idx}`} className="bg-slate-50/50 p-2 min-h-[110px]"></div>;
            }

            const dayItems = cell.items || [];
            const dayTotal = dayItems.reduce(
              (sum, item) => (item.dataState === 'DECLARED' ? sum + item.amount : sum),
              0
            );

            return (
              <div
                key={`day-${cell.day}`}
                className={`p-2 min-h-[110px] flex flex-col justify-between transition-colors ${
                  cell.isWeekend ? 'bg-amber-50/20' : 'bg-white'
                } ${cell.isToday ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/20' : ''}`}
              >
                {/* Cell Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`h-6 w-6 rounded-full font-mono text-xs font-bold flex items-center justify-center ${
                      cell.isToday
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : cell.isWeekend
                        ? 'text-amber-800'
                        : 'text-slate-800'
                    }`}
                  >
                    {cell.day}
                  </span>
                  {dayTotal > 0 && (
                    <span className="font-mono text-[10px] font-bold text-slate-600 truncate max-w-[80px]">
                      {formatVND(dayTotal, discreteMode)}
                    </span>
                  )}
                </div>

                {/* Cards due on this day */}
                <div className="space-y-1 overflow-y-auto max-h-[120px] flex-1">
                  {dayItems.map(item => {
                    const isPaid = item.paymentStatus === 'PAID';
                    const isUnupdated = item.dataState === 'UNUPDATED';
                    const isNoExpense = item.dataState === 'NO_EXPENSE';
                    const isOverdue =
                      item.dueDateStatus === 'OVERDUE' || item.dueDateStatus === 'OVERDUE_UNUPDATED';

                    let badgeStyle = 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100';
                    if (isPaid) badgeStyle = 'bg-emerald-50 text-emerald-900 border-emerald-200 hover:bg-emerald-100';
                    else if (isOverdue) badgeStyle = 'bg-red-50 text-red-900 border-red-200 hover:bg-red-100';
                    else if (isUnupdated) badgeStyle = 'bg-purple-50 text-purple-900 border-purple-200 hover:bg-purple-100';
                    else if (isNoExpense) badgeStyle = 'bg-slate-100 text-slate-600 border-slate-200';

                    return (
                      <div
                        key={item.id}
                        onClick={() => onOpenDetailModal(item)}
                        className={`p-1.5 rounded-lg border text-[10px] cursor-pointer transition-all shadow-2xs ${badgeStyle}`}
                      >
                        <div className="font-bold truncate" title={item.cardName}>
                          {item.cardName}
                        </div>
                        <div className="flex items-center justify-between font-mono font-bold mt-0.5">
                          <span>
                            {isUnupdated
                              ? 'Chưa nhập'
                              : isNoExpense
                              ? '0 ₫'
                              : formatVND(item.amount, discreteMode)}
                          </span>
                          {isPaid && <CheckCircle2 className="w-3 h-3 text-emerald-600 inline ml-1" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

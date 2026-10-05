import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Calendar,
  Columns,
  CheckCircle2,
  AlertCircle,
  Clock,
  HelpCircle,
  Search,
  Filter,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  Check,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api.ts';
import { ObligationViewItem } from '../types.ts';
import { formatVND } from '../utils/dateUtils.ts';
import * as XLSX from 'xlsx';

interface YearlyMatrixTabProps {
  discreteMode: boolean;
  onOpenDetailModal?: (item: ObligationViewItem) => void;
  onOpenPaymentModal?: (item: ObligationViewItem) => void;
  onChangeMonth?: (monthStr: string) => void;
}

export const YearlyMatrixTab: React.FC<YearlyMatrixTabProps> = ({
  discreteMode,
  onOpenDetailModal,
  onOpenPaymentModal,
  onChangeMonth,
}) => {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [data, setData] = useState<any[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState<Record<number, any>>({});
  const [grandTotal, setGrandTotal] = useState<{ declared: number; paid: number; remaining: number }>({
    declared: 0,
    paid: 0,
    remaining: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBank, setSelectedBank] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'HAS_DEBT' | 'PAID' | 'UNUPDATED'>('ALL');

  const fetchYearlyData = async (y: number) => {
    setIsLoading(true);
    try {
      const res = await api.getMatrixYear(y);
      setData(res.matrix || []);
      setMonthlyTotals(res.monthlyTotals || {});
      if (res.grandTotal) {
        setGrandTotal(res.grandTotal);
      }
    } catch (err) {
      console.error('Failed to load yearly matrix', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchYearlyData(year);
  }, [year]);

  // Real-time synchronization when any payment or obligation is updated anywhere in the app
  useEffect(() => {
    const handleDataChanged = () => {
      fetchYearlyData(year);
    };
    window.addEventListener('app:data_changed', handleDataChanged);
    return () => {
      window.removeEventListener('app:data_changed', handleDataChanged);
    };
  }, [year]);

  // Unique banks for filter
  const banks = useMemo(() => {
    const bSet = new Set<string>();
    data.forEach(item => {
      if (item.card?.bankName) bSet.add(item.card.bankName);
    });
    return Array.from(bSet).sort();
  }, [data]);

  // Filtered rows
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const card = item.card;
      if (!card) return false;

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
      if (statusFilter === 'HAS_DEBT') {
        return item.totalYearRemaining > 0;
      }
      if (statusFilter === 'PAID') {
        return item.totalYearObligation > 0 && item.totalYearRemaining === 0;
      }
      if (statusFilter === 'UNUPDATED') {
        // Any month unupdated
        const monthsObj = item.months || {};
        return Object.values(monthsObj).some((m: any) => m && m.dataState === 'UNUPDATED');
      }

      return true;
    });
  }, [data, selectedBank, searchTerm, statusFilter]);

  const handleExportExcel = () => {
    const rows = data.map((item, idx) => {
      const rowObj: any = {
        STT: idx + 1,
        'Tên thẻ': item.card.name,
        'Ngân hàng': item.card.bankName,
        'Hạn mặc định': `Ngày ${item.card.defaultDueDay}`,
      };

      for (let m = 1; m <= 12; m++) {
        const mData = item.months?.[m];
        if (!mData) {
          rowObj[`Tháng ${m}`] = '—';
        } else if (mData.dataState === 'UNUPDATED') {
          rowObj[`Tháng ${m}`] = 'Chưa nhập';
        } else if (mData.dataState === 'NO_EXPENSE') {
          rowObj[`Tháng ${m}`] = 0;
        } else {
          rowObj[`Tháng ${m}`] = mData.amount;
        }
      }

      rowObj['Tổng cả năm'] = item.totalYearObligation;
      rowObj['Đã thanh toán'] = item.totalYearPaid;
      rowObj['Còn nợ'] = item.totalYearRemaining;

      return rowObj;
    });

    // Summary row
    const summaryRow: any = {
      STT: 'Tổng',
      'Tên thẻ': 'TỔNG CỘNG NĂM',
      'Ngân hàng': '',
      'Hạn mặc định': '',
    };
    for (let m = 1; m <= 12; m++) {
      summaryRow[`Tháng ${m}`] = monthlyTotals[m]?.declared || 0;
    }
    summaryRow['Tổng cả năm'] = grandTotal.declared;
    summaryRow['Đã thanh toán'] = grandTotal.paid;
    summaryRow['Còn nợ'] = grandTotal.remaining;
    rows.push(summaryRow);

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Ma trận năm ${year}`);
    XLSX.writeFile(wb, `Ma_tran_12_thang_nam_${year}.xlsx`);
  };

  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const completionRate = grandTotal.declared > 0 ? Math.round((grandTotal.paid / grandTotal.declared) * 100) : 0;

  return (
    <div className="space-y-4 animate-in fade-in duration-150">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Ma trận thanh toán 12 tháng trong năm</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              Năm {year}
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Theo dõi diễn biến nghĩa vụ thanh toán của tất cả các thẻ xuyên suốt 12 tháng. Bấm vào ô bất kỳ để xem chi tiết hoặc cập nhật.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Year navigator */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setYear(year - 1)}
              className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors"
              title="Năm trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 font-mono font-bold text-sm text-slate-800">{year}</span>
            <button
              onClick={() => setYear(year + 1)}
              className="p-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors"
              title="Năm sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Xuất Excel năm {year}</span>
          </button>
        </div>
      </div>

      {/* 2. Key Stats Cards for Year */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Tổng nghĩa vụ năm {year}</span>
            <Calendar className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-base font-bold font-mono text-slate-900 truncate">
            {formatVND(grandTotal.declared, discreteMode)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Tổng toàn bộ 12 tháng
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-600 text-xs mb-1">
            <span>Đã thanh toán</span>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="text-base font-bold font-mono text-emerald-700 truncate">
            {formatVND(grandTotal.paid, discreteMode)}
          </div>
          <div className="text-[11px] text-emerald-600 font-medium mt-0.5">
            Hoàn thành {completionRate}%
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-rose-600 text-xs mb-1">
            <span>Còn nợ cần trả</span>
            <AlertCircle className="w-4 h-4" />
          </div>
          <div className="text-base font-bold font-mono text-rose-700 truncate">
            {formatVND(grandTotal.remaining, discreteMode)}
          </div>
          <div className="text-[11px] text-rose-600 font-medium mt-0.5">
            {grandTotal.remaining === 0 ? 'Đã hoàn tất sạch nợ' : 'Dư nợ cần thanh toán'}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1">
            <span>Quy mô danh mục</span>
            <CreditCard className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-base font-bold font-mono text-slate-800">
            {data.length} thẻ
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {filteredData.length < data.length ? `Đang hiển thị ${filteredData.length} thẻ` : 'Tất cả thẻ trong hệ thống'}
          </div>
        </div>
      </div>

      {/* 3. Filter Bar */}
      <div className="bg-white rounded-2xl p-3 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo tên thẻ hoặc ngân hàng..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Bank filter */}
          <div className="flex items-center gap-1">
            <select
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
              className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">Tất cả ngân hàng ({banks.length})</option>
              {banks.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-xl text-[11px]">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                statusFilter === 'ALL' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tất cả
            </button>
            <button
              onClick={() => setStatusFilter('HAS_DEBT')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                statusFilter === 'HAS_DEBT' ? 'bg-white text-rose-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Còn nợ
            </button>
            <button
              onClick={() => setStatusFilter('UNUPDATED')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                statusFilter === 'UNUPDATED' ? 'bg-white text-purple-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Chưa nhập
            </button>
            <button
              onClick={() => setStatusFilter('PAID')}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-colors ${
                statusFilter === 'PAID' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Đã xong
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Đã thanh toán
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Còn nợ
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span> Chưa nhập
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-300"></span> 0 ₫
          </span>
        </div>
      </div>

      {/* 4. Main 12-month table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[640px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100/95 text-slate-700 sticky top-0 z-20 shadow-2xs backdrop-blur font-bold border-b border-slate-200">
              <tr>
                <th className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 min-w-[200px] border-r border-slate-200">
                  Tên thẻ & Ngân hàng
                </th>
                {months.map(m => {
                  const mStr = `${year}-${String(m).padStart(2, '0')}`;
                  return (
                    <th
                      key={m}
                      onClick={() => onChangeMonth?.(mStr)}
                      title={`Bấm để chuyển tới tháng ${m}/${year}`}
                      className="px-2 py-2 text-center min-w-[96px] border-r border-slate-200 cursor-pointer hover:bg-indigo-50/70 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span>T{m}</span>
                        <ArrowUpRight className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="text-[9px] font-normal text-slate-400">
                        {monthlyTotals[m]?.cardCount || 0} thẻ
                      </div>
                    </th>
                  );
                })}
                <th className="px-3 py-2.5 text-right min-w-[130px] bg-slate-200/80 sticky right-0 z-20">
                  Tổng cả năm
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={14} className="py-16 text-center text-slate-400">
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-indigo-600 mx-auto mb-2"></div>
                    <span>Đang nạp dữ liệu ma trận 12 tháng năm {year}...</span>
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="py-16 text-center text-slate-400">
                    <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-1.5" />
                    <span>Không tìm thấy thẻ nào khớp với tiêu chí lọc trong năm {year}.</span>
                  </td>
                </tr>
              ) : (
                filteredData.map(({ card, months: monthData, totalYearObligation, totalYearPaid, totalYearRemaining }) => (
                  <tr key={card.id} className="hover:bg-slate-50/80 transition-colors group">
                    {/* Fixed Card Name */}
                    <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50/90 px-3 py-2 border-r border-slate-200 font-semibold text-slate-900 shadow-2xs max-w-[200px]">
                      <div className="truncate font-bold text-xs" title={card.name}>
                        {card.name}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-0.5">
                        <span className="truncate">{card.bankName}</span>
                        <span className="font-mono text-indigo-600 font-medium">Hạn {card.defaultDueDay}</span>
                      </div>
                    </td>

                    {/* Months 1..12 */}
                    {months.map(m => {
                      const mData = monthData?.[m];
                      if (!mData) {
                        return (
                          <td key={m} className="px-1.5 py-2 text-center text-slate-300 border-r border-slate-100 text-[11px]">
                            —
                          </td>
                        );
                      }

                      const obl = mData.obligation;
                      const isUnupdated = mData.dataState === 'UNUPDATED';
                      const isNoExpense = mData.dataState === 'NO_EXPENSE';
                      const isPaid = mData.status === 'PAID';
                      const hasRemaining = mData.remaining > 0;

                      let cellBg = 'bg-slate-50/30 text-slate-700 hover:bg-slate-100';
                      let cellText = formatVND(mData.amount, discreteMode);
                      let subText = '';

                      if (isUnupdated) {
                        cellBg = 'bg-purple-50/60 text-purple-700 hover:bg-purple-100/80 border border-purple-100';
                        cellText = 'Chưa nhập';
                        subText = 'Bấm để nhập';
                      } else if (isNoExpense) {
                        cellBg = 'bg-slate-50/70 text-slate-400 hover:bg-slate-100';
                        cellText = '0 ₫';
                        subText = 'KPS';
                      } else if (isPaid) {
                        cellBg = 'bg-emerald-50/80 text-emerald-800 hover:bg-emerald-100/80 font-bold';
                        subText = '✓ Đã xong';
                      } else if (hasRemaining) {
                        cellBg = 'bg-rose-50/80 text-rose-800 hover:bg-rose-100/80 font-bold';
                        subText = `Còn ${formatVND(mData.remaining, discreteMode)}`;
                      }

                      return (
                        <td
                          key={m}
                          onClick={() => {
                            if (obl && onOpenDetailModal) {
                              onOpenDetailModal(obl);
                            }
                          }}
                          className={`px-1.5 py-1.5 text-center font-mono border-r border-slate-100 cursor-pointer transition-all ${cellBg}`}
                          title={`Tháng ${m}/${year} - ${card.name}: ${cellText} ${subText ? `(${subText})` : ''}. Bấm để xem chi tiết.`}
                        >
                          <div className="truncate text-[10px] leading-tight font-semibold">
                            {cellText}
                          </div>
                          {subText && (
                            <div className="text-[9px] opacity-80 truncate leading-none mt-0.5 font-sans">
                              {subText}
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Yearly Total */}
                    <td className="px-3 py-2 text-right font-mono text-xs bg-slate-50/80 sticky right-0 z-10 border-l border-slate-200">
                      <div className="font-bold text-slate-900">
                        {formatVND(totalYearObligation, discreteMode)}
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                        {totalYearRemaining > 0 ? (
                          <span className="text-rose-600 font-medium">Nợ {formatVND(totalYearRemaining, discreteMode)}</span>
                        ) : totalYearObligation > 0 ? (
                          <span className="text-emerald-600 font-medium">Đã xong</span>
                        ) : (
                          <span>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* 5. Summary Footer Row */}
            {data.length > 0 && (
              <tfoot className="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300 sticky bottom-0 z-20 shadow-md">
                <tr>
                  <td className="sticky left-0 z-30 bg-slate-100 px-3 py-2.5 border-r border-slate-300 text-xs">
                    <div className="font-extrabold text-slate-900">TỔNG CỘNG THÁNG</div>
                    <div className="text-[10px] text-slate-500 font-normal">Tất cả {data.length} thẻ</div>
                  </td>

                  {months.map(m => {
                    const mTot = monthlyTotals[m];
                    const declared = mTot?.declared || 0;
                    const paid = mTot?.paid || 0;
                    const rem = mTot?.remaining || 0;

                    return (
                      <td key={m} className="px-1.5 py-2 text-center font-mono border-r border-slate-200 text-[10px]">
                        <div className="font-extrabold text-slate-900 truncate">
                          {formatVND(declared, discreteMode)}
                        </div>
                        <div className="text-[9px] mt-0.5 flex flex-col items-center leading-none">
                          {rem > 0 ? (
                            <span className="text-rose-700 font-semibold truncate">Nợ: {formatVND(rem, discreteMode)}</span>
                          ) : declared > 0 ? (
                            <span className="text-emerald-700 font-semibold">Đã xong</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  {/* Grand total */}
                  <td className="px-3 py-2 text-right font-mono bg-slate-200 text-slate-900 sticky right-0 z-30 border-l border-slate-300">
                    <div className="font-black text-xs text-indigo-950">
                      {formatVND(grandTotal.declared, discreteMode)}
                    </div>
                    <div className="text-[10px] text-rose-700 font-bold mt-0.5">
                      Còn nợ: {formatVND(grandTotal.remaining, discreteMode)}
                    </div>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};

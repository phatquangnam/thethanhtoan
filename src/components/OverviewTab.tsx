import React from 'react';
import {
  CreditCard,
  AlertCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  TrendingDown,
  DollarSign,
  Calendar,
  ChevronRight,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { MonthSummary, ObligationViewItem } from '../types.ts';
import { formatVND, formatDateVN, diffDays, getCurrentDateStr } from '../utils/dateUtils.ts';

interface OverviewTabProps {
  summary: MonthSummary | null;
  discreteMode: boolean;
  onOpenPaymentModal: (item: ObligationViewItem) => void;
  onOpenDetailModal: (item: ObligationViewItem) => void;
  onNavigateToQuickUpdate: () => void;
  onNavigateToMatrix: () => void;
  onApplyWeekendShift: (item: ObligationViewItem) => void;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({
  summary,
  discreteMode,
  onOpenPaymentModal,
  onOpenDetailModal,
  onNavigateToQuickUpdate,
  onNavigateToMatrix,
  onApplyWeekendShift,
}) => {
  if (!summary) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const today = getCurrentDateStr();

  return (
    <div className="space-y-6">
      {/* 1. Unupdated Warning Banner (Mục 6.A: Cảnh báo thiếu dữ liệu) */}
      {!summary.isFullyUpdated && (
        <div
          id="banner-unupdated-warning"
          className="rounded-2xl bg-amber-50 border border-amber-200/90 p-4 sm:p-5 text-amber-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-amber-950">
                Tổng tiền hiện chưa bao gồm {summary.unupdatedCardsCount} thẻ chưa cập nhật số tiền
              </h3>
              <p className="text-xs sm:text-sm text-amber-800 mt-0.5">
                Các thẻ chưa khai báo số tiền sẽ không tự coi là 0 hoặc đã thanh toán. Vui lòng khai báo số tiền cần thanh toán hoặc xác nhận "Không phát sinh" để đảm bảo tổng nghĩa vụ chính xác.
              </p>
            </div>
          </div>
          <button
            id="btn-overview-quick-update"
            onClick={onNavigateToQuickUpdate}
            className="shrink-0 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
          >
            <span>Khai báo ngay ({summary.unupdatedCardsCount} thẻ)</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Tổng nghĩa vụ đã khai báo */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tổng nghĩa vụ tháng</span>
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono tracking-tight text-slate-900">
              {formatVND(summary.totalObligationDeclared, discreteMode)}
            </span>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{summary.totalCardsTracked} thẻ theo dõi</span>
              <span className="font-semibold text-emerald-600">
                {summary.noExpenseCardsCount} không phát sinh
              </span>
            </div>
          </div>
        </div>

        {/* Metric 2: Đã thanh toán cho nghĩa vụ tháng */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Đã thanh toán kỳ này</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono tracking-tight text-emerald-600">
              {formatVND(summary.totalPaidForMonthObligations, discreteMode)}
            </span>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{summary.fullyPaidCardsCount} thẻ đã trả đủ</span>
              <span className="text-sky-600 font-semibold">{summary.partialPaidCardsCount} trả một phần</span>
            </div>
          </div>
        </div>

        {/* Metric 3: Còn phải thanh toán tháng này */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Còn phải thanh toán</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono tracking-tight text-rose-600">
              {formatVND(summary.totalRemaining, discreteMode)}
            </span>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span>{summary.unpaidCardsCount} thẻ chưa thanh toán</span>
              {summary.unupdatedCardsCount > 0 && (
                <span className="text-amber-600 font-semibold">+{summary.unupdatedCardsCount} chưa cập nhật</span>
              )}
            </div>
          </div>
        </div>

        {/* Metric 4: Nợ đã quá hạn */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nợ đã quá hạn</span>
            <div className="p-2 bg-red-100 text-red-700 rounded-xl">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-black font-mono tracking-tight text-red-700">
              {formatVND(summary.totalOverdueAmount, discreteMode)}
            </span>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
              <span className="text-red-600 font-semibold">
                {summary.overdueObligations.length} khoản cần trả gấp
              </span>
              <button
                onClick={onNavigateToMatrix}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5"
              >
                <span>Ma trận</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Dòng tiền thực chi vs Nghĩa vụ thanh toán (Phân biệt Mục 11 & Test 11) */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-5 text-white shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                Phân tích dòng tiền
              </span>
              <h3 className="text-base font-bold text-white">Nghĩa vụ tháng vs Dòng tiền thực chi</h3>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Khoản thanh toán được phân biệt rõ: Đã trả cho nghĩa vụ đến hạn tháng {summary.month} và Số tiền tiền mặt thực tế đã chi trong tháng theo ngày giao dịch (không tính trùng).
            </p>
          </div>

          <div className="flex items-center gap-6 divide-x divide-slate-700">
            <div>
              <span className="text-xs text-slate-400 block">Đã trả nghĩa vụ kỳ này</span>
              <span className="text-lg font-mono font-bold text-emerald-400">
                {formatVND(summary.totalPaidForMonthObligations, discreteMode)}
              </span>
            </div>
            <div className="pl-6">
              <span className="text-xs text-slate-400 block">Dòng tiền thực chi trong tháng</span>
              <span className="text-lg font-mono font-bold text-sky-400">
                {formatVND(summary.actualCashflowPaidInMonth, discreteMode)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Two columns: Due today / Next 7 days & Prior Unpaid Obligations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column Left: Đến hạn hôm nay & 7 ngày tới */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-base">Đến hạn hôm nay & trong 7 ngày tới</h3>
            </div>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              {summary.dueToday.length + summary.upcomingDueNext7Days.length} thẻ
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[420px]">
            {summary.dueToday.length === 0 && summary.upcomingDueNext7Days.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                Không có thẻ nào đến hạn trong 7 ngày tới. Tuyệt vời!
              </div>
            ) : (
              <>
                {/* Due today */}
                {summary.dueToday.map(item => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{item.cardName}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide bg-rose-100 text-rose-800">
                          Hôm nay
                        </span>
                        {item.isEstimatedDue && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                            Ngày dự kiến
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.bankName} • Hạn {formatDateVN(item.actualDueDate)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 text-right">
                      <div>
                        <div className="font-mono font-bold text-sm text-rose-600">
                          {formatVND(item.remainingAmount, discreteMode)}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {item.paymentStatus === 'PARTIAL' ? 'Đã trả một phần' : 'Chưa trả'}
                        </span>
                      </div>
                      <button
                        id={`btn-pay-today-${item.id}`}
                        onClick={() => onOpenPaymentModal(item)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors shadow-2xs"
                      >
                        Thanh toán
                      </button>
                    </div>
                  </div>
                ))}

                {/* Upcoming next 7 days */}
                {summary.upcomingDueNext7Days.map(item => {
                  const daysLeft = diffDays(today, item.actualDueDate);
                  return (
                    <div key={item.id} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">{item.cardName}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Còn {daysLeft} ngày
                          </span>
                          {item.isWeekendFridaySuggested && (
                            <button
                              onClick={() => onApplyWeekendShift(item)}
                              className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors"
                              title="Ngày đến hạn rơi vào cuối tuần. Nhấn để đề xuất dời theo dõi sang thứ 6 trước đó"
                            >
                              Dời thứ 6
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {item.bankName} • Hạn {formatDateVN(item.actualDueDate)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 text-right">
                        <div>
                          <div className="font-mono font-bold text-sm text-slate-900">
                            {formatVND(item.remainingAmount, discreteMode)}
                          </div>
                          <span className="text-[11px] text-slate-400">
                            {item.paymentStatus === 'PARTIAL' ? 'Đã trả một phần' : 'Chưa trả'}
                          </span>
                        </div>
                        <button
                          id={`btn-pay-upcoming-${item.id}`}
                          onClick={() => onOpenPaymentModal(item)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 font-semibold text-xs transition-colors border border-slate-200"
                        >
                          Trả tiền
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Column Right: Khoản tồn từ kỳ trước (Mục 2 & Mục 6.A) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="font-bold text-slate-900 text-base">Khoản tồn từ kỳ trước</h3>
                <p className="text-xs text-slate-500">
                  Các khoản nợ quá hạn từ các tháng trước (không cộng dồn vào phát sinh mới)
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-50 text-rose-800 border border-rose-200">
              {summary.priorUnpaidObligations.length} khoản nợ cũ
            </span>
          </div>

          <div className="mt-3 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[420px]">
            {summary.priorUnpaidObligations.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-sm">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                Không có khoản nợ tồn đọng từ các tháng trước. Sổ sách hoàn toàn sạch nợ cũ!
              </div>
            ) : (
              summary.priorUnpaidObligations.map(item => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{item.cardName}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                        Kỳ {item.month}
                      </span>
                      {item.cardStatus === 'archived' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                          Thẻ đã lưu trữ
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {item.bankName} • Hạn gốc: {item.actualDueDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 text-right">
                    <div>
                      <div className="font-mono font-bold text-sm text-rose-600">
                        {formatVND(item.remainingAmount, discreteMode)}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Đã trả: {formatVND(item.totalPaid, discreteMode)}
                      </span>
                    </div>
                    <button
                      id={`btn-pay-prior-${item.id}`}
                      onClick={() => onOpenPaymentModal(item)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shadow-2xs"
                    >
                      Trả nợ cũ
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

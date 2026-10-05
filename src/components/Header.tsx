import React from 'react';
import {
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Eye,
  EyeOff,
  Bell,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Grid3X3,
  ListOrdered,
  CalendarDays,
  Settings,
  Columns,
  RefreshCw,
} from 'lucide-react';
import { parseYearMonth, formatYearMonth, getPrevMonth, getNextMonth, getCurrentYearMonth } from '../utils/dateUtils.ts';
import { MonthSummary } from '../types.ts';
import { SyncBadge } from './SyncBadge';

interface HeaderProps {
  currentMonth: string;
  onMonthChange: (m: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  discreteMode: boolean;
  onToggleDiscrete: () => void;
  summary: MonthSummary | null;
  unreadNotifsCount: number;
  onOpenNotifications: () => void;
  onOpenCheckCompletion: () => void;
  onRefreshData: () => void;
  isLoading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentMonth,
  onMonthChange,
  activeTab,
  onTabChange,
  discreteMode,
  onToggleDiscrete,
  summary,
  unreadNotifsCount,
  onOpenNotifications,
  onOpenCheckCompletion,
  onRefreshData,
  isLoading,
}) => {
  const { year, month } = parseYearMonth(currentMonth);
  const curRealMonth = getCurrentYearMonth();
  const isCurrentRealMonth = currentMonth === curRealMonth;

  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: Calendar },
    { id: 'matrix', label: 'Ma trận tháng', icon: Grid3X3 },
    { id: 'quick-batch', label: 'Cập nhật nhanh', icon: FileSpreadsheet },
    { id: 'calendar', label: 'Lịch thanh toán', icon: CalendarDays },
    { id: 'cards', label: 'Danh mục thẻ', icon: CreditCard },
    { id: 'yearly-matrix', label: 'Ma trận 12 tháng', icon: Columns },
    { id: 'settings', label: 'Cài đặt & Sao lưu', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs">
      {/* Top utility row */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand & App Title */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 flex items-center justify-center text-white shadow-sm ring-1 ring-black/5">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900">
                SỔ THEO DÕI THANH TOÁN THẺ
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                VND • 40 Thẻ
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Quản lý nghĩa vụ, ma trận ngày đến hạn & nhắc việc theo tháng
            </p>
          </div>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-2 bg-slate-100/90 p-1 rounded-xl border border-slate-200/80">
          <button
            id="btn-prev-month"
            onClick={() => onMonthChange(getPrevMonth(currentMonth))}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
            title="Tháng trước"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 font-mono font-bold text-sm text-slate-800">
            <Calendar className="w-4 h-4 text-indigo-600" />
            <span>Tháng {String(month).padStart(2, '0')}/{year}</span>
          </div>

          <button
            id="btn-next-month"
            onClick={() => onMonthChange(getNextMonth(currentMonth))}
            className="p-1.5 rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
            title="Tháng sau"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {!isCurrentRealMonth && (
            <button
              id="btn-today-month"
              onClick={() => onMonthChange(curRealMonth)}
              className="ml-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-2xs"
            >
              Về tháng này
            </button>
          )}
        </div>

        {/* Action Controls: Completion Checker, Discrete mode, Notifications */}
        <div className="flex items-center gap-2">
          {/* Check Completion Button */}
          {summary && (
            <button
              id="btn-check-completion"
              onClick={onOpenCheckCompletion}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shadow-2xs ${
                summary.isFullyUpdated
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100 animate-pulse'
              }`}
            >
              {summary.isFullyUpdated ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Đã cập nhật đủ (40/{summary.totalCardsTracked})</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>Còn {summary.unupdatedCardsCount} thẻ chưa cập nhật</span>
                </>
              )}
            </button>
          )}

          {/* Supabase Realtime Status */}
          <SyncBadge />

          {/* Discrete Mode Toggle */}
          <button
            id="btn-toggle-discrete"
            onClick={onToggleDiscrete}
            className={`p-2 rounded-lg border transition-colors ${
              discreteMode
                ? 'bg-amber-50 border-amber-300 text-amber-700'
                : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
            title={discreteMode ? 'Đang ẩn số tiền (Bấm để hiện)' : 'Ẩn số tiền để bảo mật'}
          >
            {discreteMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>

          {/* Refresh Data */}
          <button
            id="btn-refresh-data"
            onClick={onRefreshData}
            disabled={isLoading}
            className="p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
          </button>

          {/* Notifications Center */}
          <button
            id="btn-open-notifications"
            onClick={onOpenNotifications}
            className="relative p-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
            title="Trung tâm thông báo & nhắc việc"
          >
            <Bell className="w-4 h-4" />
            {unreadNotifsCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
                {unreadNotifsCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-1 overflow-x-auto no-scrollbar border-t border-slate-100 py-1.5">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-200/80 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

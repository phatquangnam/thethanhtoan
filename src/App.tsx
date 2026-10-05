import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header.tsx';
import { OverviewTab } from './components/OverviewTab.tsx';
import { MatrixTab } from './components/MatrixTab.tsx';
import { QuickBatchUpdateTab } from './components/QuickBatchUpdateTab.tsx';
import { CalendarTab } from './components/CalendarTab.tsx';
import { CardsCatalogTab } from './components/CardsCatalogTab.tsx';
import { YearlyMatrixTab } from './components/YearlyMatrixTab.tsx';
import { SettingsAndTestsTab } from './components/SettingsAndTestsTab.tsx';

import { PaymentModal } from './components/PaymentModal.tsx';
import { ObligationDetailModal } from './components/ObligationDetailModal.tsx';
import { CardModal } from './components/CardModal.tsx';
import { CheckCompletionModal } from './components/CheckCompletionModal.tsx';
import { NotificationCenterModal } from './components/NotificationCenterModal.tsx';
import { ImportCsvModal } from './components/ImportCsvModal.tsx';

import { supabase } from './supabase';
import { api } from './api.ts';
import { Card, ObligationViewItem, MonthSummary, NotificationLog, UserConfig } from './types.ts';
import { getCurrentYearMonth, parseYearMonth } from './utils/dateUtils.ts';

export const App: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentYearMonth());
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [discreteMode, setDiscreteMode] = useState<boolean>(() => {
    return localStorage.getItem('discreteMode') === 'true';
  });

  // Data states
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [obligations, setObligations] = useState<ObligationViewItem[]>([]);
  const [matrixData, setMatrixData] = useState<any>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [notifications, setNotifications] = useState<NotificationLog[]>([]);
  const [unreadNotifsCount, setUnreadNotifsCount] = useState<number>(0);
  const [userConfig, setUserConfig] = useState<UserConfig>({
    userId: '',
    dailyDigestTime: '08:00',
    emailEnabled: false,
    discreteMode: false,
    targetEmail: '',
  });

  const [loadError, setLoadError] = useState('');
  const loadSerial = useRef(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Modals
  const [paymentObligation, setPaymentObligation] = useState<ObligationViewItem | null>(null);
  const [detailObligation, setDetailObligation] = useState<ObligationViewItem | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState<boolean>(false);
  const [cardToEdit, setCardToEdit] = useState<Card | null>(null);
  const [isCompletionModalOpen, setIsCompletionModalOpen] = useState<boolean>(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);

  // Toggle discrete mode
  const handleToggleDiscrete = () => {
    const nextVal = !discreteMode;
    setDiscreteMode(nextVal);
    localStorage.setItem('discreteMode', String(nextVal));
    api.updateSettings({ discreteMode: nextVal }).catch(() => {});
  };

  // Main data fetcher
  const loadMonthData = useCallback(async (monthStr: string) => {
    const serial = ++loadSerial.current;
    setIsLoading(true);setLoadError('');
    try {
      const d = await api.loadMonthData(monthStr);
      if (serial !== loadSerial.current) return;
      setSummary(d.summary);setObligations(d.obligations);setMatrixData(d.matrix);setCards(d.cards);
      setNotifications(d.notifications);setUnreadNotifsCount(d.notifications.filter(n=>!n.read).length);setUserConfig(d.config);
      setDiscreteMode(d.config.discreteMode);
    } catch (err: any) { if(serial===loadSerial.current)setLoadError(err.message || 'Không tải được dữ liệu'); }
    finally { if(serial===loadSerial.current)setIsLoading(false); }

  }, []);

  useEffect(() => {
    loadMonthData(currentMonth);
  }, [currentMonth, loadMonthData]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined;
    let stopped=false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{loadMonthData(currentMonth);window.dispatchEvent(new CustomEvent('app:data_changed'));},350);};
    supabase.auth.getUser().then(({data})=>{
      if(stopped||!data.user)return;
      channel=supabase.channel('changes-'+data.user.id).on('postgres_changes',{event:'*',schema:'public',table:'app_changes',filter:'user_id=eq.'+data.user.id},refresh).subscribe(status=>{
        window.dispatchEvent(new CustomEvent('app:connection',{detail:status}));
        if(status==='SUBSCRIBED')refresh();
      });
    });
    window.addEventListener('focus',refresh);
    const fallback=setInterval(refresh,60000);
    return()=>{stopped=true;clearTimeout(timer);clearInterval(fallback);if(channel)supabase.removeChannel(channel);window.removeEventListener('focus',refresh);};
  },[currentMonth,loadMonthData]);

  // Handlers for payments
  const handleRecordPayment = async (data: {
    obligationId: string;
    amount: number;
    paidDate: string;
    notes?: string;
    referenceCode?: string;
    receiptUrl?: string | null;
    declaredAmount?: number;
    requestId?: string;
  }) => {
    const res = await api.recordPayment(data);
    await loadMonthData(currentMonth);
    // update detail obligation if open
    if (detailObligation && detailObligation.id === data.obligationId) {
      setDetailObligation(res.updatedObligation);
    }
    if (paymentObligation && paymentObligation.id === data.obligationId) {
      setPaymentObligation(res.updatedObligation);
    }
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleCancelPayment = async (paymentId: string, reason: string) => {
    const res = await api.cancelPayment(paymentId, reason);
    await loadMonthData(currentMonth);
    if (res.updatedObligation) {
      if (detailObligation && detailObligation.id === res.updatedObligation.id) {
        setDetailObligation(res.updatedObligation);
      }
      if (paymentObligation && paymentObligation.id === res.updatedObligation.id) {
        setPaymentObligation(res.updatedObligation);
      }
    }
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  // Handlers for obligations
  const handleUpdateObligation = async (
    id: string,
    data: { amount?: number; actualDueDate?: string; notes?: string; reason?: string }
  ) => {
    const updated = await api.updateObligation(id, data);
    await loadMonthData(currentMonth);
    setDetailObligation(updated);
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleConfirmNoExpense = async (id: string) => {
    const updated = await api.confirmNoExpense(id);
    await loadMonthData(currentMonth);
    setDetailObligation(updated);
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleApplyWeekendShift = async (id: string) => {
    const updated = await api.applyWeekendShift(id);
    await loadMonthData(currentMonth);
    setDetailObligation(updated);
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleBatchSave = async (updates: any[], reason?: string): Promise<boolean> => {
    try {
      const res = await api.batchUpdateObligations(updates, reason);
      if (res.errors && res.errors.length > 0) {
        alert(
          'Đã lưu một số dòng. Các dòng sau gặp lỗi:\n' +
            res.errors.map(e => `• ${e.cardName}: ${e.error}`).join('\n')
        );
      }
      await loadMonthData(currentMonth);
      window.dispatchEvent(new CustomEvent('app:data_changed'));
      return true;
    } catch (err: any) {
      alert(err.message || 'Lỗi lưu hàng loạt');
      return false;
    }
  };

  // Handlers for cards
  const handleSaveCard = async (data: Partial<Card> & { applyDueDayFromMonth?: string }) => {
    if (cardToEdit) {
      await api.updateCard(cardToEdit.id, data);
    } else {
      await api.createCard(data);
    }
    await loadMonthData(currentMonth);
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleToggleArchiveCard = async (card: Card) => {
    const nextStatus = card.status === 'active' ? 'archived' : 'active';
    await api.updateCard(card.id, { status: nextStatus });
    await loadMonthData(currentMonth);
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleDeleteCard = async (card: Card) => {
    await api.deleteCard(card.id);
    await loadMonthData(currentMonth);
    window.dispatchEvent(new CustomEvent('app:data_changed'));
  };

  const handleDeleteBatchCards = async (cardIds: string[]) => {
    await api.deleteBatchCards(cardIds);
    await loadMonthData(currentMonth);
  };

  const handleImportBatchCards = async (importedList: any[], replaceExisting: boolean = false) => {
    await api.importBatchCards(importedList, replaceExisting);
    await loadMonthData(currentMonth);
  };

  // Unupdated obligations for Completion Modal
  const unupdatedObligations = obligations.filter(o => o.dataState === 'UNUPDATED');

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 flex flex-col font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {loadError && <div role="alert" className="bg-red-50 text-red-800 p-4 border-b border-red-200">{loadError}<button className="ml-4 underline" onClick={()=>loadMonthData(currentMonth)}>Thử tải lại</button></div>}
      {/* 1. Top Header & Navigation */}
      <Header
        currentMonth={currentMonth}
        onMonthChange={setCurrentMonth}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        discreteMode={discreteMode}
        onToggleDiscrete={handleToggleDiscrete}
        summary={summary}
        unreadNotifsCount={unreadNotifsCount}
        onOpenNotifications={() => setIsNotificationModalOpen(true)}
        onOpenCheckCompletion={() => setIsCompletionModalOpen(true)}
        onRefreshData={() => loadMonthData(currentMonth)}
        isLoading={isLoading}
      />

      {/* 2. Main Content View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'overview' && (
          <OverviewTab
            summary={summary}
            discreteMode={discreteMode}
            onOpenPaymentModal={item => setPaymentObligation(item)}
            onOpenDetailModal={item => setDetailObligation(item)}
            onNavigateToQuickUpdate={() => setActiveTab('quick-batch')}
            onNavigateToMatrix={() => setActiveTab('matrix')}
            onApplyWeekendShift={item => handleApplyWeekendShift(item.id)}
          />
        )}

        {activeTab === 'matrix' && (
          <MatrixTab
            matrixData={matrixData}
            discreteMode={discreteMode}
            onOpenPaymentModal={item => setPaymentObligation(item)}
            onOpenDetailModal={item => setDetailObligation(item)}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'quick-batch' && (
          <QuickBatchUpdateTab
            obligations={obligations}
            onBatchSave={handleBatchSave}
            onRefresh={() => loadMonthData(currentMonth)}
            isLoading={isLoading}
          />
        )}

        {activeTab === 'calendar' && (
          <CalendarTab
            currentMonth={currentMonth}
            obligations={obligations}
            discreteMode={discreteMode}
            onOpenDetailModal={item => setDetailObligation(item)}
            onOpenPaymentModal={item => setPaymentObligation(item)}
          />
        )}

        {activeTab === 'cards' && (
          <CardsCatalogTab
            cards={cards}
            onAddNewCard={() => {
              setCardToEdit(null);
              setIsCardModalOpen(true);
            }}
            onEditCard={card => {
              setCardToEdit(card);
              setIsCardModalOpen(true);
            }}
            onDeleteCard={handleDeleteCard}
            onDeleteBatchCards={handleDeleteBatchCards}
            onToggleArchive={handleToggleArchiveCard}
            onOpenImportModal={() => setIsImportModalOpen(true)}
          />
        )}

        {activeTab === 'yearly-matrix' && (
          <YearlyMatrixTab
            discreteMode={discreteMode}
            onOpenDetailModal={item => setDetailObligation(item)}
            onOpenPaymentModal={item => setPaymentObligation(item)}
            onChangeMonth={month => {
              setCurrentMonth(month);
              setActiveTab('overview');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsAndTestsTab
            config={userConfig}
            onUpdateConfig={async cfg => {
              const updated = await api.updateSettings(cfg);
              setUserConfig(updated);
            }}
              />
        )}
      </main>

      {/* 3. Modals */}
      {paymentObligation && (
        <PaymentModal
          obligation={paymentObligation}
          discreteMode={discreteMode}
          onClose={() => setPaymentObligation(null)}
          onRecordPayment={handleRecordPayment}
          onCancelPayment={handleCancelPayment}
        />
      )}

      {detailObligation && (
        <ObligationDetailModal
          obligation={detailObligation}
          discreteMode={discreteMode}
          onClose={() => setDetailObligation(null)}
          onUpdateObligation={handleUpdateObligation}
          onConfirmNoExpense={handleConfirmNoExpense}
          onApplyWeekendShift={handleApplyWeekendShift}
          onOpenPaymentModal={item => setPaymentObligation(item)}
        />
      )}

      {isCardModalOpen && (
        <CardModal
          cardToEdit={cardToEdit}
          onClose={() => {
            setIsCardModalOpen(false);
            setCardToEdit(null);
          }}
          onSave={handleSaveCard}
        />
      )}

      {isCompletionModalOpen && summary && (
        <CheckCompletionModal
          summary={summary}
          unupdatedObligations={unupdatedObligations}
          onClose={() => setIsCompletionModalOpen(false)}
          onBatchSave={handleBatchSave}
        />
      )}

      {isNotificationModalOpen && (
        <NotificationCenterModal
          notifications={notifications}
          onClose={() => setIsNotificationModalOpen(false)}
          onMarkRead={async id => {
            await api.markNotificationRead(id);
            setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
            setUnreadNotifsCount(prev => Math.max(0, prev - 1));
          }}
          onMarkAllRead={async () => {
            await api.markAllNotificationsRead();
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            setUnreadNotifsCount(0);
          }}
          onTriggerCheck={async () => {
            await api.triggerReminderCheck();
            const res = await api.getNotifications();
            setNotifications(res.notifications);
            setUnreadNotifsCount(res.unreadCount);
          }}
          isLoading={isLoading}
        />
      )}

      {isImportModalOpen && (
        <ImportCsvModal
          onClose={() => setIsImportModalOpen(false)}
          onImportCards={handleImportBatchCards}
        />
      )}
    </div>
  );
};

export default App;

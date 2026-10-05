import React, { useState, useMemo } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  ShieldCheck,
  Calendar,
  FileSpreadsheet,
  Download,
  Edit2,
  Archive,
  ArchiveRestore,
  ExternalLink,
  Trash2,
  CheckSquare,
  Square,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card } from '../types.ts';
import * as XLSX from 'xlsx';
import { DeleteConfirmModal } from './DeleteConfirmModal.tsx';

interface CardsCatalogTabProps {
  cards: Card[];
  onAddNewCard: () => void;
  onEditCard: (card: Card) => void;
  onDeleteCard: (card: Card) => Promise<void>;
  onDeleteBatchCards: (cardIds: string[]) => Promise<void>;
  onToggleArchive: (card: Card) => void;
  onOpenImportModal: () => void;
}

export const CardsCatalogTab: React.FC<CardsCatalogTabProps> = ({
  cards,
  onAddNewCard,
  onEditCard,
  onDeleteCard,
  onDeleteBatchCards,
  onToggleArchive,
  onOpenImportModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBank, setSelectedBank] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('active');

  // Selection state for batch actions
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [cardsToDelete, setCardsToDelete] = useState<Card[] | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const banks = useMemo(() => {
    const bSet = new Set<string>();
    cards.forEach(c => bSet.add(c.bankName));
    return Array.from(bSet).sort();
  }, [cards]);

  const filteredCards = useMemo(() => {
    return cards.filter(c => {
      if (selectedBank !== 'ALL' && c.bankName !== selectedBank) return false;
      if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        return c.name.toLowerCase().includes(q) || c.bankName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [cards, selectedBank, statusFilter, searchTerm]);

  const isAllFilteredSelected =
    filteredCards.length > 0 && filteredCards.every(c => selectedCardIds.includes(c.id));

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      const filteredIdSet = new Set(filteredCards.map(c => c.id));
      setSelectedCardIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      const allIds = Array.from(new Set([...selectedCardIds, ...filteredCards.map(c => c.id)]));
      setSelectedCardIds(allIds);
    }
  };

  const handleSelectAllInSystem = () => {
    setSelectedCardIds(cards.map(c => c.id));
  };

  const handleClearSelection = () => {
    setSelectedCardIds([]);
  };

  const handleConfirmDelete = async () => {
    if (!cardsToDelete || cardsToDelete.length === 0) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const count = cardsToDelete.length;
      if (count === 1) {
        await onDeleteCard(cardsToDelete[0]);
      } else {
        await onDeleteBatchCards(cardsToDelete.map(c => c.id));
      }

      const deletedIds = new Set(cardsToDelete.map(c => c.id));
      setSelectedCardIds(prev => prev.filter(id => !deletedIds.has(id)));
      setCardsToDelete(null);

      setFeedbackMessage(`Đã xóa thành công ${count} thẻ khỏi hệ thống.`);
      setTimeout(() => setFeedbackMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Lỗi khi xóa thẻ. Vui lòng thử lại.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleExportExcel = () => {
    const data = filteredCards.map((c, idx) => ({
      STT: idx + 1,
      'Tên thẻ': c.name,
      'Ngân hàng': c.bankName,
      'Ngày đến hạn mặc định': c.defaultDueDay,
      'Tự động dời cuối tuần': c.autoWeekendShift ? 'Có' : 'Không',
      'Tháng bắt đầu theo dõi': c.startTrackingMonth,
      'Trạng thái': c.status === 'active' ? 'Đang theo dõi' : 'Đã lưu trữ',
      'Ghi chú': c.notes || '',
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Danh mục thẻ');
    XLSX.writeFile(wb, `Danh_muc_the_tin_dung_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Danh mục thẻ tín dụng</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {cards.length} thẻ trong hệ thống
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Quản lý danh sách thẻ, ngày đến hạn mặc định, xóa đơn lẻ hoặc xóa hàng loạt thẻ
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {cards.length > 0 && (
            <button
              onClick={handleSelectAllInSystem}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Chọn tất cả thẻ để thao tác xóa hoặc quản lý hàng loạt"
            >
              <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
              <span>Chọn tất cả ({cards.length})</span>
            </button>
          )}

          <button
            id="btn-import-cards-excel"
            onClick={onOpenImportModal}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Nhập Excel / CSV</span>
          </button>

          <button
            id="btn-export-cards-excel"
            onClick={handleExportExcel}
            className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Xuất Excel</span>
          </button>

          <button
            id="btn-add-new-card"
            onClick={onAddNewCard}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm thẻ mới</span>
          </button>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {feedbackMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-emerald-900 font-semibold animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedbackMessage}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between gap-3 text-xs text-red-900 font-semibold animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-700 hover:text-red-900 text-xs underline"
          >
            Đóng
          </button>
        </div>
      )}

      {/* 2. Security Banner */}
      <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-center gap-2.5">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
        <div>
          <span className="font-bold">Bảo vệ an toàn thông tin: </span>
          Ứng dụng chỉ lưu tên gợi nhớ và ngày đến hạn. Hệ thống tuyệt đối không yêu cầu và không lưu trữ số thẻ 16 số đầy đủ, ngày hết hạn, mã bảo mật CVV/CVC, mã PIN, mã OTP hay mật khẩu ngân hàng.
        </div>
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên thẻ hoặc ngân hàng..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <select
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

        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="active">Đang theo dõi</option>
          <option value="archived">Đã lưu trữ</option>
          <option value="ALL">Tất cả trạng thái</option>
        </select>
      </div>

      {/* 4. Batch Selection Action Bar (Appears when cards are selected) */}
      {selectedCardIds.length > 0 && (
        <div className="bg-red-50/90 border-2 border-red-300 p-3.5 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2 duration-150 shadow-xs">
          <div className="flex items-center gap-2.5 text-red-950 font-semibold">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
            </span>
            <span>
              Đã chọn <strong className="text-red-700 font-bold text-sm">{selectedCardIds.length}</strong> / {cards.length} thẻ
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-batch-delete-cards"
              onClick={() => {
                const toDelete = cards.filter(c => selectedCardIds.includes(c.id));
                setCardsToDelete(toDelete);
              }}
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-1.5 shadow-xs transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xóa {selectedCardIds.length} thẻ đã chọn</span>
            </button>

            <button
              onClick={handleClearSelection}
              className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold transition-colors"
            >
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* 5. Cards Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    title="Chọn / bỏ chọn tất cả thẻ đang hiển thị"
                    checked={isAllFilteredSelected}
                    onChange={handleToggleSelectAll}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 w-12 text-center">STT</th>
                <th className="px-4 py-3 min-w-[220px]">Tên thẻ tín dụng</th>
                <th className="px-4 py-3 min-w-[140px]">Ngân hàng</th>
                <th className="px-4 py-3 w-36 text-center">Hạn mặc định</th>
                <th className="px-4 py-3 w-40 text-center">Dời cuối tuần</th>
                <th className="px-4 py-3 w-32 text-center">Theo dõi từ</th>
                <th className="px-4 py-3 w-28 text-center">Trạng thái</th>
                <th className="px-4 py-3 min-w-[160px]">Ghi chú</th>
                <th className="px-4 py-3 w-28 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCards.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400 text-sm">
                    {cards.length === 0
                      ? 'Danh mục hiện tại đang trống (0 thẻ). Nhấn "Thêm thẻ mới" hoặc "Nhập Excel / CSV" để thêm thẻ.'
                      : 'Không tìm thấy thẻ nào phù hợp với bộ lọc tìm kiếm.'}
                  </td>
                </tr>
              ) : (
                filteredCards.map((card, idx) => {
                  const isSelected = selectedCardIds.includes(card.id);
                  return (
                    <tr
                      key={card.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-indigo-50/40' : ''
                      }`}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={e => {
                            if (e.target.checked) {
                              setSelectedCardIds(prev => [...prev, card.id]);
                            } else {
                              setSelectedCardIds(prev => prev.filter(id => id !== card.id));
                            }
                          }}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                        />
                      </td>

                      <td className="px-3 py-3 text-center text-slate-400 font-mono">{idx + 1}</td>

                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 text-sm">{card.name}</div>
                        <div className="text-[11px] text-slate-400">ID: {card.id.split('_').slice(-1)[0]}</div>
                      </td>

                      <td className="px-4 py-3 font-semibold text-slate-700">{card.bankName}</td>

                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-mono font-bold text-xs">
                          Ngày {card.defaultDueDay}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-center">
                        {card.autoWeekendShift ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                            Tự dời thứ 6
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Giữ nguyên</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center font-mono text-slate-600">
                        {card.startTrackingMonth}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {card.status === 'active' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Hoạt động
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                            Đã lưu trữ
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-slate-500 text-xs truncate max-w-xs">
                        {card.notes || <span className="text-slate-300 italic">Không có</span>}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onEditCard(card)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                            title="Sửa thông tin thẻ"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onToggleArchive(card)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title={card.status === 'active' ? 'Lưu trữ thẻ' : 'Khôi phục thẻ'}
                          >
                            {card.status === 'active' ? (
                              <Archive className="w-3.5 h-3.5" />
                            ) : (
                              <ArchiveRestore className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => setCardsToDelete([card])}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Xóa vĩnh viễn thẻ này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal (Avoids window.confirm in iframe) */}
      <DeleteConfirmModal
        isOpen={cardsToDelete !== null && cardsToDelete.length > 0}
        cardsToDelete={cardsToDelete || []}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          if (!isDeleting) setCardsToDelete(null);
        }}
      />
    </div>
  );
};

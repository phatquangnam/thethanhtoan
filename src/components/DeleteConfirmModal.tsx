import React from 'react';
import { AlertTriangle, Trash2, X, AlertCircle } from 'lucide-react';
import { Card } from '../types.ts';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  cardsToDelete: Card[];
  isDeleting: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  cardsToDelete,
  isDeleting,
  onConfirm,
  onClose,
}) => {
  if (!isOpen || cardsToDelete.length === 0) return null;

  const isBatch = cardsToDelete.length > 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={e => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-red-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-100 text-red-600 rounded-2xl">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isBatch ? `Xác nhận xóa hàng loạt ${cardsToDelete.length} thẻ` : 'Xác nhận xóa thẻ tín dụng'}
              </h3>
              <p className="text-xs text-red-600 font-medium">Hành động này không thể hoàn tác</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Warning Banner */}
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Lưu ý quan trọng: </span>
              Khi xóa {isBatch ? 'các thẻ này' : 'thẻ này'}, toàn bộ dữ liệu nghĩa vụ thanh toán của các kỳ (cả kỳ hiện tại và kỳ tiếp theo) cùng lịch sử ghi nhận thanh toán liên quan sẽ bị xóa vĩnh viễn khỏi hệ thống.
            </div>
          </div>

          {/* Cards List Preview */}
          <div>
            <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
              <span>{isBatch ? `Danh sách ${cardsToDelete.length} thẻ sẽ bị xóa:` : 'Thông tin thẻ sẽ bị xóa:'}</span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl divide-y divide-slate-200/50">
              {cardsToDelete.map(c => (
                <div key={c.id} className="pt-1.5 first:pt-0 flex items-center justify-between gap-2 text-xs">
                  <div className="truncate">
                    <span className="font-bold text-slate-800">{c.name}</span>
                    <span className="text-slate-400 text-[11px] ml-1.5">({c.bankName})</span>
                  </div>
                  <div className="text-[11px] text-slate-500 shrink-0 font-mono">
                    Hạn: Ngày {c.defaultDueDay}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50"
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onConfirm}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isDeleting
                ? 'Đang xóa...'
                : isBatch
                ? `Xóa vĩnh viễn ${cardsToDelete.length} thẻ`
                : 'Xóa vĩnh viễn thẻ này'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

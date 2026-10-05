import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Copy, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { parseDueDayValue, normalizeHeader } from '../utils/dateUtils';

interface ParsedCardItem {
  name: string;
  bankName: string;
  defaultDueDay: number | null;
  autoWeekendShift: boolean;
  notes?: string;
  startTrackingMonth?: string;
  rawDueVal?: any;
}

interface ImportCsvModalProps {
  onClose: () => void;
  onImportCards: (cards: any[], replaceExisting?: boolean) => Promise<void>;
}

export const ImportCsvModal: React.FC<ImportCsvModalProps> = ({ onClose, onImportCards }) => {
  const [parsedList, setParsedList] = useState<ParsedCardItem[]>([]);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  const sampleCsv = `Tên thẻ,Ngân hàng,Ngày đến hạn,Dời cuối tuần,Ghi chú
Techcombank Visa Signature,Techcombank,20,Có,Thẻ hoàn tiền ẩm thực
VIB Online Plus 2in1,VIB,25,Có,Mua sắm online hoàn 6%
VPBank StepUp Mastercard,VPBank,5,Không,Chi tiêu bảo hiểm và grab
MB Priority Visa,MBBank,10,Không,Chi tiêu công tác`;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if(file.size>10000000){setError('Tệp nhập vượt giới hạn 10 MB.');return;}

    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!data || data.length === 0) {
          setError('Tệp Excel không chứa dữ liệu hoặc trang tính rỗng.');
          return;
        }

        const normalized: ParsedCardItem[] = data.map((row: any) => {
          const keys = Object.keys(row);
          let name = '';
          let bankName = '';
          let rawDueVal: any = undefined;
          let autoWeekendShift = false;
          let notes = '';
          let startTrackingMonth = '';

          // Match by normalized keys
          for (const k of keys) {
            const norm = normalizeHeader(k);
            const val = row[k];
            if (val === undefined || val === null || val === '') continue;

            if (!name && (
              norm.includes('tenthe') || norm.includes('cardname') || norm === 'the' ||
              norm === 'name' || norm.includes('loaithe') || norm === 'ten'
            )) {
              name = String(val).trim();
            } else if (!bankName && (
              norm.includes('nganhang') || norm.includes('bankname') || norm.includes('bank') ||
              norm === 'nh' || norm.includes('tochuc')
            )) {
              bankName = String(val).trim();
            } else if (rawDueVal === undefined && (
              norm.includes('denhan') || norm.includes('dueday') || norm.includes('duedate') ||
              norm.includes('hanthanhtoan') || norm.includes('ngaythanhtoan') || norm.includes('hanchot') ||
              norm.includes('hantra') || norm.includes('chothan') || norm.includes('daohan') ||
              norm.includes('hanmacdinh') || norm.includes('ngaytt') || norm.includes('hantt') ||
              norm === 'han' || norm === 'due'
            )) {
              rawDueVal = val;
            } else if (
              norm.includes('doicuoituan') || norm.includes('cuoituan') ||
              norm.includes('weekend') || norm.includes('shift') || norm.includes('t6')
            ) {
              autoWeekendShift = String(val).toLowerCase().includes('có') ||
                String(val).toLowerCase().includes('co') ||
                String(val).toLowerCase() === 'true';
            } else if (!notes && (
              norm.includes('ghichu') || norm.includes('note') || norm.includes('notes') || norm.includes('mota')
            )) {
              notes = String(val).trim();
            } else if (!startTrackingMonth && (
              norm.includes('thangtheodoi') || norm.includes('batdau') || norm.includes('startmonth')
            )) {
              startTrackingMonth = String(val).trim();
            }
          }

          // Fallback: If not matched by header names, use column index position
          if (!name && keys[0]) name = String(row[keys[0]] || '').trim();
          if (!bankName && keys[1]) bankName = String(row[keys[1]] || '').trim();
          if (rawDueVal === undefined && keys[2]) rawDueVal = row[keys[2]];

          // Parse exact due day from the file
          const parsedDueDay = parseDueDayValue(rawDueVal);

          return {
            name,
            bankName,
            rawDueVal,
            defaultDueDay: parsedDueDay,
            autoWeekendShift,
            notes,
            startTrackingMonth,
          };
        }).filter(c => c.name && c.bankName);

        if (normalized.length === 0) {
          setError('Không tìm thấy dòng thẻ hợp lệ nào trong tệp. Hãy đảm bảo tệp có ít nhất cột Tên thẻ và Ngân hàng.');
          return;
        }

        setParsedList(normalized);
        setError(null);
      } catch (err: any) {
        setError('Không thể đọc file Excel/CSV. Vui lòng kiểm tra định dạng tệp: ' + (err.message || ''));
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleParseText = () => {
    try {
      const lines = rawText.trim().split('\n');
      const list: ParsedCardItem[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (i === 0 && (line.includes('Tên thẻ') || line.toLowerCase().includes('name') || line.toLowerCase().includes('ngân hàng'))) {
          continue;
        }

        // Split by tab, semicolon, or comma
        const parts = line.includes('\t')
          ? line.split('\t')
          : line.includes(';')
          ? line.split(';')
          : line.split(',');

        if (parts.length >= 2) {
          const name = parts[0]?.trim();
          const bank = parts[1]?.trim();
          const rawDay = parts[2]?.trim();
          const day = parseDueDayValue(rawDay);
          const shift = (parts[3]?.trim() || '').toLowerCase().includes('có') ||
            (parts[3]?.trim() || '').toLowerCase().includes('co') ||
            (parts[3]?.trim() || '').toLowerCase() === 'true';
          const notes = parts[4]?.trim() || '';

          if (name && bank) {
            list.push({
              name,
              bankName: bank,
              rawDueVal: rawDay,
              defaultDueDay: day,
              autoWeekendShift: shift,
              notes,
            });
          }
        }
      }

      if (list.length === 0) {
        setError('Không phân tích được thẻ nào từ dữ liệu dán. Hãy kiểm tra định dạng phân tách.');
        return;
      }

      setParsedList(list);
      setError(null);
    } catch (err: any) {
      setError('Lỗi phân tích cú pháp dữ liệu dán: ' + (err.message || ''));
    }
  };

  const handleUpdateCardDueDay = (index: number, valStr: string) => {
    const val = parseInt(valStr, 10);
    setParsedList(prev => {
      const copy = [...prev];
      if (copy[index]) {
        copy[index] = {
          ...copy[index],
          defaultDueDay: isNaN(val) ? null : val,
        };
      }
      return copy;
    });
  };

  const handleConfirmImport = async () => {
    if (parsedList.length === 0) return;

    // Strict validation: Verify every card has a valid due day from 1 to 31
    const invalidCards = parsedList.filter(c => !c.defaultDueDay || c.defaultDueDay < 1 || c.defaultDueDay > 31);
    if (invalidCards.length > 0) {
      setError(
        `Phát hiện ${invalidCards.length} thẻ chưa có ngày đến hạn hợp lệ (1-31): ${invalidCards.map(c => c.name).slice(0, 3).join(', ')}${invalidCards.length > 3 ? '...' : ''}. Vui lòng nhập ngày đến hạn trực tiếp ở bảng xem trước.`
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (replaceExisting && !confirm('Thay thế sẽ xóa toàn bộ thẻ, nghĩa vụ và giao dịch cũ. Anh đã sao lưu và muốn tiếp tục?')) return;
      await onImportCards(parsedList, replaceExisting);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi nhập danh sách thẻ');
    } finally {
      setIsSubmitting(false);
    }
  };

  const invalidDueDayCount = parsedList.filter(c => !c.defaultDueDay || c.defaultDueDay < 1 || c.defaultDueDay > 31).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-2xl">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Nhập danh mục thẻ từ Excel / CSV</h3>
              <p className="text-xs text-slate-500">
                Nhận diện chính xác ngày đến hạn từ tệp Excel/CSV mà không áp đặt ngày mặc định
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

        {/* Content */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl font-medium flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Replacement Rule Notice & Option */}
          <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-2">
            <div className="flex items-start gap-2.5 text-amber-950">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <span className="font-bold">Quy tắc thay thế danh mục thẻ:</span>
                <p className="text-amber-800 text-[11px] mt-0.5">
                  Mặc định thêm thẻ vào danh mục hiện tại. Nếu chọn thay thế, toàn bộ thẻ cũ cùng nghĩa vụ và giao dịch sẽ bị xóa. Hãy tải sao lưu trước khi thay thế.
                </p>
              </div>
            </div>

            <div className="pt-2 border-t border-amber-200/60 flex items-center gap-2">
              <input
                id="replace-existing-checkbox"
                type="checkbox"
                checked={replaceExisting}
                onChange={e => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded border-amber-300 focus:ring-amber-500 cursor-pointer"
              />
              <label htmlFor="replace-existing-checkbox" className="font-bold text-amber-900 cursor-pointer text-xs">
                Xóa bỏ thẻ cũ và thay thế hoàn toàn bằng danh sách mới
              </label>
            </div>
          </div>

          {/* Option 1: File Upload */}
          <div className="p-4 border-2 border-dashed border-slate-200 rounded-2xl text-center hover:border-indigo-400 transition-colors bg-slate-50/40">
            <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <label className="cursor-pointer text-indigo-600 font-bold hover:underline inline-block">
              <span>Chọn tệp Excel (.xlsx, .xls) hoặc CSV</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <p className="text-[11px] text-slate-500 mt-1">
              Hỗ trợ tự động nhận diện các cột: <span className="font-medium text-slate-700">Tên thẻ, Ngân hàng, Ngày đến hạn (hoặc Ngày đến hạn mặc định, Hạn thanh toán, Hạn chót, Due Date...), Dời cuối tuần, Ghi chú</span>
            </p>
            <p className="text-[10px] text-indigo-600 font-medium mt-1">
              ✓ Ngày đến hạn tuân thủ chính xác giá trị trong tệp (số 1-31, "Ngày 20", định dạng ngày, v.v.)
            </p>
          </div>

          {/* Option 2: Paste Raw text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">Hoặc dán văn bản phân tách bằng dấu phẩy (CSV) hoặc tab (Excel copy):</label>
              <button
                type="button"
                onClick={() => setRawText(sampleCsv)}
                className="text-indigo-600 font-semibold text-[11px] hover:underline flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>Điền mẫu ví dụ</span>
              </button>
            </div>
            <textarea
              rows={3}
              placeholder="Tên thẻ, Ngân hàng, Ngày đến hạn (1-31), Dời cuối tuần (Có/Không), Ghi chú..."
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 font-mono text-xs"
            />
            {rawText && (
              <button
                type="button"
                onClick={handleParseText}
                className="mt-1.5 px-3 py-1 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900"
              >
                Phân tích dữ liệu vừa dán
              </button>
            )}
          </div>

          {/* Preview Table */}
          {parsedList.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                  <span>Xem trước dữ liệu ({parsedList.length} thẻ):</span>
                  {invalidDueDayCount > 0 ? (
                    <span className="text-red-600 font-bold text-[11px] flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {invalidDueDayCount} thẻ chưa có ngày hạn
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-bold text-[11px] flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Tất cả ngày hạn đã nhận diện chuẩn
                    </span>
                  )}
                </h4>
                <span className="text-[11px] text-slate-500">
                  (Có thể sửa trực tiếp ngày hạn ở ô bên dưới trước khi nhập)
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="px-3 py-2">STT</th>
                      <th className="px-3 py-2">Tên thẻ</th>
                      <th className="px-3 py-2">Ngân hàng</th>
                      <th className="px-3 py-2 text-center w-28">Ngày đến hạn</th>
                      <th className="px-3 py-2 text-center">Dời T6</th>
                      <th className="px-3 py-2">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedList.map((item, idx) => {
                      const isValidDay = item.defaultDueDay && item.defaultDueDay >= 1 && item.defaultDueDay <= 31;
                      return (
                        <tr key={idx} className={`hover:bg-slate-50 ${!isValidDay ? 'bg-red-50/50' : ''}`}>
                          <td className="px-3 py-1.5 text-slate-400 font-mono text-[11px]">{idx + 1}</td>
                          <td className="px-3 py-1.5 font-bold text-slate-800">{item.name}</td>
                          <td className="px-3 py-1.5 text-slate-600">{item.bankName}</td>
                          <td className="px-3 py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400 text-[10px]">Ngày</span>
                              <input
                                type="number"
                                min={1}
                                max={31}
                                value={item.defaultDueDay ?? ''}
                                onChange={e => handleUpdateCardDueDay(idx, e.target.value)}
                                className={`w-14 px-1.5 py-0.5 text-center font-mono font-bold rounded border text-xs ${
                                  isValidDay
                                    ? 'bg-indigo-50/60 border-indigo-200 text-indigo-700'
                                    : 'bg-red-100 border-red-300 text-red-700 animate-pulse'
                                }`}
                                placeholder="1-31"
                              />
                            </div>
                            {!isValidDay && (
                              <div className="text-[10px] text-red-600 font-medium mt-0.5">
                                Cần nhập 1-31
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              item.autoWeekendShift ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {item.autoWeekendShift ? 'Có' : 'Không'}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-slate-400 text-[11px] truncate max-w-[140px]">
                            {item.notes || '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={parsedList.length === 0 || isSubmitting || invalidDueDayCount > 0}
              onClick={handleConfirmImport}
              className={`px-5 py-2.5 rounded-xl text-white font-bold shadow-xs transition-colors disabled:opacity-50 flex items-center gap-1.5 ${
                replaceExisting
                  ? 'bg-amber-600 hover:bg-amber-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Đang xử lý...'
                  : replaceExisting
                  ? `Xóa cũ & Nhập ${parsedList.length} thẻ mới`
                  : `Thêm ${parsedList.length} thẻ vào danh sách`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

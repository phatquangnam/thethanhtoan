/**
 * Utility functions for date calculations in Solar Calendar (Dương lịch)
 * Default timezone: Asia/Ho_Chi_Minh
 */

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

export function getDaysInMonth(year: number, month: number): number {
  // month is 1-12
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function parseYearMonth(ym: string): { year: number; month: number } {
  const parts = ym.split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
  };
}

export function formatYearMonth(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

export function getNextMonth(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  if (month === 12) {
    return formatYearMonth(year + 1, 1);
  }
  return formatYearMonth(year, month + 1);
}

export function getPrevMonth(ym: string): string {
  const { year, month } = parseYearMonth(ym);
  if (month === 1) {
    return formatYearMonth(year - 1, 12);
  }
  return formatYearMonth(year, month - 1);
}

/**
 * Calculate actual due date for a card in a given month.
 * If default day is > days in month (e.g. 31 in Feb), fallback to last day of month
 * and mark as isEstimatedDue = true.
 */
export function calculateDueDate(
  year: number,
  month: number,
  defaultDueDay: number,
  autoWeekendShift: boolean = false
): {
  dueDay: number;
  actualDueDate: string;
  isEstimatedDue: boolean;
  dueDateSource: 'DEFAULT' | 'MONTH_END_FALLBACK' | 'WEEKEND_FRIDAY_SUGGESTION';
  isWeekend: boolean;
  suggestedFridayDate?: string;
} {
  const maxDays = getDaysInMonth(year, month);
  let effectiveDay = defaultDueDay;
  let isEstimated = false;
  let source: 'DEFAULT' | 'MONTH_END_FALLBACK' | 'WEEKEND_FRIDAY_SUGGESTION' = 'DEFAULT';

  if (effectiveDay > maxDays) {
    effectiveDay = maxDays;
    isEstimated = true;
    source = 'MONTH_END_FALLBACK';
  }

  // Create date object (Month is 0-indexed in JS Date)
  const dt = new Date(Date.UTC(year, month - 1, effectiveDay));
  const dayOfWeek = dt.getUTCDay(); // 0 = Sun, 6 = Sat

  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  let suggestedFriday: string | undefined;

  if (isWeekend) {
    const shiftDays = dayOfWeek === 0 ? 2 : 1; // Sun -> -2 days (Fri), Sat -> -1 day (Fri)
    const friDt = new Date(Date.UTC(year, month - 1, effectiveDay - shiftDays));
    suggestedFriday = `${friDt.getUTCFullYear()}-${pad2(friDt.getUTCMonth() + 1)}-${pad2(friDt.getUTCDate())}`;

    if (autoWeekendShift) {
      effectiveDay = friDt.getUTCDate();
      source = 'WEEKEND_FRIDAY_SUGGESTION';
      return {
        dueDay: effectiveDay,
        actualDueDate: suggestedFriday,
        isEstimatedDue: isEstimated,
        dueDateSource: source,
        isWeekend: true,
        suggestedFridayDate: suggestedFriday,
      };
    }
  }

  const actualDueDate = `${year}-${pad2(month)}-${pad2(effectiveDay)}`;

  return {
    dueDay: effectiveDay,
    actualDueDate,
    isEstimatedDue: isEstimated,
    dueDateSource: source,
    isWeekend,
    suggestedFridayDate: suggestedFriday,
  };
}

/**
 * Difference in whole days between two YYYY-MM-DD dates (d2 - d1)
 */
export function diffDays(d1: string, d2: string): number {
  const t1 = new Date(d1).getTime();
  const t2 = new Date(d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * Add days to YYYY-MM-DD date
 */
export function addDays(d: string, days: number): string {
  const dt = new Date(d);
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/**
 * Calculate median from an array of numbers, rounded UP (Math.ceil) as mandated.
 */
export function calculateMedianCeil(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return Math.ceil(sorted[mid]);
  } else {
    return Math.ceil((sorted[mid - 1] + sorted[mid]) / 2);
  }
}

/**
 * Format currency in VND with standard formatting (e.g. 5.000.000 ₫)
 */
export function formatVND(amount: number, discrete: boolean = false): string {
  if (discrete) {
    return '•••••• ₫';
  }
  return new Intl.NumberFormat('vi-VN').format(amount) + ' ₫';
}

/**
 * Format full date in Vietnamese (e.g. "Thứ Năm, 17/09/2026")
 */
export function formatDateVN(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  const dt = new Date(Date.UTC(year, month - 1, day));
  const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dow = daysOfWeek[dt.getUTCDay()];
  return `${dow}, ${pad2(day)}/${pad2(month)}/${year}`;
}

export function getCurrentDateStr(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function getCurrentYearMonth(): string {
  const today = getCurrentDateStr();
  return today.substring(0, 7);
}

export function parseVNDInput(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[^0-9]/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}

/**
 * Remove Vietnamese accents and special characters for fuzzy header matching.
 */
export function normalizeHeader(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[đĐ]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Intelligently parse due day of month from various raw inputs:
 * numbers, text phrases ("Ngày 20", "Hạn 5"), dates ("2026-09-25", "25/09/2026"), etc.
 * Strictly adheres to the value in the file without defaulting to 15.
 * Returns null if no valid day (1-31) can be determined.
 */
export function parseDueDayValue(val: any): number | null {
  if (val === null || val === undefined || val === '') return null;

  // 1. Direct number
  if (typeof val === 'number' && !isNaN(val)) {
    if (val >= 1 && val <= 31) {
      return Math.round(val);
    }
    // Excel date serial code (e.g. 45000+ or > 1000)
    if (val > 1000) {
      try {
        const utcDays = Math.floor(val - 25569);
        const date = new Date(utcDays * 86400 * 1000);
        const d = date.getUTCDate();
        if (d >= 1 && d <= 31) return d;
      } catch (e) {}
    }
    return null;
  }

  // 2. Date object
  if (val instanceof Date && !isNaN(val.getTime())) {
    const d = val.getDate();
    if (d >= 1 && d <= 31) return d;
    return null;
  }

  const str = String(val).trim();
  if (!str) return null;

  // 3. String digits only: "15", "05", "31"
  if (/^\d{1,2}$/.test(str)) {
    const d = parseInt(str, 10);
    if (d >= 1 && d <= 31) return d;
  }

  // 4. ISO Date format: YYYY-MM-DD e.g. "2026-09-22"
  const isoMatch = str.match(/^\d{4}[-/.]\d{1,2}[-/.](\d{1,2})/);
  if (isoMatch) {
    const d = parseInt(isoMatch[1], 10);
    if (d >= 1 && d <= 31) return d;
  }

  // 5. VN/UK Date format: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY e.g. "22/09/2026", "08/11"
  const vnMatch = str.match(/^(\d{1,2})[-/.]\d{1,2}(?:[-/.]\d{2,4})?/);
  if (vnMatch) {
    const d = parseInt(vnMatch[1], 10);
    if (d >= 1 && d <= 31) return d;
  }

  // 6. Text with word prefix: "Ngày 20", "ngay 05", "hạn 15 hàng tháng", "mùng 3", "Hạn thanh toán 25"
  const phraseMatch = str.match(/(?:ngày|ngay|hạn|han|mùng|mung|day|due)?\s*(\d{1,2})/i);
  if (phraseMatch) {
    const d = parseInt(phraseMatch[1], 10);
    if (d >= 1 && d <= 31) return d;
  }

  // 7. General number pattern inside string
  const anyNum = str.match(/\b([1-9]|[12][0-9]|3[01])\b/);
  if (anyNum) {
    const d = parseInt(anyNum[1], 10);
    if (d >= 1 && d <= 31) return d;
  }

  return null;
}

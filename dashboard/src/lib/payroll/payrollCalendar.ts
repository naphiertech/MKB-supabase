/**
 * Authoritative payroll calendar helpers for MKBRiderTrack.
 *
 * Payroll Business Contract (effective 2026-08-31):
 * - Every earning period is strictly Monday -> Sunday (7 calendar days).
 * - Period bounds are represented as DATE strings ('YYYY-MM-DD').
 * - Business timezone is strictly Asia/Manila (+08:00).
 * - One-week payout lag: payable_date = cutoff_end + 8 calendar days (Monday after waiting week).
 * - Legacy cutoffs (cutoff_start < 2026-08-31) do not have a weekly payable date (returns null).
 */

export const WEEKLY_PAYROLL_START_DATE = '2026-08-31'; // Monday
export const MANILA_TIMEZONE = 'Asia/Manila';

const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export interface PayrollWeekPeriod {
  cutoff_start: string; // 'YYYY-MM-DD' (Monday)
  cutoff_end: string;   // 'YYYY-MM-DD' (Sunday)
  payable_date: string; // 'YYYY-MM-DD' (Monday after waiting week)
  label: string;        // Formatted human-readable label
  is_weekly: boolean;
}

export interface ParsedDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
}

/**
 * Parses a 'YYYY-MM-DD' string safely into year, month, and day without local timezone distortion.
 */
export function parseDateString(dateStr: string): ParsedDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr.trim());
  if (!match) {
    throw new Error(`Invalid date format: "${dateStr}". Expected YYYY-MM-DD.`);
  }
  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Date values out of range: "${dateStr}".`);
  }
  return { year, month, day };
}

/**
 * Formats year, month (1-12), and day (1-31) into 'YYYY-MM-DD'.
 */
export function formatDateString(year: number, month: number, day: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * Resolves any input date (string, timestamp, or Date) into its authoritative Asia/Manila business date string 'YYYY-MM-DD'.
 */
export function getManilaBusinessDate(input?: string | Date | null): string {
  if (!input) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: MANILA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    // Parse ISO / timestamp string using Intl in Asia/Manila
    const parsedDate = new Date(trimmed);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date string: "${input}"`);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: MANILA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(parsedDate);
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      throw new Error('Invalid Date object provided.');
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: MANILA_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(input);
  }

  throw new Error(`Unsupported date input: ${String(input)}`);
}

/**
 * Calculates the ISO-8601 Day of Week (1 = Monday, 7 = Sunday) using pure Gregorian math.
 * Accepts either a 'YYYY-MM-DD' string or separate (year, month, day) numbers.
 */
export function getISODayOfWeek(dateOrYear: string | number, maybeMonth?: number, maybeDay?: number): number {
  let year: number;
  let month: number;
  let day: number;

  if (typeof dateOrYear === 'string') {
    const parsed = parseDateString(dateOrYear);
    year = parsed.year;
    month = parsed.month;
    day = parsed.day;
  } else {
    year = dateOrYear;
    month = maybeMonth!;
    day = maybeDay!;
  }

  // Tomohiko Sakamoto's Algorithm (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  let y = year;
  if (month < 3) {
    y -= 1;
  }
  const dowSun0 = (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[month - 1] + day) % 7;
  // Convert 0 (Sunday) to 7, so Monday is 1 and Sunday is 7
  return dowSun0 === 0 ? 7 : dowSun0;
}

/**
 * Adds (or subtracts) days to a date string using UTC arithmetic to prevent timezone DST shifts.
 */
export function addDays(dateStr: string, daysToAdd: number): string {
  const { year, month, day } = parseDateString(dateStr);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  utcDate.setUTCDate(utcDate.getUTCDate() + daysToAdd);
  return formatDateString(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth() + 1,
    utcDate.getUTCDate()
  );
}

/**
 * Computes difference in calendar days between dateA and dateB (dateA - dateB).
 */
export function diffDays(dateA: string, dateB: string): number {
  const pA = parseDateString(dateA);
  const pB = parseDateString(dateB);
  const utcA = Date.UTC(pA.year, pA.month - 1, pA.day);
  const utcB = Date.UTC(pB.year, pB.month - 1, pB.day);
  return Math.round((utcA - utcB) / (1000 * 60 * 60 * 24));
}

/**
 * Formats a payroll cutoff period into a clean, unambiguous human-readable string.
 * Supports cross-month and cross-year boundaries cleanly.
 *
 * Examples:
 * - "Sep 7–13, 2026"
 * - "Aug 31 – Sep 6, 2026"
 * - "Dec 28, 2026 – Jan 3, 2027"
 */
export function formatPayrollPeriod(cutoffStart: string, cutoffEnd: string): string {
  try {
    const s = parseDateString(cutoffStart);
    const e = parseDateString(cutoffEnd);

    const sMonth = MONTH_NAMES_SHORT[s.month - 1];
    const eMonth = MONTH_NAMES_SHORT[e.month - 1];

    if (s.year === e.year && s.month === e.month) {
      return `${sMonth} ${s.day}–${e.day}, ${s.year}`;
    }

    if (s.year === e.year && s.month !== e.month) {
      return `${sMonth} ${s.day} – ${eMonth} ${e.day}, ${s.year}`;
    }

    return `${sMonth} ${s.day}, ${s.year} – ${eMonth} ${e.day}, ${e.year}`;
  } catch {
    return `${cutoffStart} – ${cutoffEnd}`;
  }
}

/**
 * Given any input date, calculates the authoritative Monday–Sunday earning week.
 */
export function getPayrollWeek(dateInput?: string | Date | null): PayrollWeekPeriod {
  const manilaDate = getManilaBusinessDate(dateInput);
  const { year, month, day } = parseDateString(manilaDate);
  const isoDow = getISODayOfWeek(year, month, day); // 1 = Monday, 7 = Sunday

  // Monday of the week
  const cutoffStart = addDays(manilaDate, 1 - isoDow);
  // Sunday of the week
  const cutoffEnd = addDays(cutoffStart, 6);
  // Earliest payable date = cutoff_end + 8 calendar days (Monday after waiting week)
  const payableDate = addDays(cutoffEnd, 8);

  const isWeekly = cutoffStart >= WEEKLY_PAYROLL_START_DATE;

  return {
    cutoff_start: cutoffStart,
    cutoff_end: cutoffEnd,
    payable_date: payableDate,
    label: formatPayrollPeriod(cutoffStart, cutoffEnd),
    is_weekly: isWeekly
  };
}

/**
 * Returns the earliest payable date for a payroll cutoff.
 * For weekly payroll (cutoff_start >= 2026-08-31), returns cutoff_end + 8 days.
 * For legacy payroll (cutoff_start < 2026-08-31), returns null (no weekly payout lag).
 */
export function getPayableDate(cutoffStart: string, cutoffEnd: string): string | null {
  if (cutoffStart >= WEEKLY_PAYROLL_START_DATE) {
    return addDays(cutoffEnd, 8);
  }
  return null;
}

/**
 * Returns true if the payroll is eligible for payout (or legacy), false if still in waiting week.
 */
export function isPayrollPayable(
  cutoffStart: string,
  cutoffEnd: string,
  referenceDate?: string | Date | null
): boolean {
  if (cutoffStart < WEEKLY_PAYROLL_START_DATE) {
    return true; // Legacy records are not bound by weekly payout lag
  }
  const todayManila = getManilaBusinessDate(referenceDate);
  const payableDate = getPayableDate(cutoffStart, cutoffEnd);
  if (!payableDate) return true;
  return todayManila >= payableDate;
}

/**
 * Validates whether a given cutoff range is a valid weekly period (Monday to Sunday, exactly 7 days).
 */
export function isValidWeeklyPeriod(cutoffStart: string, cutoffEnd: string): boolean {
  try {
    const s = parseDateString(cutoffStart);
    const dow = getISODayOfWeek(s.year, s.month, s.day);
    if (dow !== 1) return false; // Must be Monday
    const expectedEnd = addDays(cutoffStart, 6);
    return cutoffEnd === expectedEnd;
  } catch {
    return false;
  }
}

/**
 * Calculates the previous payroll week.
 */
export function previousPayrollWeek(period: { cutoff_start: string; cutoff_end: string }): PayrollWeekPeriod {
  const prevStart = addDays(period.cutoff_start, -7);
  return getPayrollWeek(prevStart);
}

/**
 * Calculates the next payroll week.
 */
export function nextPayrollWeek(period: { cutoff_start: string; cutoff_end: string }): PayrollWeekPeriod {
  const nextStart = addDays(period.cutoff_start, 7);
  return getPayrollWeek(nextStart);
}

/**
 * Generates an array of recent/active weekly payroll periods starting from anchorDate back to WEEKLY_PAYROLL_START_DATE.
 * Never generates weekly payroll periods before WEEKLY_PAYROLL_START_DATE (2026-08-31).
 */
export function getRecentPayrollWeeks(
  count = 12,
  anchorDate?: string | Date | null
): PayrollWeekPeriod[] {
  const currentWeek = getPayrollWeek(anchorDate);
  const weeks: PayrollWeekPeriod[] = [];

  let cursor = currentWeek;
  while (weeks.length < count && cursor.cutoff_start >= WEEKLY_PAYROLL_START_DATE) {
    weeks.push(cursor);
    cursor = previousPayrollWeek(cursor);
  }

  return weeks;
}

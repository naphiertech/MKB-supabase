export type ExportCell = string | number | boolean | null | undefined;

export const EXPORT_MIME_TYPES = {
  csv: 'text/csv;charset=utf-8;',
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
} as const;

const MANILA_TIME_ZONE = 'Asia/Manila';

function exportDate(value: string | number | Date): Date {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+08:00`);
  }
  return value instanceof Date ? value : new Date(value);
}

export function formatManilaDate(
  value: string | number | Date,
  style: 'long' | 'short' | 'iso' = 'long'
): string {
  const date = exportDate(value);
  if (!Number.isFinite(date.getTime())) return '—';
  if (style === 'iso') {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: MANILA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    day: '2-digit',
  }).format(date);
}

export function formatManilaDateTime(value: string | number | Date): string {
  const date = exportDate(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function formatDateRangeLabel(
  from: string,
  to: string,
  style: 'long' | 'short' | 'iso' = 'long'
): string {
  return `${formatManilaDate(from, style)} – ${formatManilaDate(to, style)}`;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency', currency: 'PHP', currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export function formatPercentage(value: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'percent', minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits,
  }).format(Number(value) || 0);
}

export function safeFilenameFragment(value: string): string {
  return String(value ?? '')
    .trim()
    .split('')
    .filter(character => character.charCodeAt(0) >= 32)
    .join('')
    .replace(/\s+/g, '_')
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/-+_/g, '_')
    .replace(/_+-/g, '_')
    .replace(/-{2,}/g, '-')
    .replace(/_{2,}/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '') || 'export';
}

export function buildExportFilename(options: {
  prefix: string;
  identifier?: string;
  from?: string;
  to?: string;
  extension: string;
}): string {
  const parts = [safeFilenameFragment(options.prefix)];
  if (options.identifier) parts.push(safeFilenameFragment(options.identifier));
  if (options.from && options.to) {
    parts.push(formatManilaDate(options.from, 'iso'), 'to', formatManilaDate(options.to, 'iso'));
  } else if (options.from) {
    parts.push(formatManilaDate(options.from, 'iso'));
  }
  const extension = safeFilenameFragment(options.extension.replace(/^\./, '')).toLowerCase();
  return `${parts.join('_')}.${extension}`;
}

export function csvEscape(value: ExportCell): string {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createCsvContent(
  rows: ExportCell[][],
  options: { bom?: boolean } = { bom: true }
): string {
  const content = rows.map(row => row.map(csvEscape).join(',')).join('\r\n');
  return `${options.bom === false ? '' : '\uFEFF'}${content}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadCsv(rows: ExportCell[][], filename: string): void {
  downloadBlob(new Blob([createCsvContent(rows)], { type: EXPORT_MIME_TYPES.csv }), filename);
}

export function printCurrentDocument(): void {
  window.print();
}

export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.title = 'Printable business document';
  frame.style.position = 'fixed';
  frame.style.width = '1px';
  frame.style.height = '1px';
  frame.style.opacity = '0';
  frame.style.pointerEvents = 'none';
  frame.src = url;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  };
  document.body.appendChild(frame);
}

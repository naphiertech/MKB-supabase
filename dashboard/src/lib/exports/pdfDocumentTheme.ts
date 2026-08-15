import jsPDF from 'jspdf';
import { BRANDING } from '../../config/branding';
import { formatManilaDateTime } from './exportUtils';

export const PDF_DOCUMENT_THEME = {
  colors: {
    accent: '#DB6C00',
    accentSoft: '#FFF4E8',
    ink: '#1A1410',
    muted: '#6B6258',
    rule: '#DDD6CC',
    surface: '#F7F4EF',
    white: '#FFFFFF',
    success: '#287A4B',
    warning: '#9A6700',
    danger: '#B42318',
  },
  page: { margin: 38, footerHeight: 34 },
  typography: { identity: 10, title: 17, descriptor: 8.5, metadataLabel: 7, metadataValue: 9 },
  table: { bodyFontSize: 8.25, headerFontSize: 7.75, cellPadding: 4 },
} as const;

export type PdfMetadataItem = { label: string; value: string };

export function formatPdfCurrency(value: number): string {
  return `PHP ${new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

const rgb = (hex: string): [number, number, number] => {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
};

export function createBusinessPdf(options: {
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
} = {}): jsPDF {
  return new jsPDF({
    unit: 'pt',
    orientation: options.orientation ?? 'portrait',
    format: options.format ?? 'a4',
    compress: false,
  });
}

export function drawBusinessDocumentHeader(
  doc: jsPDF,
  options: {
    title: string;
    descriptor?: string;
    metadata?: PdfMetadataItem[];
    classification?: string;
    compact?: boolean;
  },
): number {
  const { colors, page, typography } = PDF_DOCUMENT_THEME;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = page.margin;
  const compact = options.compact ?? false;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(typography.identity);
  doc.setTextColor(...rgb(colors.accent));
  doc.text(BRANDING.appName.toUpperCase(), margin, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...rgb(colors.muted));
  doc.text('MKB CORPORATION', margin, 42);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...rgb(colors.muted));
  doc.text((options.classification ?? 'BUSINESS DOCUMENT').toUpperCase(), pageWidth - margin, 31, { align: 'right' });

  doc.setDrawColor(...rgb(colors.rule));
  doc.setLineWidth(0.6);
  doc.line(margin, 50, pageWidth - margin, 50);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(compact ? 12 : typography.title);
  doc.setTextColor(...rgb(colors.ink));
  doc.text(options.title, margin, compact ? 70 : 74);

  if (options.descriptor && !compact) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(typography.descriptor);
    doc.setTextColor(...rgb(colors.muted));
    doc.text(options.descriptor, margin, 88);
  }

  const metadata = options.metadata ?? [];
  if (metadata.length === 0 || compact) {
    doc.setDrawColor(...rgb(colors.accent));
    doc.setLineWidth(1.4);
    doc.line(margin, compact ? 80 : 99, margin + 42, compact ? 80 : 99);
    doc.setDrawColor(...rgb(colors.rule));
    doc.setLineWidth(0.4);
    doc.line(margin + 42, compact ? 80 : 99, pageWidth - margin, compact ? 80 : 99);
    return compact ? 94 : 112;
  }

  const metadataTop = 104;
  const usableWidth = pageWidth - margin * 2;
  const columnWidth = usableWidth / Math.min(metadata.length, 4);
  metadata.slice(0, 4).forEach((item, index) => {
    const x = margin + index * columnWidth;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(typography.metadataLabel);
    doc.setTextColor(...rgb(colors.muted));
    doc.text(item.label.toUpperCase(), x, metadataTop);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(typography.metadataValue);
    doc.setTextColor(...rgb(colors.ink));
    const value = doc.splitTextToSize(item.value || 'Not specified', columnWidth - 12)[0];
    doc.text(value, x, metadataTop + 14);
  });

  doc.setDrawColor(...rgb(colors.accent));
  doc.setLineWidth(1.4);
  doc.line(margin, 130, margin + 42, 130);
  doc.setDrawColor(...rgb(colors.rule));
  doc.setLineWidth(0.4);
  doc.line(margin + 42, 130, pageWidth - margin, 130);
  return 144;
}

export function drawSectionHeading(doc: jsPDF, title: string, y: number): number {
  const { colors, page } = PDF_DOCUMENT_THEME;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...rgb(colors.ink));
  doc.text(title.toUpperCase(), page.margin, y);
  doc.setDrawColor(...rgb(colors.accent));
  doc.setLineWidth(1);
  doc.line(page.margin, y + 6, page.margin + 28, y + 6);
  doc.setDrawColor(...rgb(colors.rule));
  doc.setLineWidth(0.35);
  doc.line(page.margin + 28, y + 6, doc.internal.pageSize.getWidth() - page.margin, y + 6);
  return y + 18;
}

export function drawMetricStrip(
  doc: jsPDF,
  metrics: Array<{ label: string; value: string }>,
  y: number,
): number {
  const { colors, page } = PDF_DOCUMENT_THEME;
  const width = doc.internal.pageSize.getWidth() - page.margin * 2;
  const height = 42;
  doc.setFillColor(...rgb(colors.surface));
  doc.setDrawColor(...rgb(colors.rule));
  doc.setLineWidth(0.45);
  doc.roundedRect(page.margin, y, width, height, 2, 2, 'FD');
  const itemWidth = width / metrics.length;
  metrics.forEach((metric, index) => {
    const x = page.margin + index * itemWidth + 12;
    if (index > 0) {
      doc.setDrawColor(...rgb(colors.rule));
      doc.line(page.margin + index * itemWidth, y + 9, page.margin + index * itemWidth, y + height - 9);
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...rgb(colors.muted));
    doc.text(metric.label.toUpperCase(), x, y + 14);
    doc.setFontSize(12);
    doc.setTextColor(...rgb(index === 0 ? colors.accent : colors.ink));
    doc.text(metric.value, x, y + 31);
  });
  return y + height;
}

export function businessTableStyles() {
  const { colors, table } = PDF_DOCUMENT_THEME;
  return {
    theme: 'plain' as const,
    styles: {
      font: 'helvetica',
      fontSize: table.bodyFontSize,
      textColor: rgb(colors.ink),
      cellPadding: { top: table.cellPadding, right: 4, bottom: table.cellPadding, left: 4 },
      lineColor: rgb(colors.rule),
      lineWidth: { bottom: 0.35 },
      overflow: 'linebreak' as const,
      valign: 'middle' as const,
    },
    headStyles: {
      fillColor: rgb(colors.ink),
      textColor: rgb(colors.white),
      fontStyle: 'bold' as const,
      fontSize: table.headerFontSize,
      cellPadding: { top: 6, right: 4, bottom: 6, left: 4 },
      lineWidth: 0,
    },
    alternateRowStyles: { fillColor: rgb(colors.surface) },
  };
}

export function applyBusinessDocumentFooters(
  doc: jsPDF,
  generatedAt: string = formatManilaDateTime(new Date()),
): void {
  const { colors, page } = PDF_DOCUMENT_THEME;
  const totalPages = doc.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    doc.setPage(pageNumber);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const y = pageHeight - 23;
    doc.setDrawColor(...rgb(colors.rule));
    doc.setLineWidth(0.35);
    doc.line(page.margin, y - 11, pageWidth - page.margin, y - 11);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...rgb(colors.muted));
    doc.text(`${BRANDING.appName} | MKB Corporation | Generated ${generatedAt}`, page.margin, y);
    doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - page.margin, y, { align: 'right' });
  }
}

export function pdfThemeRgb(color: keyof typeof PDF_DOCUMENT_THEME.colors): [number, number, number] {
  return rgb(PDF_DOCUMENT_THEME.colors[color]);
}

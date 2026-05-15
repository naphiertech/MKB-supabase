import jsPDF from 'jspdf';

export interface PayslipDay {
  date: string; // YYYY-MM-DD
  timeIn: string | null; // HH:MM
  timeOut: string | null; // HH:MM
  hours: number;
  status: 'Present' | 'Late' | 'Absent' | 'On Leave';
}

export interface PayslipData {
  riderName: string;
  riderId: string; // e.g. MKB-1000
  zone: string;
  cutoffFrom: string; // YYYY-MM-DD
  cutoffTo: string; // YYYY-MM-DD
  dailyRate: number;
  days: PayslipDay[];
  daysPresent: number;
  totalHours: number;
  grossPay: number;
  deductions: number;
  netPay: number;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(cell: string | number | null | undefined): string {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function formatPHP(amount: number): string {
  return `PHP ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function exportPayslipCSV(data: PayslipData) {
  const filename = `attenrider_payslip_${data.riderId}_${data.cutoffFrom}_${data.cutoffTo}`;
  const lines: (string | number)[][] = [];
  lines.push(['AttenRider · MKB Corporation']);
  lines.push(['Payslip']);
  lines.push([]);
  lines.push(['Rider', data.riderName]);
  lines.push(['Rider ID', data.riderId]);
  lines.push(['Zone', data.zone]);
  lines.push(['Cutoff', `${data.cutoffFrom} to ${data.cutoffTo}`]);
  lines.push(['Daily Rate', data.dailyRate]);
  lines.push([]);
  lines.push(['Date', 'Time-In', 'Time-Out', 'Hours', 'Status']);
  data.days.forEach((d) =>
  lines.push([d.date, d.timeIn ?? '—', d.timeOut ?? '—', d.hours, d.status])
  );
  lines.push([]);
  lines.push(['Days Present', data.daysPresent]);
  lines.push(['Total Hours', data.totalHours]);
  lines.push(['Gross Pay', data.grossPay.toFixed(2)]);
  lines.push(['Deductions', data.deductions.toFixed(2)]);
  lines.push(['Net Pay', data.netPay.toFixed(2)]);

  const csv =
  '\uFEFF' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}

export function exportPayslipPDF(data: PayslipData) {
  const filename = `attenrider_payslip_${data.riderId}_${data.cutoffFrom}_${data.cutoffTo}`;
  const doc = new jsPDF({
    unit: 'pt',
    format: 'letter',
    orientation: 'portrait'
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const generatedDate = new Date().toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Header — brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(202, 138, 4); // amber-600 for payroll
  doc.text('AttenRider', marginX, 50);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 98, 88);
  doc.text('MKB Corporation', marginX, 66);

  // Document title (right)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(26, 20, 16);
  doc.text('PAYSLIP', pageWidth - marginX, 50, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(107, 98, 88);
  doc.text(`Generated ${generatedDate}`, pageWidth - marginX, 66, {
    align: 'right'
  });

  // Divider
  doc.setDrawColor(239, 234, 226);
  doc.setLineWidth(0.5);
  doc.line(marginX, 80, pageWidth - marginX, 80);

  // Rider info block
  let y = 104;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(26, 20, 16);
  doc.text('Rider', marginX, y);
  doc.text('Cutoff Period', pageWidth / 2 + 20, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(26, 20, 16);
  doc.text(`${data.riderName}`, marginX, y);
  doc.text(`${data.cutoffFrom}  to  ${data.cutoffTo}`, pageWidth / 2 + 20, y);
  y += 14;
  doc.setTextColor(107, 98, 88);
  doc.setFontSize(9);
  doc.text(`ID: ${data.riderId}`, marginX, y);
  doc.text(
    `Daily Rate: PHP ${data.dailyRate.toFixed(2)}`,
    pageWidth / 2 + 20,
    y
  );
  y += 12;
  doc.text(`Zone: ${data.zone}`, marginX, y);
  y += 20;

  // Table
  const headerRowHeight = 24;
  const rowHeight = 20;
  const usableWidth = pageWidth - marginX * 2;
  const cols = [
  { label: 'Date', width: 0.28 },
  { label: 'Time-In', width: 0.16 },
  { label: 'Time-Out', width: 0.16 },
  { label: 'Hours', width: 0.14 },
  { label: 'Status', width: 0.26 }];

  const colWidths = cols.map((c) => c.width * usableWidth);
  const colXs: number[] = [];
  let cx = marginX;
  cols.forEach((_, i) => {
    colXs.push(cx);
    cx += colWidths[i];
  });

  function drawTableHeader(yStart: number): number {
    doc.setFillColor(202, 138, 4); // amber-600
    doc.rect(marginX, yStart, usableWidth, headerRowHeight, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    cols.forEach((c, i) => {
      doc.text(c.label, colXs[i] + 8, yStart + 16);
    });
    return yStart + headerRowHeight;
  }

  y = drawTableHeader(y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  data.days.forEach((d, idx) => {
    if (y + rowHeight > pageHeight - 140) {
      doc.addPage();
      y = 60;
      y = drawTableHeader(y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }
    if (idx % 2 === 0) {
      doc.setFillColor(254, 252, 232); // amber-50
      doc.rect(marginX, y, usableWidth, rowHeight, 'F');
    }
    doc.setTextColor(26, 20, 16);
    const cells = [
    d.date,
    d.timeIn ?? '—',
    d.timeOut ?? '—',
    d.hours.toFixed(1),
    d.status];

    cells.forEach((text, i) => {
      doc.text(String(text), colXs[i] + 8, y + 14);
    });
    doc.setDrawColor(239, 234, 226);
    doc.setLineWidth(0.3);
    doc.line(marginX, y + rowHeight, pageWidth - marginX, y + rowHeight);
    y += rowHeight;
  });

  // Totals block
  y += 16;
  if (y > pageHeight - 160) {
    doc.addPage();
    y = 80;
  }
  doc.setDrawColor(202, 138, 4);
  doc.setLineWidth(1);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 18;

  const labelX = pageWidth - marginX - 180;
  const valueX = pageWidth - marginX;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(107, 98, 88);
  doc.text('Days Present', labelX, y);
  doc.setTextColor(26, 20, 16);
  doc.text(String(data.daysPresent), valueX, y, { align: 'right' });
  y += 16;
  doc.setTextColor(107, 98, 88);
  doc.text('Total Hours', labelX, y);
  doc.setTextColor(26, 20, 16);
  doc.text(`${data.totalHours.toFixed(1)} hrs`, valueX, y, { align: 'right' });
  y += 16;
  doc.setTextColor(107, 98, 88);
  doc.text('Deductions', labelX, y);
  doc.setTextColor(26, 20, 16);
  doc.text(`PHP ${data.deductions.toFixed(2)}`, valueX, y, { align: 'right' });
  y += 22;

  // Gross / Net pay — bold
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(26, 20, 16);
  doc.text('GROSS PAY', labelX, y);
  doc.setTextColor(202, 138, 4);
  doc.text(
    `PHP ${data.grossPay.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    valueX,
    y,
    { align: 'right' }
  );
  y += 20;
  doc.setTextColor(26, 20, 16);
  doc.text('NET PAY', labelX, y);
  doc.setTextColor(202, 138, 4);
  doc.text(
    `PHP ${data.netPay.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    valueX,
    y,
    { align: 'right' }
  );

  // Footer disclaimer
  const footerY = pageHeight - 50;
  doc.setDrawColor(239, 234, 226);
  doc.setLineWidth(0.5);
  doc.line(marginX, footerY - 18, pageWidth - marginX, footerY - 18);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(107, 98, 88);
  doc.text(
    'This is a system-generated payslip. Government deductions are processed separately.',
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `AttenRider · MKB Corporation · Generated ${generatedDate}`,
    pageWidth / 2,
    footerY + 14,
    { align: 'center' }
  );

  doc.save(`${filename}.pdf`);
}

// ---------- Payroll report exports (CSV-only convenience) ----------

export interface CutoffSummaryRow {
  riderName: string;
  zone: string;
  daysPresent: number;
  totalHours: number;
  dailyRate: number;
  grossPay: number;
}

export function exportCutoffSummaryCSV(
rows: CutoffSummaryRow[],
cutoffLabel: string)
{
  const filename = `attenrider_cutoff_summary_${cutoffLabel.replace(/\s+/g, '_')}`;
  const header = [
  'Rider',
  'Zone',
  'Days Present',
  'Total Hours',
  'Daily Rate',
  'Gross Pay'];

  const lines = [
  ['AttenRider Cutoff Summary'],
  [`Cutoff: ${cutoffLabel}`],
  [],
  header,
  ...rows.map((r) => [
  r.riderName,
  r.zone,
  r.daysPresent,
  r.totalHours,
  r.dailyRate.toFixed(2),
  r.grossPay.toFixed(2)]
  )];

  const csv =
  '\uFEFF' + lines.map((row) => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import ExcelJS from 'exceljs';
import { BRANDING } from '../../config/branding';

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

export interface PayslipDay {
  date: string;
  standardParcels: number;
  heavyParcels: number;
  failedParcels: number;
  returnedParcels: number;
  standardRate: number;
  heavyRate: number;
  standardEarnings: number;
  heavyEarnings: number;
  grossDeliveryPay: number;
  rateConfigurationId: string | null;
  calculationVersion: number;
}

export interface PayslipSnapshotContext {
  source: 'live' | 'snapshot' | 'legacy';
  calculationVersion: number;
  standardParcels: number;
  heavyParcels: number;
  failedParcels: number;
  returnedParcels: number;
  standardEarnings: number;
  heavyEarnings: number;
  grossDeliveryPay: number;
}

export function parcelLogsToPayslipDays(entries: Array<{
  date: string; parcels: number; heavyParcels: number; failedParcels: number; returnedParcels: number;
  rate: number; heavyRate: number; standardEarnings: number; heavyEarnings: number; dailyGross: number;
  rateConfigurationId: string | null; calculationVersion: number;
}>): PayslipDay[] {
  return entries.map(entry => ({
    date: entry.date, standardParcels: entry.parcels, heavyParcels: entry.heavyParcels,
    failedParcels: entry.failedParcels, returnedParcels: entry.returnedParcels,
    standardRate: entry.rate, heavyRate: entry.heavyRate, standardEarnings: entry.standardEarnings,
    heavyEarnings: entry.heavyEarnings, grossDeliveryPay: entry.dailyGross,
    rateConfigurationId: entry.rateConfigurationId, calculationVersion: entry.calculationVersion,
  }));
}

function validateSnapshotExport(dayEntries: PayslipDay[], snapshot: PayslipSnapshotContext): void {
  if (snapshot.source === 'legacy') return;
  for (const entry of dayEntries) {
    if (!entry.rateConfigurationId || !Number.isFinite(entry.standardRate) || !Number.isFinite(entry.heavyRate)) {
      throw new Error(`Cannot export payroll: required rate snapshot is missing for ${entry.date}.`);
    }
  }
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

export const exportParcelPayslipPDF = (
  riderName: string,
  mkbId: string,
  zoneName: string,
  cutoffFrom: string,
  cutoffTo: string,
  dayEntries: PayslipDay[],
  snapshot: PayslipSnapshotContext,
  adjustments: {
    otherEarnings?: number;
    fmPickupCount?: number;
    deductions?: number;
    lateOnhold?: number;
    lateRemittance?: number;
  } = {}
) => {
  validateSnapshotExport(dayEntries, snapshot);
  const doc = new jsPDF();
  const totalParcels = snapshot.standardParcels + snapshot.heavyParcels;
  const grossPay = snapshot.grossDeliveryPay;

  const otherEarnings = adjustments.otherEarnings ?? 0;
  const fmPickupCount = adjustments.fmPickupCount ?? 0;
  const fmPickupPay = fmPickupCount * 3;
  const totalEarnings = grossPay + otherEarnings + fmPickupPay;
  const generalDeductions = adjustments.deductions ?? 0;
  const lateOnhold = adjustments.lateOnhold ?? 0;
  const lateRemittance = adjustments.lateRemittance ?? 0;
  const totalDeductions = generalDeductions + lateOnhold + lateRemittance;
  const netTakeHome = totalEarnings - totalDeductions;

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYSLIP — MKB CORPORATION', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${BRANDING.appName} Logistics System`, 105, 27, { align: 'center' });

  // Divider
  doc.setLineWidth(0.5);
  doc.line(14, 32, 196, 32);

  // Rider info
  doc.setFontSize(10);
  doc.text(`Rider     : ${riderName}`, 14, 40);
  doc.text(`Rider ID  : ${mkbId}`, 14, 47);
  doc.text(`Zone      : ${zoneName}`, 14, 54);
  doc.text(
    `Cutoff    : ${new Date(cutoffFrom).toLocaleDateString('en-PH', {
      month: 'long', day: '2-digit', year: 'numeric'
    })} – ${new Date(cutoffTo).toLocaleDateString('en-PH', {
      month: 'long', day: '2-digit', year: 'numeric'
    })}`,
    14, 61
  );
  doc.text(
    `Generated : ${new Date().toLocaleDateString('en-PH', {
      month: 'long', day: '2-digit', year: 'numeric'
    })}`,
    14, 68
  );

  // Day-by-day table
  autoTable(doc, {
    startY: 76,
    head: [['Date', 'Standard', 'Heavy', 'Failed', 'Returned', 'Std Rate', 'Heavy Rate', 'Gross']],
    body: dayEntries.map(e => [
        new Date(e.date).toLocaleDateString('en-PH', {
          month: 'long', day: '2-digit', year: 'numeric'
        }),
        e.standardParcels.toString(), e.heavyParcels.toString(), e.failedParcels.toString(), e.returnedParcels.toString(),
        `₱${e.standardRate.toFixed(2)}`, `₱${e.heavyRate.toFixed(2)}`,
        `₱${e.grossDeliveryPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      ]),
    headStyles: {
      fillColor: [219, 108, 0],
      textColor: 255,
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [255, 241, 224],
    },
    styles: {
      fontSize: 9,
      font: 'helvetica',
    },
  });

  // Summary
  const finalY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 8;
  doc.setLineWidth(0.5);
  doc.line(14, finalY, 196, finalY);

  doc.setFontSize(10);
  doc.text(
    `Total Parcels Delivered : ${totalParcels}`,
    14, finalY + 8
  );

  let currentY = finalY + 15;
  doc.text(`Standard / Heavy       : ${snapshot.standardParcels} / ${snapshot.heavyParcels}`, 14, currentY);
  currentY += 7;
  doc.text(`Failed / Returned      : ${snapshot.failedParcels} / ${snapshot.returnedParcels}`, 14, currentY);
  currentY += 7;
  doc.text(`Standard delivery pay   : ₱${snapshot.standardEarnings.toFixed(2)}`, 14, currentY);
  currentY += 7;
  doc.text(`Heavy delivery pay      : ₱${snapshot.heavyEarnings.toFixed(2)}`, 14, currentY);
  currentY += 7;
  doc.text(snapshot.source === 'legacy' ? 'Legacy immutable snapshot' : `Calculation v${snapshot.calculationVersion}`, 14, currentY);
  currentY += 7;

  currentY += 3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0);

  if (otherEarnings > 0 || fmPickupCount > 0) {
    doc.text(`Base Delivery Pay       : ₱${grossPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
    currentY += 7;
    if (otherEarnings > 0) {
      doc.text(`Other Earnings          : ₱${otherEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
      currentY += 7;
    }
    if (fmPickupCount > 0) {
      doc.text(`FM Pick Up (${fmPickupCount} pcs)      : ₱${fmPickupPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
      currentY += 7;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL EARNINGS          : ₱${totalEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 9;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL EARNINGS          : ₱${grossPay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 9;
  }

  if (totalDeductions > 0) {
    doc.setFont('helvetica', 'bold');
    doc.text('DEDUCTIONS', 14, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 7;
    if (generalDeductions > 0) {
      doc.text(`General Deductions      : ₱${generalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
      currentY += 7;
    }
    if (lateOnhold > 0) {
      doc.text(`Late Onhold             : ₱${lateOnhold.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
      currentY += 7;
    }
    if (lateRemittance > 0) {
      doc.text(`Late Remittance         : ₱${lateRemittance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
      currentY += 7;
    }
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL DEDUCTIONS        : ₱${totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, currentY);
    doc.setFont('helvetica', 'normal');
    currentY += 9;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(219, 108, 0);
  doc.text(
    `NET TAKE-HOME           : ₱${netTakeHome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    14, currentY + 3
  );

  // Footer note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    'Government deductions are processed separately outside this system.',
    105, currentY + 16,
    { align: 'center' }
  );

  // Save
  doc.save(
    `payslip_${riderName.replace(/\s+/g, '_')}_${cutoffFrom}_${cutoffTo}.pdf`
  );
};

export const exportParcelCSV = (
  riderName: string,
  mkbId: string,
  cutoffFrom: string,
  cutoffTo: string,
  dayEntries: PayslipDay[],
  snapshot: PayslipSnapshotContext,
  adjustments: {
    otherEarnings?: number;
    fmPickupCount?: number;
    deductions?: number;
    lateOnhold?: number;
    lateRemittance?: number;
  } = {}
) => {
  validateSnapshotExport(dayEntries, snapshot);
  const totalParcels = snapshot.standardParcels + snapshot.heavyParcels;
  const grossPay = snapshot.grossDeliveryPay;

  const otherEarnings = adjustments.otherEarnings ?? 0;
  const fmPickupCount = adjustments.fmPickupCount ?? 0;
  const fmPickupPay = fmPickupCount * 3;
  const totalEarnings = grossPay + otherEarnings + fmPickupPay;
  const generalDeductions = adjustments.deductions ?? 0;
  const lateOnhold = adjustments.lateOnhold ?? 0;
  const lateRemittance = adjustments.lateRemittance ?? 0;
  const totalDeductions = generalDeductions + lateOnhold + lateRemittance;
  const netTakeHome = totalEarnings - totalDeductions;

  const metadata = [
    ['Rider Payslip — MKB Corporation'],
    ['Rider Name', riderName],
    ['Rider ID', mkbId],
    ['Cutoff Period', `${cutoffFrom} to ${cutoffTo}`],
    []
  ];

  const headers = ['Date', 'Standard', 'Heavy', 'Failed', 'Returned', 'Standard Rate', 'Heavy Rate', 'Standard Earnings', 'Heavy Earnings', 'Gross Delivery Pay', 'Calculation Version'];
  const rows = dayEntries.map(e => [
    e.date, e.standardParcels, e.heavyParcels, e.failedParcels, e.returnedParcels,
    `₱${e.standardRate.toFixed(2)}`, `₱${e.heavyRate.toFixed(2)}`,
    `₱${e.standardEarnings.toFixed(2)}`, `₱${e.heavyEarnings.toFixed(2)}`,
    `₱${e.grossDeliveryPay.toFixed(2)}`, e.calculationVersion,
  ]);

  const lines = [
    ...metadata,
    headers,
    ...rows,
    [],
    ['TOTALS & ADJUSTMENTS'],
    ['Total Parcels Delivered', totalParcels],
    ['Standard Delivered', snapshot.standardParcels],
    ['Heavy Delivered', snapshot.heavyParcels],
    ['Failed', snapshot.failedParcels],
    ['Returned', snapshot.returnedParcels],
    ['Standard Earnings', `₱${snapshot.standardEarnings.toFixed(2)}`],
    ['Heavy Earnings', `₱${snapshot.heavyEarnings.toFixed(2)}`],
    ['Gross Delivery Pay', `₱${grossPay.toFixed(2)}`],
    ['Other Earnings', `₱${otherEarnings.toFixed(2)}`],
    [`FM Pick Up (${fmPickupCount} pcs)`, `₱${fmPickupPay.toFixed(2)}`],
    ['TOTAL EARNINGS', `₱${totalEarnings.toFixed(2)}`],
    [],
    ['Deductions'],
    ['General Deductions', `₱${generalDeductions.toFixed(2)}`],
    ['Late Onhold', `₱${lateOnhold.toFixed(2)}`],
    ['Late Remittance', `₱${lateRemittance.toFixed(2)}`],
    ['TOTAL DEDUCTIONS', `₱${totalDeductions.toFixed(2)}`],
    [],
    ['NET TAKE-HOME PAY', `₱${netTakeHome.toFixed(2)}`]
  ];

  const csv = '\uFEFF' + lines.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `payslip_${riderName.replace(/\s+/g, '_')}_${cutoffFrom}_${cutoffTo}.csv`);
};

export interface CutoffSummaryRow {
  riderName: string;
  zone: string;
  totalParcels: number;
  standardParcels?: number;
  heavyParcels?: number;
  standardEarnings?: number;
  heavyEarnings?: number;
  failedParcels?: number;
  returnedParcels?: number;
  calculationVersion?: number;
  grossPay: number;
}

export const exportCutoffSummaryCSV = (
  rows: CutoffSummaryRow[],
  cutoffLabel: string
) => {
  const filename = `mkbridertrack_cutoff_summary_${cutoffLabel.replace(/\s+/g, '_')}`;
  const header = ['Rider', 'Zone', 'Standard', 'Heavy', 'Failed', 'Returned', 'Total Delivered', 'Standard Earnings', 'Heavy Earnings', 'Gross Delivery Pay', 'Calculation Version'];

  const lines = [
    ['MKBRiderTrack Cutoff Summary'],
    [`Cutoff: ${cutoffLabel}`],
    [],
    header,
    ...rows.map(r => [
      r.riderName,
      r.zone,
      r.standardParcels ?? r.totalParcels,
      r.heavyParcels ?? 0,
      r.failedParcels ?? 0,
      r.returnedParcels ?? 0,
      r.totalParcels,
      `₱${Number(r.standardEarnings ?? r.grossPay).toFixed(2)}`,
      `₱${Number(r.heavyEarnings ?? 0).toFixed(2)}`,
      `₱${r.grossPay.toFixed(2)}`,
      r.calculationVersion ?? 1,
    ])
  ];

  const csv = '\uFEFF' + lines.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
};

export const exportParcelPayslipXLSX = async (
  riderName: string,
  _mkbId: string,
  cutoffFrom: string,
  cutoffTo: string,
  dayEntries: PayslipDay[],
  snapshot: PayslipSnapshotContext,
  atmNumber = 'N/A',
  adjustments: {
    otherEarnings?: number;
    fmPickupCount?: number;
    deductions?: number;
    lateOnhold?: number;
    lateRemittance?: number;
  } = {}
) => {
  try {
    validateSnapshotExport(dayEntries, snapshot);
    const exportDays = dayEntries.length > 0 ? dayEntries : [{
      date: cutoffTo,
      standardParcels: snapshot.standardParcels,
      heavyParcels: snapshot.heavyParcels,
      failedParcels: snapshot.failedParcels,
      returnedParcels: snapshot.returnedParcels,
      standardRate: 0,
      heavyRate: 0,
      standardEarnings: snapshot.standardEarnings,
      heavyEarnings: snapshot.heavyEarnings,
      grossDeliveryPay: snapshot.grossDeliveryPay,
      rateConfigurationId: null,
      calculationVersion: snapshot.calculationVersion,
    }];
    const response = await fetch('/files/MKB_PAYSLIP_Template.xlsx');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error("Worksheet not found in template");

    // Populate Rider details
    ws.getCell('C4').value = riderName;
    ws.getCell('C5').value = 'N/A'; // Dummy Account
    ws.getCell('C6').value = atmNumber || 'N/A';

    const totalDays = exportDays.length;
    const originalDaysCount = 7;
    const extraDays = totalDays - originalDaysCount;

    // Insert extra rows and shift merged ranges if needed
    if (extraDays > 0) {
      const mergesToShift: { original: string; shifted: string }[] = [];
      const allMerges = [...(ws.model.merges || [])];

      allMerges.forEach((rangeStr) => {
        const parts = rangeStr.split(':');
        if (parts.length !== 2) return;
        const [startCell, endCell] = parts;
        const startMatch = startCell.match(/^([A-Z]+)(\d+)$/);
        if (!startMatch) return;
        const startRow = parseInt(startMatch[2], 10);
        
        if (startRow >= 16) {
          const shiftCell = (cell: string) => {
            const match = cell.match(/^([A-Z]+)(\d+)$/);
            if (!match) return cell;
            const col = match[1];
            const row = parseInt(match[2], 10);
            return `${col}${row + extraDays}`;
          };
          
          mergesToShift.push({
            original: rangeStr,
            shifted: `${shiftCell(startCell)}:${shiftCell(endCell)}`,
          });
        }
      });

      // Unmerge original cells at or below row 16 before inserting rows
      mergesToShift.forEach((m) => {
        try {
          ws.unMergeCells(m.original);
        } catch (err) {
          console.warn('Failed to unmerge cell range:', m.original, err);
        }
      });

      ws.insertRows(16, Array(extraDays).fill([]), 'down');
      
      // Copy formatting and formulas from Row 15 to the new rows
      const sourceRow = ws.getRow(15);
      for (let i = 0; i < extraDays; i++) {
        const targetRowNum = 16 + i;
        const targetRow = ws.getRow(targetRowNum);
        targetRow.height = sourceRow.height;
        sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const targetCell = targetRow.getCell(colNumber);
          targetCell.style = cell.style;

          const val = cell.value;
          if (val && typeof val === 'object' && (val as any).formula) {
            const shiftedFormula = (val as any).formula.replace(/([A-Z]+)15/g, `$1${targetRowNum}`);
            targetCell.value = { formula: shiftedFormula };
          } else {
            targetCell.value = val;
          }
        });
        targetRow.commit();
      }

      // Re-merge shifted cell ranges
      mergesToShift.forEach((m) => {
        try {
          ws.mergeCells(m.shifted);
        } catch (err) {
          console.warn('Failed to merge cell range:', m.shifted, err);
        }
      });
    }

    const startDayRow = 9;
    const lastDayRow = 9 + totalDays - 1;
    const subTotalRow = lastDayRow + 1;
    const otherEarningsRow = lastDayRow + 2;
    const fmPickUpRow = lastDayRow + 3;
    const deductionsRow = lastDayRow + 4;
    const lateOnholdRow = lastDayRow + 5;
    const lateRemittanceRow = lastDayRow + 6;
    const atmRow = lastDayRow + 7;
    const totalRow = lastDayRow + 8;

    // Update To date formula in header
    ws.getCell('L6').value = { formula: `C${lastDayRow}` };

    // Use exact immutable line earnings; never infer or fall back to a current rate.
    ws.getCell('D8').value = 'Heavy Qty';
    ws.getCell('E8').value = 'Heavy Pay';
    ws.getCell('F8').value = 'Standard Qty';
    ws.getCell('G8').value = 'Standard Pay';
    ws.getCell('Q8').value = 'Failed';
    ws.getCell('R8').value = 'Returned';
    ws.getCell('S8').value = 'Rate Configuration';
    ws.getCell('T8').value = 'Calculation Version';
    ws.getCell('U8').value = 'Standard Rate';
    ws.getCell('V8').value = 'Heavy Rate';
    exportDays.forEach((entry, idx) => {
      const rowNum = startDayRow + idx;
      const dateVal = new Date(entry.date);
      ws.getCell(`C${rowNum}`).value = dateVal;

      // Initialize all parcel counts as 0 to overwrite default template values
      ws.getCell(`D${rowNum}`).value = 0;
      ws.getCell(`F${rowNum}`).value = 0;
      ws.getCell(`H${rowNum}`).value = 0;
      ws.getCell(`J${rowNum}`).value = 0;
      ws.getCell(`L${rowNum}`).value = 0;
      ws.getCell(`N${rowNum}`).value = 0;

      ws.getCell(`D${rowNum}`).value = entry.heavyParcels;
      ws.getCell(`E${rowNum}`).value = entry.heavyEarnings;
      ws.getCell(`F${rowNum}`).value = entry.standardParcels;
      ws.getCell(`G${rowNum}`).value = entry.standardEarnings;
      ws.getCell(`Q${rowNum}`).value = entry.failedParcels;
      ws.getCell(`R${rowNum}`).value = entry.returnedParcels;
      ws.getCell(`S${rowNum}`).value = entry.rateConfigurationId ?? (snapshot.source === 'legacy' ? 'Legacy snapshot' : 'Missing');
      ws.getCell(`T${rowNum}`).value = entry.calculationVersion;
      ws.getCell(`U${rowNum}`).value = snapshot.source === 'legacy' ? 'Legacy' : entry.standardRate;
      ws.getCell(`V${rowNum}`).value = snapshot.source === 'legacy' ? 'Legacy' : entry.heavyRate;
    });

    // Update Sub Total formulas
    ws.getCell(`D${subTotalRow}`).value = { formula: `SUM(D${startDayRow}:D${lastDayRow})` };
    ws.getCell(`E${subTotalRow}`).value = { formula: `SUM(E${startDayRow}:E${lastDayRow})` };
    ws.getCell(`F${subTotalRow}`).value = { formula: `SUM(F${startDayRow}:F${lastDayRow})` };
    ws.getCell(`G${subTotalRow}`).value = { formula: `SUM(G${startDayRow}:G${lastDayRow})` };
    ws.getCell(`H${subTotalRow}`).value = { formula: `SUM(H${startDayRow}:H${lastDayRow})` };
    ws.getCell(`I${subTotalRow}`).value = { formula: `SUM(I${startDayRow}:I${lastDayRow})` };
    ws.getCell(`J${subTotalRow}`).value = { formula: `SUM(J${startDayRow}:J${lastDayRow})` };
    ws.getCell(`K${subTotalRow}`).value = { formula: `SUM(K${startDayRow}:K${lastDayRow})` };
    ws.getCell(`L${subTotalRow}`).value = { formula: `SUM(L${startDayRow}:L${lastDayRow})` };
    ws.getCell(`M${subTotalRow}`).value = { formula: `SUM(M${startDayRow}:M${lastDayRow})` };
    ws.getCell(`N${subTotalRow}`).value = { formula: `SUM(N${startDayRow}:N${lastDayRow})` };
    ws.getCell(`O${subTotalRow}`).value = { formula: `SUM(O${startDayRow}:O${lastDayRow})` };
    ws.getCell(`P${subTotalRow}`).value = { formula: `SUM(P${startDayRow}:P${lastDayRow})` };
    ws.getCell(`P${subTotalRow}`).value = snapshot.grossDeliveryPay;

    // Write dynamic adjustments values to cells
    ws.getCell(`D${otherEarningsRow}`).value = (adjustments.otherEarnings ?? 0) / 5;
    ws.getCell(`C${fmPickUpRow}`).value = adjustments.fmPickupCount ?? 0;
    ws.getCell(`N${deductionsRow}`).value = adjustments.deductions ?? 0;
    ws.getCell(`C${lateOnholdRow}`).value = adjustments.lateOnhold ?? 0;
    ws.getCell(`C${lateRemittanceRow}`).value = adjustments.lateRemittance ?? 0;

    // Update other formulas
    ws.getCell(`N${otherEarningsRow}`).value = { formula: `D${otherEarningsRow}*5` };
    ws.getCell(`N${fmPickUpRow}`).value = { formula: `C${fmPickUpRow}*3` };
    
    const lateOnholdFormula = `C${lateOnholdRow}+C${lateRemittanceRow}+K${lateOnholdRow}+K${lateRemittanceRow}`;
    ws.getCell(`N${lateOnholdRow}`).value = { formula: lateOnholdFormula };
    ws.getCell(`N${lateRemittanceRow}`).value = { formula: lateOnholdFormula };

    // Use the stored gross snapshot rather than summing template quantity cells.
    ws.getCell(`N${atmRow}`).value = { formula: `P${subTotalRow}+N${otherEarningsRow}+N${fmPickUpRow}-SUM(N${deductionsRow}:N${lateRemittanceRow})` };

    // TOTAL uses the same immutable delivery gross plus existing adjustments.
    ws.getCell(`N${totalRow}`).value = { formula: `P${subTotalRow}+N${otherEarningsRow}+N${fmPickUpRow}-SUM(N${deductionsRow}:N${lateRemittanceRow})` };

    // Generate buffer and trigger download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslip_${riderName.replace(/\s+/g, '_')}_${cutoffFrom}_${cutoffTo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Failed to export Excel payslip using template:', err);
    throw err;
  }
};

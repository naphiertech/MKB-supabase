import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

export interface PayslipDay {
  date: string;
  parcels: number;
  dailyGross: number;
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
  rate: number,
  dayEntries: { date: string; parcels: number; dailyGross: number }[]
) => {
  const doc = new jsPDF();
  const totalParcels = dayEntries.reduce(
    (sum, e) => sum + e.parcels, 0
  );
  const grossPay = totalParcels * rate;

  // Header
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYSLIP — MKB CORPORATION', 105, 20, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('AttenRider Monitoring System', 105, 27, { align: 'center' });

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
    head: [['Date', 'Parcels Delivered', 'Daily Gross']],
    body: dayEntries.map(e => [
      new Date(e.date).toLocaleDateString('en-PH', {
        month: 'long', day: '2-digit', year: 'numeric'
      }),
      e.parcels === 0 ? '0 (rest day)' : e.parcels.toString(),
      e.parcels === 0 ? '—' : `₱${e.dailyGross.toLocaleString()}`,
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
  doc.text(
    `Rate per Parcel         : ₱${rate}.00`,
    14, finalY + 15
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(219, 108, 0);
  doc.text(
    `GROSS PAY               : ₱${grossPay.toLocaleString()}`,
    14, finalY + 25
  );

  // Footer note
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(
    'Government deductions are processed separately outside this system.',
    105, finalY + 38,
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
  rate: number,
  dayEntries: { date: string; parcels: number; dailyGross: number }[]
) => {
  const totalParcels = dayEntries.reduce(
    (sum, e) => sum + e.parcels, 0
  );
  const grossPay = totalParcels * rate;

  const metadata = [
    ['Rider Payslip — MKB Corporation'],
    ['Rider Name', riderName],
    ['Rider ID', mkbId],
    ['Cutoff Period', `${cutoffFrom} to ${cutoffTo}`],
    ['Rate per Parcel', `₱${rate.toFixed(2)}`],
    []
  ];

  const headers = ['Date', 'Parcels Delivered', 'Rate per Parcel', 'Daily Gross'];
  const rows = dayEntries.map(e => [
    e.date,
    e.parcels,
    `₱${rate.toFixed(2)}`,
    e.parcels === 0 ? '—' : `₱${e.dailyGross.toFixed(2)}`
  ]);

  const totalRow = [
    'TOTAL',
    totalParcels,
    `₱${rate.toFixed(2)}`,
    `₱${grossPay.toFixed(2)}`
  ];

  const lines = [
    ...metadata,
    headers,
    ...rows,
    [],
    totalRow
  ];

  const csv = '\uFEFF' + lines.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `payslip_${riderName.replace(/\s+/g, '_')}_${cutoffFrom}_${cutoffTo}.csv`);
};

export interface CutoffSummaryRow {
  riderName: string;
  zone: string;
  totalParcels: number;
  ratePerParcel: number;
  grossPay: number;
}

export const exportCutoffSummaryCSV = (
  rows: CutoffSummaryRow[],
  cutoffLabel: string
) => {
  const filename = `attenrider_cutoff_summary_${cutoffLabel.replace(/\s+/g, '_')}`;
  const header = ['Rider', 'Zone', 'Total Parcels', 'Rate per Parcel', 'Gross Pay'];

  const lines = [
    ['AttenRider Cutoff Summary'],
    [`Cutoff: ${cutoffLabel}`],
    [],
    header,
    ...rows.map(r => [
      r.riderName,
      r.zone,
      r.totalParcels,
      `₱${r.ratePerParcel.toFixed(2)}`,
      `₱${r.grossPay.toFixed(2)}`
    ])
  ];

  const csv = '\uFEFF' + lines.map(row => row.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
};

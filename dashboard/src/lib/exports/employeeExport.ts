import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppUser } from '../../services/types';
import {
  buildDtrDocumentData,
  buildEmployeeProfileDocumentData,
  type DtrAttendanceLog,
  type DtrDocumentData,
  type EmployeeProfileDocumentData,
} from './employeeDocument';
import { buildExportFilename, downloadBlob } from './exportUtils';
import {
  applyBusinessDocumentFooters,
  businessTableStyles,
  createBusinessPdf,
  drawBusinessDocumentHeader,
  drawSectionHeading,
  PDF_DOCUMENT_THEME,
  pdfThemeRgb,
} from './pdfDocumentTheme';

export { buildDtrDocumentData, buildEmployeeProfileDocumentData } from './employeeDocument';

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

interface ExportProfileCardOptions {
  user: AppUser;
  zoneName: string;
  formattedHireDate: string;
  formattedLastLogin: string;
}

/**
 * Exports the employee profile card details as a PDF.
 */
export function exportEmployeeProfileCard({
  user,
  zoneName,
  formattedHireDate,
  formattedLastLogin
}: ExportProfileCardOptions) {
  try {
    renderEmployeeProfilePdf(buildEmployeeProfileDocumentData({
      user, zoneName, formattedHireDate, formattedLastLogin,
    }), user.mkbRiderId || user.name || 'employee');
  } catch (err) {
    console.error('Failed to export profile PDF:', err);
  }
}

export function createEmployeeProfilePdf(data: EmployeeProfileDocumentData): jsPDF {
  const doc = createBusinessPdf({ orientation: 'portrait', format: 'a4' });
  drawBusinessDocumentHeader(doc, {
    title: 'Employee Profile',
    descriptor: 'Personnel, employment, and operational assignment record',
    classification: 'Personnel Record',
    metadata: [
      { label: 'Employee', value: data.employee.name },
      { label: 'Role', value: data.employee.role },
      { label: 'Assignment', value: data.employee.zoneName || 'Not assigned' },
      { label: 'Generated On', value: data.generatedOn },
    ],
  });

  let currentY = 154;
  const sections = [
    { title: 'Identity and Employment', rows: data.sections.basic },
    { title: 'Contact and Address', rows: data.sections.contact },
    { title: 'Operations and Emergency Information', rows: data.sections.operations },
  ];

  sections.forEach(section => {
    const estimatedHeight = 42 + section.rows.length * 24;
    if (currentY + estimatedHeight > doc.internal.pageSize.getHeight() - 55) {
      doc.addPage();
      drawBusinessDocumentHeader(doc, {
        title: 'Employee Profile',
        classification: 'Personnel Record',
        compact: true,
      });
      currentY = 108;
    }
    const tableStart = drawSectionHeading(doc, section.title, currentY);
    const startPage = doc.getCurrentPageInfo().pageNumber;
    autoTable(doc, {
      ...businessTableStyles(),
      startY: tableStart,
      margin: {
        left: PDF_DOCUMENT_THEME.page.margin,
        right: PDF_DOCUMENT_THEME.page.margin,
        top: 102,
        bottom: PDF_DOCUMENT_THEME.page.footerHeight + 18,
      },
      head: [['Information Item', 'Recorded Detail']],
      body: section.rows,
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      columnStyles: {
        0: { cellWidth: 165, fontStyle: 'bold', fillColor: pdfThemeRgb('surface') },
        1: { cellWidth: 'auto' },
      },
      willDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber > startPage) {
          drawBusinessDocumentHeader(doc, {
            title: 'Employee Profile',
            classification: 'Personnel Record',
            compact: true,
          });
        }
      },
    });
    currentY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 24;
  });

  applyBusinessDocumentFooters(doc, data.generatedOn);
  return doc;
}

export function renderEmployeeProfilePdf(data: EmployeeProfileDocumentData, filenameIdentifier: string): void {
  const filename = buildExportFilename({
    prefix: 'employee_profile',
    identifier: filenameIdentifier,
    extension: 'pdf',
  });
  downloadBlob(createEmployeeProfilePdf(data).output('blob'), filename);
}

interface ExportDTROptions {
  riderName: string;
  riderRole: string;
  zoneName: string;
  calendarDate: Date;
  logs: DtrAttendanceLog[];
}

/**
 * Exports the rider's Daily Time Record (DTR) as a portrait dual-column side-by-side A4 PDF.
 */
export function exportEmployeeDTR({
  riderName,
  riderRole,
  zoneName,
  calendarDate,
  logs
}: ExportDTROptions) {
  try {
    renderEmployeeDtrPdf(buildDtrDocumentData({ riderName, riderRole, zoneName, calendarDate, logs }));
  } catch (err) {
    console.error('Failed to generate DTR PDF:', err);
  }
}

export function renderEmployeeDtrPdf(data: DtrDocumentData): void {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const { year, monthName } = data.month;

    const drawSingleDTR = (startX: number) => {
      doc.setFont('helvetica', 'normal');

      // Title
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DAILY TIME RECORD', startX + 43, 15, { align: 'center' });

      // Name Line
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(data.employee.name.toUpperCase(), startX + 43, 21, { align: 'center' });
      doc.line(startX + 3, 22, startX + 83, 22);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.text('(NAME)', startX + 43, 25, { align: 'center' });

      // Info Fields
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      
      doc.text('Position:', startX + 3, 29);
      doc.setFont('helvetica', 'bold');
      doc.text(data.employee.role.toUpperCase(), startX + 15, 29);
      doc.line(startX + 15, 30, startX + 83, 30);

      doc.setFont('helvetica', 'normal');
      doc.text('Area of Assignment:', startX + 3, 34);
      doc.setFont('helvetica', 'bold');
      doc.text(data.employee.zoneName, startX + 28, 34);
      doc.line(startX + 28, 35, startX + 83, 35);

      doc.setFont('helvetica', 'normal');
      doc.text('For the month of:', startX + 3, 39);
      doc.setFont('helvetica', 'bold');
      doc.text(`${monthName} ${year}`, startX + 26, 39);
      doc.line(startX + 26, 40, startX + 83, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text('Official hrs. for arrival (Reg.Days) and Departure (Saturdays)', startX + 3, 44);

      const tableRows = data.rows.map((row) => [
        String(row.day),
        row.amIn,
        row.amOut,
        row.pmIn,
        row.pmOut,
        row.overtimeIn,
        row.overtimeOut,
        row.undertimeHours,
        row.undertimeMinutes,
      ]);

      autoTable(doc, {
        startY: 47,
        head: [
          [
            { content: 'DAY', rowSpan: 2, styles: { valign: 'middle', halign: 'center' } },
            { content: 'A.M.', colSpan: 2, styles: { halign: 'center' } },
            { content: 'P.M.', colSpan: 2, styles: { halign: 'center' } },
            { content: 'overtime', colSpan: 2, styles: { halign: 'center' } },
            { content: 'undertime', colSpan: 2, styles: { halign: 'center' } }
          ],
          ['in', 'out', 'in', 'out', 'in', 'out', 'HRS.', 'MIN.']
        ],
        body: tableRows,
        theme: 'grid',
        styles: { fontSize: 6.8, cellPadding: { top: 1.3, bottom: 1.3, left: 0.5, right: 0.5 }, font: 'helvetica', textColor: 0, halign: 'center' },
        headStyles: { fillColor: 255, textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: 0 },
        columnStyles: {
          0: { cellWidth: 8 },
          1: { cellWidth: 9 },
          2: { cellWidth: 9 },
          3: { cellWidth: 9 },
          4: { cellWidth: 9 },
          5: { cellWidth: 9 },
          6: { cellWidth: 9 },
          7: { cellWidth: 9 },
          8: { cellWidth: 9 }
        },
        margin: { left: startX + 3, right: doc.internal.pageSize.getWidth() - (startX + 83) },
        didParseCell: (data) => {
          if (data.row.index === 31) {
            data.cell.styles.fontStyle = 'bold';
            if (data.column.index === 0) {
              data.cell.styles.halign = 'left';
            }
          }
        }
      });

      let finalY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 6;

      if (data.contextNotes.length > 0 && data.contextNotes.length <= 4) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.text('ATTENDANCE CONTEXT', startX + 3, finalY);
        doc.setFont('helvetica', 'normal');
        const contextLines = doc.splitTextToSize(data.contextNotes.join('\n'), 78);
        doc.text(contextLines, startX + 3, finalY + 4);
        finalY += 5 + contextLines.length * 2.8;
      } else if (data.contextNotes.length > 4) {
        doc.setFontSize(5.5);
        doc.setFont('helvetica', 'bold');
        doc.text('ATTENDANCE CONTEXT', startX + 3, finalY);
        doc.setFont('helvetica', 'normal');
        doc.text(`Supplemental context attached (${data.contextNotes.length} date entries).`, startX + 3, finalY + 4);
        finalY += 8;
      }

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text('I hereby certify that the above records are true and correct.', startX + 43, finalY, { align: 'center' });

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('EMPLOYEE\'S SIGNATURE', startX + 43, finalY + 12, { align: 'center' });
      doc.line(startX + 13, finalY + 13, startX + 73, finalY + 13);

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'italic');
      doc.text('Verified as to the prescribed office hours.', startX + 43, finalY + 18, { align: 'center' });

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('IN-CHARGE', startX + 43, finalY + 28, { align: 'center' });
      doc.line(startX + 13, finalY + 29, startX + 73, finalY + 29);
    };

    // Draw left DTR
    drawSingleDTR(10);

    // Draw right DTR
    drawSingleDTR(110);

    // If context notes exceed 4, render a minimal dual-copy continuation sheet preserving all dates
    if (data.contextNotes.length > 4) {
      doc.addPage('a4', 'portrait');

      const drawSingleSupplemental = (startX: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text('DAILY TIME RECORD', startX + 43, 15, { align: 'center' });
        doc.setFontSize(7);
        doc.text('SUPPLEMENTAL ATTENDANCE CONTEXT', startX + 43, 20, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(`${data.employee.name.toUpperCase()} · ${monthName} ${year}`, startX + 43, 25, { align: 'center' });
        doc.line(startX + 3, 27, startX + 83, 27);

        const tableBody = data.contextNotes.map((note) => {
          const colonIdx = note.indexOf(':');
          const datePart = colonIdx > -1 ? note.slice(0, colonIdx).trim() : '';
          const detailPart = colonIdx > -1 ? note.slice(colonIdx + 1).trim() : note;
          return [datePart, detailPart];
        });

        autoTable(doc, {
          startY: 30,
          head: [['DATE', 'STATUS & CONTEXT ANNOTATION']],
          body: tableBody,
          theme: 'grid',
          styles: { fontSize: 6.5, cellPadding: { top: 1.2, bottom: 1.2, left: 1, right: 1 }, font: 'helvetica', textColor: 0 },
          headStyles: { fillColor: 245, textColor: 0, fontStyle: 'bold', lineWidth: 0.1, lineColor: 0 },
          columnStyles: {
            0: { cellWidth: 22, halign: 'center' },
            1: { cellWidth: 58, halign: 'left' },
          },
          margin: { left: startX + 3, right: doc.internal.pageSize.getWidth() - (startX + 83) },
        });
      };

      drawSingleSupplemental(10);
      drawSingleSupplemental(110);
    }

    const filename = buildExportFilename({
      prefix: 'dtr',
      identifier: `${data.employee.name}_${monthName}_${year}`,
      extension: 'pdf',
    });
    downloadBlob(doc.output('blob'), filename);
}

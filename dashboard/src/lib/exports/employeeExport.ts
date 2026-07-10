import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppUser, AttendanceLog } from '../../services/types';

interface JsPDFWithAutoTable extends jsPDF {
  lastAutoTable: { finalY: number };
}

function formatDtrTimeString(dateStr: string | null): string {
  if (!dateStr) return '';
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(dateStr)) {
    return dateStr.slice(0, 5);
  }
  const d = new Date(dateStr.replace(' ', 'T'));
  return isNaN(d.getTime()) ? '' : d.toTimeString().slice(0, 5);
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
    const doc = new jsPDF();
    const isRider = user.role === 'rider';

    // Title & Header branding
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(219, 108, 0); // MKB Orange
    doc.text('MKB CORPORATION - EMPLOYEE PROFILE CARD', 14, 20);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 98, 88); // Charcoal Gray
    doc.text(`Generated on ${new Date().toLocaleDateString()} | MKB Logistics Registry`, 14, 25);
    
    // Line separator
    doc.setDrawColor(239, 234, 226);
    doc.setLineWidth(0.5);
    doc.line(14, 28, 196, 28);

    // Section 1: Basic Information
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(26, 20, 16);
    doc.text('1. Basic Profile & Employment', 14, 36);

    const basicInfoRows = [
      ['Full Name', user.name || '—'],
      ['Role / Title', (user.role || '—').toUpperCase()],
      ['Employee ID (MKB ID)', user.mkbRiderId || '—'],
      ['Employment Type', user.employmentType || '—'],
      ['Date Joined / Hire', formattedHireDate],
      ['Assigned Operational Zone', zoneName],
      ['Shift Assignment', user.shift || '—'],
      ['Account Registry Status', user.status || '—']
    ];

    autoTable(doc, {
      startY: 40,
      head: [['Field / Property', 'Registered Value']],
      body: basicInfoRows,
      theme: 'striped',
      headStyles: { fillColor: [219, 108, 0], textColor: 255 },
      styles: { fontSize: 9, font: 'helvetica' },
      margin: { left: 14, right: 14 }
    });

    const nextY1 = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 10;

    // Section 2: Contact & Address Details
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Contact Info & Residential Address', 14, nextY1);

    const contactAddressRows = [
      ['Primary Email', user.email || '—'],
      ['Phone Number', user.contact || '—'],
      ['Last Active Time', formattedLastLogin],
      ['Street Address', user.streetAddress || '—'],
      ['Barangay', user.barangay || '—'],
      ['City', user.city || '—'],
      ['Province', user.province || '—'],
      ['Zip Code', user.zipCode || '—']
    ];

    autoTable(doc, {
      startY: nextY1 + 4,
      head: [['Property', 'Details']],
      body: contactAddressRows,
      theme: 'striped',
      headStyles: { fillColor: [219, 108, 0], textColor: 255 },
      styles: { fontSize: 9, font: 'helvetica' },
      margin: { left: 14, right: 14 }
    });

    const nextY2 = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 10;

    // Section 3: Vehicle Specs, Emergency Info, and Remarks
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Operations, Emergency & Onboarding Notes', 14, nextY2);

    const vehicleEmergencyRows = [
      ['Vehicle Type / Class', isRider ? (user.vehicleType || '—') : 'Not applicable'],
      ['Vehicle License Plate', isRider ? (user.vehiclePlateNumber || '—') : 'Not applicable'],
      ['Emergency Contact Person', user.emergencyContactName || '—'],
      ['Emergency Contact Phone', user.emergencyContactPhone || '—'],
      ['Biometric Scan Enrolled', user.faceImage ? 'Yes (Enrolled)' : 'No (Pending)'],
      ['Onboarding Notes / Remarks', user.notes || 'No remarks recorded']
    ];

    autoTable(doc, {
      startY: nextY2 + 4,
      head: [['Operation/HR Item', 'Status / Detail']],
      body: vehicleEmergencyRows,
      theme: 'striped',
      headStyles: { fillColor: [219, 108, 0], textColor: 255 },
      styles: { fontSize: 9, font: 'helvetica' },
      margin: { left: 14, right: 14 }
    });

    const finalY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 20;

    // Verification Signature Block
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Employee Signature:', 14, finalY);
    doc.line(14, finalY + 8, 80, finalY + 8);

    doc.text('Authorized Administrator:', 120, finalY);
    doc.line(120, finalY + 8, 186, finalY + 8);

    doc.save(`MKB_Profile_Card_${(user.name || 'employee').replace(/\s+/g, '_')}.pdf`);
  } catch (err) {
    console.error('Failed to export profile PDF:', err);
  }
}

interface ExportDTROptions {
  riderName: string;
  riderRole: string;
  zoneName: string;
  calendarDate: Date;
  logs: AttendanceLog[];
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
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthName = calendarDate.toLocaleString('en-US', { month: 'long' });
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const drawSingleDTR = (startX: number) => {
      doc.setFont('helvetica', 'normal');

      // Title
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DAILY TIME RECORD', startX + 43, 15, { align: 'center' });

      // Name Line
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.text(riderName.toUpperCase(), startX + 43, 21, { align: 'center' });
      doc.line(startX + 3, 22, startX + 83, 22);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(6.5);
      doc.text('(NAME)', startX + 43, 25, { align: 'center' });

      // Info Fields
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      
      doc.text('Position:', startX + 3, 29);
      doc.setFont('helvetica', 'bold');
      doc.text(riderRole.toUpperCase(), startX + 15, 29);
      doc.line(startX + 15, 30, startX + 83, 30);

      doc.setFont('helvetica', 'normal');
      doc.text('Area of Assignment:', startX + 3, 34);
      doc.setFont('helvetica', 'bold');
      doc.text(zoneName, startX + 28, 34);
      doc.line(startX + 28, 35, startX + 83, 35);

      doc.setFont('helvetica', 'normal');
      doc.text('For the month of:', startX + 3, 39);
      doc.setFont('helvetica', 'bold');
      doc.text(`${monthName} ${year}`, startX + 26, 39);
      doc.line(startX + 26, 40, startX + 83, 40);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.text('Official hrs. for arrival (Reg.Days) and Departure (Saturdays)', startX + 3, 44);

      const tableRows = [];
      let totalMinutes = 0;

      for (let day = 1; day <= 31; day++) {
        let amIn = '';
        let amOut = '';
        let pmIn = '';
        let pmOut = '';
        let otIn = '';
        let otOut = '';
        const utHrs = '';
        const utMin = '';

        if (day <= daysInMonth) {
          const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const log = logs.find(l => l.date === dayStr);

          if (log) {
            if (log.timeIn) {
              const formattedIn = formatDtrTimeString(log.timeIn);
              if (formattedIn) {
                const hour = parseInt(formattedIn.split(':')[0], 10);
                if (hour < 12) {
                  amIn = formattedIn;
                } else {
                  pmIn = formattedIn;
                }
              }
            }
            if (log.timeOut) {
              const formattedOut = formatDtrTimeString(log.timeOut);
              if (formattedOut) {
                const hour = parseInt(formattedOut.split(':')[0], 10);
                if (hour < 12) {
                  amOut = formattedOut;
                } else {
                  pmOut = formattedOut;
                }
              }
            }

            if (log.hours > 8) {
              const formattedOut = formatDtrTimeString(log.timeOut);
              otIn = '17:00';
              otOut = formattedOut || '';
            }

            totalMinutes += Math.round(log.hours * 60);
          }
        }

        tableRows.push([
          day.toString(),
          amIn,
          amOut,
          pmIn,
          pmOut,
          otIn,
          otOut,
          utHrs,
          utMin
        ]);
      }

      const totHrs = Math.floor(totalMinutes / 60);
      const totMins = totalMinutes % 60;
      tableRows.push([
        'TOTAL',
        '',
        '',
        '',
        '',
        '',
        '',
        totHrs > 0 ? `${totHrs}h` : '0h',
        totMins > 0 ? `${totMins}m` : '0m'
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

      const finalY = (doc as JsPDFWithAutoTable).lastAutoTable.finalY + 6;

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

    doc.save(`MKB_DTR_${riderName.replace(/\s+/g, '_')}_${monthName}_${year}.pdf`);
  } catch (err) {
    console.error('Failed to generate DTR PDF:', err);
  }
}

import { describe, expect, it } from 'vitest';
import { formatPdfCurrency, PDF_DOCUMENT_THEME } from './pdfDocumentTheme';
import { createReportPdf } from './reportExport';
import { createParcelPayslipPdf, type PayslipDocumentData } from './payrollExport';
import { createEmployeeProfilePdf } from './employeeExport';

describe('MKB business document theme', () => {
  it('uses a restrained shared print palette and readable density', () => {
    expect(PDF_DOCUMENT_THEME.colors).toMatchObject({
      accent: '#DB6C00',
      ink: '#1A1410',
      muted: '#6B6258',
      rule: '#DDD6CC',
    });
    expect(PDF_DOCUMENT_THEME.table.bodyFontSize).toBeGreaterThanOrEqual(8);
    expect(PDF_DOCUMENT_THEME.page.margin).toBeGreaterThanOrEqual(32);
    expect(formatPdfCurrency(1234.5)).toBe('PHP 1,234.50');
  });

  it('paginates dense operational tables with repeated document chrome', () => {
    const rows = Array.from({ length: 85 }, (_, index) => [
      `Rider ${index + 1}`, 'North Operations Zone', '2026-08-01', '08:00', '17:00', 9, 'present',
    ]);
    const doc = createReportPdf({
      title: 'Weekly Attendance',
      columns: ['Rider', 'Zone', 'Date', 'Time-In', 'Time-Out', 'Hours', 'Status'],
      rows,
    }, { from: '2026-08-01', to: '2026-08-15' });

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const pageCommands = (doc.internal as unknown as { pages: string[][] }).pages.flat().join('\n');
    expect(pageCommands).toContain('Weekly Attendance');
    expect(pageCommands).toContain('REPORTING PERIOD');
    expect(pageCommands).toContain('Page 1 of');
  });

  it('renders the authoritative payslip net and payroll sections', () => {
    const data: PayslipDocumentData = {
      rider: { name: 'Juan Rider', mkbId: 'MKB-001', zoneName: 'North' },
      cutoff: { from: '2026-08-01', to: '2026-08-15' },
      days: [{
        date: '2026-08-01', standardParcels: 7, heavyParcels: 3, failedParcels: 1, returnedParcels: 1,
        standardRate: 12, heavyRate: 17, standardEarnings: 84, heavyEarnings: 51,
        grossDeliveryPay: 135, rateConfigurationId: 'rates-1', calculationVersion: 2,
      }],
      snapshot: {
        source: 'snapshot', calculationVersion: 2, standardParcels: 7, heavyParcels: 3,
        failedParcels: 1, returnedParcels: 1, standardEarnings: 84, heavyEarnings: 51,
        grossDeliveryPay: 135,
      },
      adjustments: { otherEarnings: 25, fmPickupAmount: 6, deductions: 10, lateOnhold: 5, lateRemittance: 11 },
      totals: { totalEarnings: 166, totalDeductions: 26, netPay: 140 },
    };

    const doc = createParcelPayslipPdf(data);
    const commands = (doc.internal as unknown as { pages: string[][] }).pages.flat().join('\n');
    expect(commands).toContain('Rider Payslip');
    expect(commands).toContain('PAYROLL RECONCILIATION');
    expect(commands).toContain('NET TAKE-HOME PAY');
    expect(commands.split('\u0000').join('')).toContain('140.00');
  });

  it('renders employee information groups without fabricated signature lines', () => {
    const doc = createEmployeeProfilePdf({
      employee: { name: 'Ana Employee', role: 'HR', zoneName: 'Head Office' },
      generatedOn: 'August 15, 2026',
      sections: {
        basic: [['Full Name', 'Ana Employee']],
        contact: [['Primary Email', 'ana@example.com']],
        operations: [['Emergency Contact Person', 'Not recorded']],
      },
    });
    const commands = (doc.internal as unknown as { pages: string[][] }).pages.flat().join('\n');
    expect(commands).toContain('Employee Profile');
    expect(commands).toContain('IDENTITY AND EMPLOYMENT');
    expect(commands).not.toContain("EMPLOYEE'S SIGNATURE");
  });
});

import { describe, expect, it } from 'vitest';
import type { AttendanceLog, AppUser } from '../../services/types';
import * as payrollExport from './payrollExport';
import * as employeeExport from './employeeExport';
import * as attendanceExport from './attendanceExport';

describe('typed payslip document data', () => {
  it('builds one renderer-neutral model with authoritative totals', () => {
    const build = (payrollExport as typeof payrollExport & {
      buildPayslipDocumentData?: (input: Record<string, unknown>) => {
        rider: { name: string; mkbId: string; zoneName: string };
        adjustments: Required<payrollExport.PayslipAdjustments>;
        totals: { totalEarnings: number; totalDeductions: number; netPay: number };
      };
    }).buildPayslipDocumentData;
    expect(typeof build).toBe('function');

    const data = build?.({
      riderName: 'Juan Rider', mkbId: 'MKB-2009', zoneName: 'North',
      cutoffFrom: '2026-08-01', cutoffTo: '2026-08-15', dayEntries: [],
      snapshot: {
        source: 'snapshot', calculationVersion: 2, standardParcels: 10, heavyParcels: 2,
        failedParcels: 1, returnedParcels: 0, standardEarnings: 120, heavyEarnings: 34,
        grossDeliveryPay: 154,
      },
      adjustments: { otherEarnings: 20, fmPickupAmount: 6, deductions: 10, lateOnhold: 5, lateRemittance: 7 },
    });

    expect(data?.rider).toEqual({ name: 'Juan Rider', mkbId: 'MKB-2009', zoneName: 'North' });
    expect(data?.adjustments).toMatchObject({ otherEarnings: 20, fmPickupAmount: 6, deductions: 10, lateOnhold: 5, lateRemittance: 7 });
    expect(data?.totals).toEqual({ totalEarnings: 180, totalDeductions: 22, netPay: 158 });
  });
});

describe('typed cutoff summary document data', () => {
  it('builds renderer-neutral rows, totals, and date metadata', () => {
    const build = (payrollExport as typeof payrollExport & {
      buildCutoffSummaryDocumentData?: (
        rows: payrollExport.CutoffSummaryRow[],
        period: { label: string; from: string; to: string },
      ) => {
        period: { label: string; from: string; to: string };
        rows: payrollExport.CutoffSummaryRow[];
        totals: { parcels: number; grossPay: number };
      };
    }).buildCutoffSummaryDocumentData;
    expect(typeof build).toBe('function');

    const data = build?.([{
      riderName: 'Juan', riderId: 'MKB-1', zone: 'North', totalParcels: 12, grossPay: 144,
    }], { label: 'August 1–15, 2026', from: '2026-08-01', to: '2026-08-15' });

    expect(data?.period).toEqual({ label: 'August 1–15, 2026', from: '2026-08-01', to: '2026-08-15' });
    expect(data?.totals).toEqual({ parcels: 12, grossPay: 144 });
    expect(data?.rows[0].riderId).toBe('MKB-1');
  });
});

describe('typed attendance document data', () => {
  it('normalizes authorized logs without browser or query concerns', () => {
    const build = (attendanceExport as typeof attendanceExport & {
      buildAttendanceDocumentData?: (
        logs: AttendanceLog[],
        period: { from: string; to: string },
      ) => { period: { from: string; to: string }; rows: Array<{ riderName: string; hours: number }> };
    }).buildAttendanceDocumentData;
    expect(typeof build).toBe('function');

    const data = build?.([{
      id: 'a1', riderId: 'r1', riderName: 'Juan', zoneId: 'z1', zoneName: 'North',
      date: '2026-08-01', timeIn: '08:00', timeOut: '17:00', hours: 9,
      status: 'present', source: 'face-scan',
    } as AttendanceLog], { from: '2026-08-01', to: '2026-08-15' });

    expect(data?.period).toEqual({ from: '2026-08-01', to: '2026-08-15' });
    expect(data?.rows[0]).toMatchObject({ riderName: 'Juan', hours: 9 });
  });
});

describe('replaceable employee document models', () => {
  it('normalizes profile content before PDF rendering', () => {
    const build = (employeeExport as typeof employeeExport & {
      buildEmployeeProfileDocumentData?: (input: Record<string, unknown>) => {
        employee: { name: string; role: string; zoneName: string };
        sections: { basic: string[][]; contact: string[][]; operations: string[][] };
      };
    }).buildEmployeeProfileDocumentData;
    expect(typeof build).toBe('function');
    const user = {
      name: 'Ana Employee', role: 'hr', email: 'ana@example.com', status: 'active',
      employmentType: 'regular', faceImage: null,
    } as AppUser;
    const data = build?.({ user, zoneName: 'Head Office', formattedHireDate: 'August 01, 2025', formattedLastLogin: 'August 15, 2026' });
    expect(data?.employee).toEqual({ name: 'Ana Employee', role: 'HR', zoneName: 'Head Office' });
    expect(data?.sections.basic[0]).toEqual(['Full Name', 'Ana Employee']);
    expect(data?.sections.contact[0]).toEqual(['Primary Email', 'ana@example.com']);
  });

  it('maps attendance into a renderer-neutral DTR month without changing current time placement', () => {
    const build = (employeeExport as typeof employeeExport & {
      buildDtrDocumentData?: (input: Record<string, unknown>) => {
        month: { year: number; monthName: string; daysInMonth: number };
        rows: Array<{ day: number | 'TOTAL'; amIn: string; pmOut: string; overtimeIn: string; overtimeOut: string; undertimeHours: string; undertimeMinutes: string }>;
      };
    }).buildDtrDocumentData;
    expect(typeof build).toBe('function');
    const log = {
      date: '2026-08-01', timeIn: '08:00:00', timeOut: '17:30:00', hours: 8.5,
    } as AttendanceLog;
    const data = build?.({ riderName: 'Juan Rider', riderRole: 'rider', zoneName: 'North', calendarDate: new Date('2026-08-01T00:00:00+08:00'), logs: [log] });

    expect(data?.month).toEqual({ year: 2026, monthName: 'August', daysInMonth: 31 });
    expect(data?.rows).toHaveLength(32);
    expect(data?.rows[0]).toMatchObject({ day: 1, amIn: '08:00', pmOut: '17:30', overtimeIn: '17:00', overtimeOut: '17:30' });
    expect(data?.rows[31]).toMatchObject({ day: 'TOTAL', undertimeHours: '8h', undertimeMinutes: '30m' });
  });

  it('preserves all context-bearing dates beyond six entries without truncation or leaking private fields', () => {
    const build = (employeeExport as typeof employeeExport & {
      buildDtrDocumentData?: (input: Record<string, unknown>) => {
        rows: Array<{ day: number | 'TOTAL'; amIn: string; pmOut: string; statusText?: string; contextText?: string }>;
        contextNotes: string[];
      };
    }).buildDtrDocumentData;

    const sampleLogs = [
      { date: '2026-08-01', timeIn: null, timeOut: null, hours: 0, status: 'on_leave', contextCode: 'approved_leave' },
      { date: '2026-08-02', timeIn: null, timeOut: null, hours: 0, status: 'day_off', contextCode: 'published_day_off' },
      { date: '2026-08-03', timeIn: null, timeOut: null, hours: 0, status: 'absent', contextCode: 'accepted_notice' },
      { date: '2026-08-04', timeIn: null, timeOut: null, hours: 0, status: 'absent', contextCode: 'notice_rejected' },
      { date: '2026-08-05', timeIn: null, timeOut: null, hours: 0, status: 'absent', contextCode: 'leave_rejected' },
      { date: '2026-08-06', timeIn: null, timeOut: null, hours: 0, status: 'day_off' }, // no explicit contextCode
      { date: '2026-08-07', timeIn: null, timeOut: null, hours: 0, status: 'on_leave', contextCode: 'approved_leave' },
      { date: '2026-08-08', timeIn: '08:00:00', timeOut: '17:00:00', hours: 8, status: 'present', contextCode: 'worked_during_approved_leave' },
      { date: '2026-08-09', timeIn: null, timeOut: null, hours: 0, status: 'day_off', contextCode: 'published_day_off' },
      { date: '2026-08-10', timeIn: null, timeOut: null, hours: 0, status: 'absent', contextCode: 'no_notice' },
    ];

    const data = build?.({
      riderName: 'Juan Rider',
      riderRole: 'rider',
      zoneName: 'North Hub',
      calendarDate: new Date('2026-08-01T00:00:00+08:00'),
      logs: sampleLogs,
    });

    // 10 context-bearing dates must all be captured in contextNotes without truncation after 6
    expect(data?.contextNotes).toHaveLength(10);
    expect(data?.contextNotes[0]).toBe('2026-08-01: On Leave · Approved Leave');
    expect(data?.contextNotes[1]).toBe('2026-08-02: Day Off · Published Day Off');
    expect(data?.contextNotes[2]).toBe('2026-08-03: Absent · Accepted Notice');
    expect(data?.contextNotes[3]).toBe('2026-08-04: Absent · Notice Rejected');
    expect(data?.contextNotes[4]).toBe('2026-08-05: Absent · Leave Rejected');
    expect(data?.contextNotes[5]).toBe('2026-08-06: Day Off · Published Day Off');
    expect(data?.contextNotes[6]).toBe('2026-08-07: On Leave · Approved Leave');
    expect(data?.contextNotes[7]).toBe('2026-08-08: Present · Worked During Approved Leave');
    expect(data?.contextNotes[8]).toBe('2026-08-09: Day Off · Published Day Off');
    expect(data?.contextNotes[9]).toBe('2026-08-10: Absent · No Notice');

    // Clocks for worked day preserved, not invented for unworked days
    expect(data?.rows[7]).toMatchObject({ day: 8, amIn: '08:00', pmOut: '17:00' });
    expect(data?.rows[0]).toMatchObject({ day: 1, amIn: '', pmOut: '' });

    // No private reason, review note, or audit string present
    const serialized = JSON.stringify(data?.contextNotes);
    expect(serialized).not.toContain('reason');
    expect(serialized).not.toContain('review');
    expect(serialized).not.toContain('audit');
  });
});

describe('official payslip isolation', () => {
  it('exposes a dedicated locked-template adapter boundary', async () => {
    const modulePath = './officialPayslipTemplateAdapter';
    let adapter: { exportOfficialPayslipXLSX?: unknown } = {};
    try {
      adapter = await import(/* @vite-ignore */ modulePath);
    } catch {
      adapter = {};
    }
    expect(typeof adapter.exportOfficialPayslipXLSX).toBe('function');
  });
});

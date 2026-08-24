import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('./Settings.tsx', import.meta.url), 'utf8');
const attendancePolicyPageSource = readFileSync(new URL('./AttendancePolicy.tsx', import.meta.url), 'utf8');
const parcelRatesPageSource = readFileSync(new URL('./ParcelRates.tsx', import.meta.url), 'utf8');
const topbarSource = readFileSync(new URL('../components/common/Topbar.tsx', import.meta.url), 'utf8');
const attendancePolicySource = readFileSync(new URL('../components/attendance/AttendancePolicySettings.tsx', import.meta.url), 'utf8');
const parcelRatesSource = readFileSync(new URL('../components/payroll/PayrollParcelRatesSettings.tsx', import.meta.url), 'utf8');

describe('Business configuration route relocation', () => {
  it('routes the existing modules through shared Attendance Policy and Parcel Rates pages', () => {
    expect(appSource).toContain("import('./pages/AttendancePolicy')");
    expect(appSource).toContain("import('./pages/ParcelRates')");
    expect(appSource).toContain("safePage === 'attendance_policy'");
    expect(appSource).toContain("safePage === 'parcel_rates'");
    expect(attendancePolicyPageSource).toContain("../components/attendance/AttendancePolicySettings");
    expect(parcelRatesPageSource).toContain("../components/payroll/PayrollParcelRatesSettings");
  });

  it('keeps Settings limited to Personal Detail, Security, and Notification', () => {
    expect(settingsSource).toContain("type TabType = 'Personal Detail' | 'Security' | 'Notification';");
    expect(settingsSource).not.toContain('AttendancePolicySettings');
    expect(settingsSource).not.toContain('PayrollParcelRatesSettings');
    expect(settingsSource).not.toContain('Payroll & Parcel Rates');
  });

  it('uses destination page metadata and preserves Admin-only actions', () => {
    expect(topbarSource).toContain("title: 'Attendance Policy'");
    expect(topbarSource).toContain("subtitle: 'Set the time when a rider is considered late.'");
    expect(topbarSource).toContain("title: 'Parcel Rates'");
    expect(topbarSource).toContain("subtitle: 'Set the parcel rates used for rider payroll.'");
    expect(attendancePolicySource).toContain("const canManage = role === 'admin';");
    expect(parcelRatesSource).toContain("const canManage = role === 'admin';");
    expect(parcelRatesSource).toContain("role === 'admin' && <section");
  });
});

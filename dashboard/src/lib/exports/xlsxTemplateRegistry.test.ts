import { describe, expect, it } from 'vitest';

type RegistryModule = {
  XLSX_TEMPLATE_REGISTRY?: Record<string, {
    assetPath: string;
    sheetName: string;
    headerRow: number;
    dataStartRow: number;
    dataEndRow: number;
    writableColumns: { start: number; end: number };
    expectedHeaderCount: number;
    protectedRows: number[];
  }>;
};

async function loadRegistry(): Promise<RegistryModule> {
  const modulePath = './xlsxTemplateRegistry';
  try {
    return await import(/* @vite-ignore */ modulePath) as RegistryModule;
  } catch {
    return {};
  }
}

describe('explicit XLSX template registry', () => {
  it('declares safe writable and protected regions for existing templates', async () => {
    const module = await loadRegistry();
    expect(module.XLSX_TEMPLATE_REGISTRY).toBeDefined();
    expect(module.XLSX_TEMPLATE_REGISTRY?.cutoffSummary).toMatchObject({
      assetPath: '/files/MKB_Cutoff_Summary_Payroll_Template.xlsx',
      sheetName: 'Cutoff Summary', headerRow: 5, dataStartRow: 6, dataEndRow: 30,
      writableColumns: { start: 1, end: 6 }, expectedHeaderCount: 6, protectedRows: [31, 33],
    });
    expect(module.XLSX_TEMPLATE_REGISTRY?.employeeRegistry).toMatchObject({
      sheetName: 'Employee Registry', dataStartRow: 6, dataEndRow: 36,
      writableColumns: { start: 1, end: 7 }, expectedHeaderCount: 7, protectedRows: [37],
    });
  });

  it('keeps analytics sheet mappings explicit instead of inferred', async () => {
    const module = await loadRegistry();
    expect(module.XLSX_TEMPLATE_REGISTRY?.weeklyAttendance).toMatchObject({
      assetPath: '/files/MKB_Analytics_Reports_Template.xlsx', sheetName: 'Rider Daily Summary', expectedHeaderCount: 7,
    });
    expect(module.XLSX_TEMPLATE_REGISTRY?.violationSummary).toMatchObject({ sheetName: 'Geofence Violations', expectedHeaderCount: 6 });
    expect(module.XLSX_TEMPLATE_REGISTRY?.zoneCoverage).toMatchObject({ sheetName: 'Rider Roster', expectedHeaderCount: 4 });
    expect(module.XLSX_TEMPLATE_REGISTRY?.riderPerformance).toMatchObject({ sheetName: 'Weekly Efficiency', expectedHeaderCount: 6 });
  });
});

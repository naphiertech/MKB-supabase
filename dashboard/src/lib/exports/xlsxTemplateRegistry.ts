export type XlsxTemplateKey =
  | 'cutoffSummary'
  | 'rawParcelLogs'
  | 'employeeRegistry'
  | 'weeklyAttendance'
  | 'violationSummary'
  | 'zoneCoverage'
  | 'riderPerformance';

export interface XlsxTemplateDefinition {
  assetPath: string;
  sheetName: string;
  descriptor: string;
  headerRow: number;
  dataStartRow: number;
  dataEndRow: number;
  writableColumns: { start: number; end: number };
  expectedHeaderCount: number;
  protectedRows: number[];
  totalRow?: number;
  totalFormulas?: Record<string, (lastDataRow: number) => string>;
  keepOnlyTargetSheet?: boolean;
  columns: Array<{
    width: number;
    kind: 'text' | 'date' | 'integer' | 'decimal' | 'currency' | 'percentage' | 'status';
  }>;
}

export const XLSX_TEMPLATE_REGISTRY: Record<XlsxTemplateKey, XlsxTemplateDefinition> = {
  cutoffSummary: {
    assetPath: '/files/MKB_Cutoff_Summary_Payroll_Template.xlsx', sheetName: 'Cutoff Summary',
    descriptor: 'Fleet delivery volume and gross payroll review',
    headerRow: 5, dataStartRow: 6, dataEndRow: 30, writableColumns: { start: 1, end: 6 },
    expectedHeaderCount: 6, protectedRows: [31, 33], totalRow: 31,
    columns: [
      { width: 28, kind: 'text' }, { width: 14, kind: 'text' }, { width: 22, kind: 'text' },
      { width: 15, kind: 'integer' }, { width: 12, kind: 'status' }, { width: 18, kind: 'currency' },
    ],
    totalFormulas: {
      D: lastRow => `SUM(D6:D${lastRow})`,
      E: lastRow => `COUNTIF(E6:E${lastRow},"YES")`,
      F: lastRow => `SUM(F6:F${lastRow})`,
    },
  },
  rawParcelLogs: {
    assetPath: '/files/MKB_Raw_Parcel_Delivery_Logs.xlsx', sheetName: 'Parcel Logs',
    descriptor: 'Detailed parcel delivery transaction register',
    headerRow: 5, dataStartRow: 6, dataEndRow: 25, writableColumns: { start: 1, end: 7 },
    expectedHeaderCount: 7, protectedRows: [26, 28], totalRow: 26,
    columns: [
      { width: 14, kind: 'date' }, { width: 26, kind: 'text' }, { width: 20, kind: 'text' },
      { width: 12, kind: 'integer' }, { width: 13, kind: 'currency' }, { width: 11, kind: 'integer' },
      { width: 18, kind: 'currency' },
    ],
    totalFormulas: {
      E: lastRow => `SUM(E6:E${lastRow})`,
      G: lastRow => `SUM(G6:G${lastRow})`,
    },
  },
  employeeRegistry: {
    assetPath: '/files/MKB_Employee_Registry_Template.xlsx', sheetName: 'Employee Registry',
    descriptor: 'Personnel and operational assignment register',
    headerRow: 5, dataStartRow: 6, dataEndRow: 36, writableColumns: { start: 1, end: 7 },
    expectedHeaderCount: 7, protectedRows: [37],
    columns: [
      { width: 26, kind: 'text' }, { width: 30, kind: 'text' }, { width: 16, kind: 'text' },
      { width: 18, kind: 'text' }, { width: 14, kind: 'status' }, { width: 20, kind: 'text' },
      { width: 22, kind: 'text' },
    ],
  },
  weeklyAttendance: {
    assetPath: '/files/MKB_Analytics_Reports_Template.xlsx', sheetName: 'Rider Daily Summary',
    descriptor: 'Daily rider attendance and work-hour register',
    headerRow: 5, dataStartRow: 6, dataEndRow: 30, writableColumns: { start: 1, end: 7 },
    expectedHeaderCount: 7, protectedRows: [], keepOnlyTargetSheet: true,
    columns: [
      { width: 26, kind: 'text' }, { width: 20, kind: 'text' }, { width: 14, kind: 'date' },
      { width: 12, kind: 'text' }, { width: 12, kind: 'text' }, { width: 12, kind: 'decimal' },
      { width: 14, kind: 'status' },
    ],
  },
  violationSummary: {
    assetPath: '/files/MKB_Analytics_Reports_Template.xlsx', sheetName: 'Geofence Violations',
    descriptor: 'Geofence incident and resolution register',
    headerRow: 5, dataStartRow: 6, dataEndRow: 30, writableColumns: { start: 1, end: 6 },
    expectedHeaderCount: 6, protectedRows: [], keepOnlyTargetSheet: true,
    columns: [
      { width: 24, kind: 'text' }, { width: 22, kind: 'text' }, { width: 22, kind: 'text' },
      { width: 22, kind: 'text' }, { width: 16, kind: 'status' }, { width: 20, kind: 'text' },
    ],
  },
  zoneCoverage: {
    assetPath: '/files/MKB_Analytics_Reports_Template.xlsx', sheetName: 'Rider Roster',
    descriptor: 'Rider assignment and zone coverage roster',
    headerRow: 5, dataStartRow: 6, dataEndRow: 30, writableColumns: { start: 1, end: 4 },
    expectedHeaderCount: 4, protectedRows: [], keepOnlyTargetSheet: true,
    columns: [
      { width: 28, kind: 'text' }, { width: 20, kind: 'integer' },
      { width: 20, kind: 'decimal' }, { width: 14, kind: 'integer' },
    ],
  },
  riderPerformance: {
    assetPath: '/files/MKB_Analytics_Reports_Template.xlsx', sheetName: 'Weekly Efficiency',
    descriptor: 'Attendance, hours, and incident efficiency review',
    headerRow: 5, dataStartRow: 6, dataEndRow: 30, writableColumns: { start: 1, end: 6 },
    expectedHeaderCount: 6, protectedRows: [], keepOnlyTargetSheet: true,
    columns: [
      { width: 28, kind: 'text' }, { width: 15, kind: 'integer' }, { width: 15, kind: 'decimal' },
      { width: 13, kind: 'integer' }, { width: 13, kind: 'integer' }, { width: 18, kind: 'percentage' },
    ],
  },
};

export function getXlsxTemplate(key: XlsxTemplateKey): XlsxTemplateDefinition {
  return XLSX_TEMPLATE_REGISTRY[key];
}

export function findXlsxTemplateByAssetPath(assetPath: string): XlsxTemplateDefinition | undefined {
  return Object.values(XLSX_TEMPLATE_REGISTRY).find(template => template.assetPath === assetPath);
}

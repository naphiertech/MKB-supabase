import ExcelJS from 'exceljs';
import { downloadBlob, EXPORT_MIME_TYPES } from './exportUtils';
import {
  findXlsxTemplateByAssetPath,
  getXlsxTemplate,
  type XlsxTemplateDefinition,
  type XlsxTemplateKey,
} from './xlsxTemplateRegistry';

type SpreadsheetCell = string | number;
type ColumnKind = XlsxTemplateDefinition['columns'][number]['kind'];

const XLSX_STYLE = {
  ink: 'FF1A1410', accent: 'FFDB6C00', muted: 'FF6B6258', surface: 'FFF7F4EF', rule: 'FFDDD6CC', white: 'FFFFFFFF',
};

function styleTemplateDocumentHeader(
  worksheet: ExcelJS.Worksheet,
  lastColumn: number,
  descriptor: string,
): void {
  worksheet.getCell('A1').value = 'MKBRiderTrack | MKB CORPORATION';
  worksheet.getCell('A3').value = descriptor;
  worksheet.getRow(1).height = 23;
  worksheet.getRow(2).height = 22;
  worksheet.getRow(3).height = 18;

  for (let rowNumber = 1; rowNumber <= 3; rowNumber += 1) {
    for (let columnNumber = 1; columnNumber <= lastColumn; columnNumber += 1) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLE.white } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.font = {
        name: 'Arial',
        size: rowNumber === 1 ? 14 : rowNumber === 2 ? 12 : 9,
        bold: rowNumber <= 2,
        italic: rowNumber === 3,
        color: { argb: rowNumber === 1 ? XLSX_STYLE.accent : rowNumber === 3 ? XLSX_STYLE.muted : XLSX_STYLE.ink },
      };
      if (rowNumber === 3) {
        cell.border = { bottom: { style: 'medium', color: { argb: XLSX_STYLE.accent } } };
      }
    }
  }
}

function inferColumnKind(header: string): ColumnKind {
  if (/date$/i.test(header)) return 'date';
  if (/currency|gross|pay|earnings|deduction|amount|rate$/i.test(header)) return 'currency';
  if (/percentage|%/i.test(header)) return 'percentage';
  if (/count|parcels|riders|violations|failed|returned|delivered|heavy|standard/i.test(header)) return 'integer';
  if (/hours/i.test(header)) return 'decimal';
  if (/status|resolved|flagged/i.test(header)) return 'status';
  return 'text';
}

function numberFormatFor(kind: ColumnKind): string | undefined {
  if (kind === 'date') return 'yyyy-mm-dd';
  if (kind === 'integer') return '#,##0';
  if (kind === 'decimal') return '#,##0.0';
  if (kind === 'currency') return '₱#,##0.00;[Red](₱#,##0.00);-';
  if (kind === 'percentage') return '0%';
  return undefined;
}

function normalizedSpreadsheetValue(value: SpreadsheetCell, kind: ColumnKind): SpreadsheetCell | Date {
  if (kind === 'date' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }
  if (kind === 'percentage' && typeof value === 'string' && value.endsWith('%')) {
    return Number(value.slice(0, -1)) / 100;
  }
  return value;
}

function styleWorksheet(
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  dataStartRow: number,
  dataEndRow: number,
  columns: Array<{ width: number; kind: ColumnKind }>,
  populatedRowCount: number,
  totalRow?: number,
): void {
  const firstColumn = 1;
  const lastColumn = columns.length;
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];
  worksheet.properties.defaultRowHeight = 18;
  worksheet.getRow(headerRowNumber).height = 25;
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: firstColumn },
    to: { row: Math.max(dataStartRow, dataStartRow + populatedRowCount - 1), column: lastColumn },
  };
  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    orientation: lastColumn > 6 ? 'landscape' : 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
  worksheet.headerFooter.oddFooter = '&L MKBRiderTrack | MKB Corporation&C&BConfidential business document&RPage &P of &N';

  const header = worksheet.getRow(headerRowNumber);
  header.eachCell({ includeEmpty: true }, cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLE.ink } };
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: XLSX_STYLE.white } };
    cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    cell.border = { bottom: { style: 'medium', color: { argb: XLSX_STYLE.accent } } };
  });

  columns.forEach((definition, index) => {
    const columnNumber = index + 1;
    const column = worksheet.getColumn(columnNumber);
    column.width = definition.width;
    column.numFmt = numberFormatFor(definition.kind) ?? 'General';
    for (let rowNumber = dataStartRow; rowNumber <= dataEndRow; rowNumber += 1) {
      const cell = worksheet.getCell(rowNumber, columnNumber);
      cell.font = { name: 'Arial', size: 9.5, color: { argb: XLSX_STYLE.ink } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: ['integer', 'decimal', 'currency', 'percentage'].includes(definition.kind)
          ? 'right'
          : definition.kind === 'date' || definition.kind === 'status' ? 'center' : 'left',
        wrapText: definition.kind === 'text',
      };
      cell.border = { bottom: { style: 'hair', color: { argb: XLSX_STYLE.rule } } };
      if ((rowNumber - dataStartRow) % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: XLSX_STYLE.surface } };
      }
      if (definition.kind === 'status') cell.font = { ...cell.font, bold: true };
    }
  });

  if (totalRow) {
    const total = worksheet.getRow(totalRow);
    total.height = 22;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const cell = total.getCell(column);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E8' } };
      cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: XLSX_STYLE.ink } };
      cell.border = { top: { style: 'double', color: { argb: XLSX_STYLE.accent } } };
    }
  }
}

function resolveTemplate(template?: string): XlsxTemplateDefinition | undefined {
  if (!template) return undefined;
  if (template.startsWith('/')) return findXlsxTemplateByAssetPath(template);
  return getXlsxTemplate(template as XlsxTemplateKey);
}

async function renderTemplateWorkbook(
  definition: XlsxTemplateDefinition,
  columns: string[],
  rows: SpreadsheetCell[][],
): Promise<Blob> {
  if (columns.length > definition.expectedHeaderCount) {
    throw new Error(
      `Template "${definition.sheetName}" supports ${definition.expectedHeaderCount} columns; received ${columns.length}.`,
    );
  }
  if (rows.some(row => row.length > definition.expectedHeaderCount)) {
    throw new Error(`A data row exceeds the writable columns for template "${definition.sheetName}".`);
  }

  const response = await fetch(definition.assetPath);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await response.arrayBuffer());
  const worksheet = workbook.getWorksheet(definition.sheetName);
  if (!worksheet) throw new Error(`Worksheet "${definition.sheetName}" not found in template.`);

  let dataEndRow = definition.dataEndRow;
  let totalRow = definition.totalRow;
  const capacity = dataEndRow - definition.dataStartRow + 1;
  if (rows.length > capacity) {
    const extraRows = rows.length - capacity;
    worksheet.insertRows(dataEndRow + 1, Array.from({ length: extraRows }, () => []), 'i');
    const sourceRow = worksheet.getRow(dataEndRow);
    for (let rowNumber = dataEndRow + 1; rowNumber <= dataEndRow + extraRows; rowNumber += 1) {
      const targetRow = worksheet.getRow(rowNumber);
      targetRow.height = sourceRow.height;
      sourceRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        targetRow.getCell(columnNumber).style = cell.style;
      });
    }
    dataEndRow += extraRows;
    if (totalRow) totalRow += extraRows;
  }

  const { start: firstColumn, end: lastColumn } = definition.writableColumns;
  const headerRow = worksheet.getRow(definition.headerRow);
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    headerRow.getCell(column).value = columns[column - firstColumn] ?? null;
  }
  headerRow.commit();

  rows.forEach((rowData, rowIndex) => {
    const excelRow = worksheet.getRow(definition.dataStartRow + rowIndex);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const columnDefinition = definition.columns[column - firstColumn];
      excelRow.getCell(column).value = columnDefinition
        ? normalizedSpreadsheetValue(rowData[column - firstColumn] ?? '', columnDefinition.kind)
        : rowData[column - firstColumn] ?? null;
    }
    excelRow.commit();
  });

  for (
    let rowNumber = definition.dataStartRow + rows.length;
    rowNumber <= dataEndRow;
    rowNumber += 1
  ) {
    const excelRow = worksheet.getRow(rowNumber);
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      excelRow.getCell(column).value = null;
    }
    excelRow.commit();
  }

  if (definition.totalFormulas && totalRow) {
    for (const [column, formula] of Object.entries(definition.totalFormulas)) {
      worksheet.getCell(`${column}${totalRow}`).value = { formula: formula(dataEndRow) };
    }
  }

  styleWorksheet(
    worksheet,
    definition.headerRow,
    definition.dataStartRow,
    dataEndRow,
    definition.columns,
    rows.length,
    totalRow,
  );
  styleTemplateDocumentHeader(worksheet, definition.columns.length, definition.descriptor);

  if (definition.keepOnlyTargetSheet) {
    workbook.worksheets
      .filter(sheet => sheet.id !== worksheet.id)
      .forEach(sheet => workbook.removeWorksheet(sheet.id));
  }

  return new Blob([await workbook.xlsx.writeBuffer()], { type: EXPORT_MIME_TYPES.xlsx });
}

async function renderGeneratedWorkbook(
  title: string,
  columns: string[],
  rows: SpreadsheetCell[][],
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MKBRiderTrack';
  workbook.company = 'MKB Corporation';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet(title.slice(0, 31));
  worksheet.addRow(columns);
  const definitions = columns.map((column, index) => ({
    width: Math.min(40, Math.max(12, column.length + 2, ...rows.map(row => String(row[index] ?? '').length + 2))),
    kind: inferColumnKind(column),
  }));
  rows.forEach(row => worksheet.addRow(row.map((value, index) => normalizedSpreadsheetValue(value, definitions[index].kind))));
  styleWorksheet(worksheet, 1, 2, Math.max(2, rows.length + 1), definitions, rows.length);
  return new Blob([await workbook.xlsx.writeBuffer()], { type: EXPORT_MIME_TYPES.xlsx });
}

export async function exportXLSXFile(
  title: string,
  columns: string[],
  rows: SpreadsheetCell[][],
  filename: string,
  template?: string,
): Promise<void> {
  const definition = resolveTemplate(template);
  if (template && !definition) {
    console.warn(`No registered Excel template found for ${template}. Falling back to default generation.`);
  }

  if (definition) {
    try {
      downloadBlob(await renderTemplateWorkbook(definition, columns, rows), `${filename}.xlsx`);
      return;
    } catch (error) {
      console.warn(
        `Failed to load Excel template at ${definition.assetPath}. Falling back to default generation.`,
        error,
      );
    }
  }

  downloadBlob(await renderGeneratedWorkbook(title, columns, rows), `${filename}.xlsx`);
}

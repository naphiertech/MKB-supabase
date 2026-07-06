import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';

export async function exportXLSXFile(
  title: string,
  columns: string[],
  rows: (string | number)[][],
  filename: string,
  templatePath?: string
) {
  if (templatePath) {
    try {
      const response = await fetch(templatePath);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      
      const worksheet = workbook.worksheets[0];
      if (!worksheet) throw new Error("Worksheet not found in template");
      
      // 1. Overwrite Row 5 with headers, clear excess
      const headerRow = worksheet.getRow(5);
      const maxCols = Math.max(columns.length, headerRow.cellCount || 0);
      for (let cIdx = 0; cIdx < maxCols; cIdx++) {
        const cell = headerRow.getCell(1 + cIdx);
        if (cIdx < columns.length) {
          cell.value = columns[cIdx];
        } else {
          cell.value = null;
        }
      }
      headerRow.commit();

      // 2. Inject rows starting from Row 6 (1-indexed in ExcelJS)
      rows.forEach((rowData, rIdx) => {
        const rowNum = 6 + rIdx;
        const excelRow = worksheet.getRow(rowNum);
        const rowMaxCols = Math.max(rowData.length, excelRow.cellCount || 0);
        for (let cIdx = 0; cIdx < rowMaxCols; cIdx++) {
          const cell = excelRow.getCell(1 + cIdx);
          if (cIdx < rowData.length) {
            cell.value = rowData[cIdx];
          } else {
            cell.value = null;
          }
        }
        excelRow.commit();
      });
      
      // 3. Clear remaining placeholder rows (up to row 50)
      const startClearRow = 6 + rows.length;
      for (let rowNum = startClearRow; rowNum <= 50; rowNum++) {
        const excelRow = worksheet.getRow(rowNum);
        const cellCount = excelRow.cellCount || 0;
        if (excelRow.hasValues) {
          for (let cIdx = 0; cIdx < Math.max(10, cellCount); cIdx++) {
            excelRow.getCell(1 + cIdx).value = null;
          }
          excelRow.commit();
        }
      }
      
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filename}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      return;
    } catch (err) {
      console.warn(`Failed to load Excel template at ${templatePath}. Falling back to default generation.`, err);
    }
  }

  const aoa = [columns, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = columns.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...rows.map(r => String(r[i] ?? '').length)
    );
    return { wch: Math.min(40, Math.max(10, maxLen + 2)) };
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
  XLSX.writeFile(book, `${filename}.xlsx`);
}

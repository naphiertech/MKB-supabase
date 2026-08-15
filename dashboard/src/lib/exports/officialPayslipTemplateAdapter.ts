import ExcelJS from 'exceljs';
import type { PayslipDocumentData } from './payrollExport';
import { buildExportFilename, downloadBlob, EXPORT_MIME_TYPES } from './exportUtils';

const OFFICIAL_PAYSLIP_TEMPLATE = '/files/MKB_PAYSLIP_Template.xlsx';

/**
 * Locked adapter for the official payslip workbook. Cell addresses, formulas,
 * merged ranges, and rate columns intentionally remain template-specific here.
 */
export async function exportOfficialPayslipXLSX(
  data: PayslipDocumentData,
  atmNumber = 'N/A',
): Promise<void> {
  try {
    const { rider, cutoff, snapshot, adjustments } = data;
    const exportDays = data.days.length > 0 ? data.days : [{
      date: cutoff.to,
      standardParcels: snapshot.standardParcels,
      heavyParcels: snapshot.heavyParcels,
      failedParcels: snapshot.failedParcels,
      returnedParcels: snapshot.returnedParcels,
      standardRate: 0,
      heavyRate: 0,
      standardEarnings: snapshot.standardEarnings,
      heavyEarnings: snapshot.heavyEarnings,
      grossDeliveryPay: snapshot.grossDeliveryPay,
      rateConfigurationId: null,
      calculationVersion: snapshot.calculationVersion,
    }];

    const response = await fetch(OFFICIAL_PAYSLIP_TEMPLATE);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error('Worksheet not found in template');

    worksheet.getCell('C4').value = rider.name;
    worksheet.getCell('C5').value = 'N/A';
    worksheet.getCell('C6').value = atmNumber || 'N/A';

    const totalDays = exportDays.length;
    const originalDaysCount = 7;
    const extraDays = totalDays - originalDaysCount;

    if (extraDays > 0) {
      const mergesToShift: { original: string; shifted: string }[] = [];
      const allMerges = [...(worksheet.model.merges || [])];

      allMerges.forEach((rangeStr) => {
        const parts = rangeStr.split(':');
        if (parts.length !== 2) return;
        const [startCell, endCell] = parts;
        const startMatch = startCell.match(/^([A-Z]+)(\d+)$/);
        if (!startMatch || parseInt(startMatch[2], 10) < 16) return;

        const shiftCell = (cell: string) => {
          const match = cell.match(/^([A-Z]+)(\d+)$/);
          if (!match) return cell;
          return `${match[1]}${parseInt(match[2], 10) + extraDays}`;
        };
        mergesToShift.push({
          original: rangeStr,
          shifted: `${shiftCell(startCell)}:${shiftCell(endCell)}`,
        });
      });

      mergesToShift.forEach(({ original }) => {
        try {
          worksheet.unMergeCells(original);
        } catch (error) {
          console.warn('Failed to unmerge cell range:', original, error);
        }
      });

      worksheet.insertRows(16, Array(extraDays).fill([]), 'down');
      const sourceRow = worksheet.getRow(15);
      for (let index = 0; index < extraDays; index++) {
        const targetRowNumber = 16 + index;
        const targetRow = worksheet.getRow(targetRowNumber);
        targetRow.height = sourceRow.height;
        sourceRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
          const targetCell = targetRow.getCell(columnNumber);
          targetCell.style = cell.style;
          const value = cell.value;
          if (value && typeof value === 'object' && 'formula' in value) {
            targetCell.value = {
              formula: String(value.formula).replace(/([A-Z]+)15/g, `$1${targetRowNumber}`),
            };
          } else {
            targetCell.value = value;
          }
        });
        targetRow.commit();
      }

      mergesToShift.forEach(({ shifted }) => {
        try {
          worksheet.mergeCells(shifted);
        } catch (error) {
          console.warn('Failed to merge cell range:', shifted, error);
        }
      });
    }

    const startDayRow = 9;
    const lastPopulatedDayRow = startDayRow + totalDays - 1;
    const lastDayRow = startDayRow + Math.max(totalDays, originalDaysCount) - 1;
    const subTotalRow = lastDayRow + 1;
    const otherEarningsRow = lastDayRow + 2;
    const fmPickUpRow = lastDayRow + 3;
    const deductionsRow = lastDayRow + 4;
    const lateOnholdRow = lastDayRow + 5;
    const lateRemittanceRow = lastDayRow + 6;
    const atmRow = lastDayRow + 7;
    const totalRow = lastDayRow + 8;

    worksheet.getCell('L6').value = { formula: `C${lastPopulatedDayRow}` };

    const rateColumns = {
      heavy: new Map([[17, 'D'], [16, 'H'], [15, 'L']]),
      standard: new Map([[12, 'F'], [11, 'J'], [10, 'N']]),
    };
    const rateForEntry = (declaredRate: number, earnings: number, quantity: number) => {
      if (Number.isFinite(declaredRate) && declaredRate > 0) return declaredRate;
      return quantity > 0 ? earnings / quantity : 0;
    };
    let representedGrossPay = 0;

    exportDays.forEach((entry, index) => {
      const rowNumber = startDayRow + index;
      worksheet.getCell(`C${rowNumber}`).value = new Date(entry.date);
      ['D', 'F', 'H', 'J', 'L', 'N'].forEach((column) => {
        worksheet.getCell(`${column}${rowNumber}`).value = 0;
      });

      const heavyRate = rateForEntry(entry.heavyRate, entry.heavyEarnings, entry.heavyParcels);
      const standardRate = rateForEntry(entry.standardRate, entry.standardEarnings, entry.standardParcels);
      const heavyColumn = rateColumns.heavy.get(heavyRate);
      const standardColumn = rateColumns.standard.get(standardRate);
      if (entry.heavyParcels > 0 && !heavyColumn) {
        throw new Error(`Cannot export official payslip: unsupported snapshotted heavy rate ${heavyRate} for ${entry.date}.`);
      }
      if (entry.standardParcels > 0 && !standardColumn) {
        throw new Error(`Cannot export official payslip: unsupported snapshotted standard rate ${standardRate} for ${entry.date}.`);
      }
      if (heavyColumn) worksheet.getCell(`${heavyColumn}${rowNumber}`).value = entry.heavyParcels;
      if (standardColumn) worksheet.getCell(`${standardColumn}${rowNumber}`).value = entry.standardParcels;
      representedGrossPay += entry.heavyParcels * heavyRate + entry.standardParcels * standardRate;
    });

    if (Math.abs(representedGrossPay - snapshot.grossDeliveryPay) > 0.01) {
      throw new Error('Cannot export official payslip: snapshotted daily rates do not reconcile to the payroll gross pay.');
    }

    for (const column of ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']) {
      worksheet.getCell(`${column}${subTotalRow}`).value = {
        formula: `SUM(${column}${startDayRow}:${column}${lastDayRow})`,
      };
    }

    worksheet.getCell(`D${otherEarningsRow}`).value = adjustments.otherEarnings / 5;
    worksheet.getCell(`C${fmPickUpRow}`).value = adjustments.fmPickupCount;
    worksheet.getCell(`N${deductionsRow}`).value = adjustments.deductions;
    worksheet.getCell(`C${lateOnholdRow}`).value = adjustments.lateOnhold;
    worksheet.getCell(`C${lateRemittanceRow}`).value = adjustments.lateRemittance;
    worksheet.getCell(`N${otherEarningsRow}`).value = { formula: `D${otherEarningsRow}*5` };
    worksheet.getCell(`N${fmPickUpRow}`).value = { formula: `C${fmPickUpRow}*3` };
    worksheet.getCell(`N${lateOnholdRow}`).value = {
      formula: `C${lateOnholdRow}+C${lateRemittanceRow}+K${lateOnholdRow}+K${lateRemittanceRow}`,
    };
    worksheet.getCell(`N${totalRow}`).value = {
      formula: `SUM(D${subTotalRow}:N${fmPickUpRow})-SUM(N${deductionsRow}:P${atmRow})`,
      result: data.totals.netPay,
    };

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(
      new Blob([buffer], { type: EXPORT_MIME_TYPES.xlsx }),
      buildExportFilename({
        prefix: 'payslip',
        identifier: rider.mkbId,
        from: cutoff.from,
        to: cutoff.to,
        extension: 'xlsx',
      }),
    );
  } catch (error) {
    console.error('Failed to export Excel payslip using template:', error);
    throw error;
  }
}

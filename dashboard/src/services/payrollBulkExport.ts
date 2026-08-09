import { getPayrollDeliveryData, type PayrollSnapshotRecordLike } from './parcelService';
import type { CutoffSummaryRow } from '../lib/exports/payrollExport';

export interface BulkExportPayrollRecord extends PayrollSnapshotRecordLike {
  riders: { name: string; zones: { name: string } | null } | null;
}

export async function buildBulkPayrollExportRows(
  records: BulkExportPayrollRecord[],
  selectedRecordIds: ReadonlySet<string>
): Promise<CutoffSummaryRow[]> {
  const selected = records.filter((record) => selectedRecordIds.has(record.id));
  return Promise.all(selected.map(async (record) => {
    const delivery = await getPayrollDeliveryData(record);
    return {
      riderName: record.riders?.name ?? 'Unknown Rider',
      zone: record.riders?.zones?.name ?? 'Unassigned',
      totalParcels: delivery.summary.delivered,
      standardParcels: delivery.summary.standardDelivered,
      heavyParcels: delivery.summary.heavyDelivered,
      failedParcels: delivery.summary.failed,
      returnedParcels: delivery.summary.returned,
      standardEarnings: delivery.summary.standardEarnings,
      heavyEarnings: delivery.summary.heavyEarnings,
      grossPay: delivery.summary.grossDeliveryPay,
      calculationVersion: delivery.calculationVersion,
    };
  }));
}

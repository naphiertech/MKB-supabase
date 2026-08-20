import { useState, useEffect, useMemo, ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarRange,
  Receipt,
  Layers,
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
  Users,
  Package,
  CheckCircle2,
  Building2,
  Calendar
} from 'lucide-react';
import { useHub } from '../context/HubContext';
import { getZones } from '../services/geofenceService';
import { getAllRiders } from '../services/monitoringService';
import type { Rider, Zone } from '../services/types';
import {
  getPayrollDeliveryData,
  getParcelLogsSummary,
  getPayrollRecordsSummary,
  getParcelLogsDetails,
  getPayrollRecords,
  getArchivedPayrollCutoffsSummary,
  type ArchivedPayrollCutoff
} from '../services/parcelService';
import {
  buildPayslipDocumentData,
  exportCutoffSummaryCSV,
  exportCutoffSummaryPDF,
  exportCutoffSummaryXLSX,
  payslipAdjustmentsFromRecord,
  parcelLogsToPayslipDays,
  type PayslipDocumentData,
  type PayslipSnapshotContext,
} from '../lib/exports/payrollExport';
import { isReadOnlyStatus } from '../types/payroll';
import { pushToast } from '../hooks/useToast';
import { exportXLSXFile } from '../lib/exports/excelHelper';
import { buildExportFilename, downloadCsv } from '../lib/exports/exportUtils';
import { downloadPayslipPackage } from '../lib/exports/bulkPayslipExport';
import { useExportJob } from '../hooks/useExportJob';

type PayrollTemplate = 'cutoff_summary' | 'individual_payslips' | 'parcel_logs';
type PayrollFormat = 'pdf' | 'csv' | 'xlsx';

const TEMPLATES: {
  key: PayrollTemplate;
  title: string;
  description: string;
  meta: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    key: 'cutoff_summary',
    title: 'Cutoff Summary',
    description: 'All riders with gross pay totals for the selected cutoff period.',
    meta: 'PDF · CSV · XLSX',
    icon: CalendarRange,
  },
  {
    key: 'individual_payslips',
    title: 'Individual Payslips',
    description: 'Generate a payslip per rider — single rider or bulk export for all riders.',
    meta: 'PDF · Official XLSX',
    icon: Receipt,
  },
  {
    key: 'parcel_logs',
    title: 'Parcel Log',
    description: 'Raw daily parcel logs export by rider and date for the selected range.',
    meta: 'CSV · XLSX',
    icon: Layers,
  }
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function friendlyExportError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/unsupported snapshotted .* rate|do not reconcile/i.test(message)) {
    return 'An official XLSX could not be created because a finalized rate snapshot is unsupported or does not reconcile. Review the affected payroll record.';
  }
  if (/worksheet not found|http error|template/i.test(message)) {
    return 'The official payslip template could not be loaded. Try again or contact an administrator.';
  }
  if (/zip/i.test(message)) return 'The ZIP package could not be created. No bulk download was completed.';
  if (/no payslips/i.test(message)) return message;
  return 'The export could not be completed. Please try again.';
}

export function PayrollReports() {
  const { selectedHubId, selectedHub, isReady: hubReady, workspaceKey } = useHub();

  const [ridersList, setRidersList] = useState<Rider[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [singleRiderId, setSingleRiderId] = useState<string>('');
  const [template, setTemplate] = useState<PayrollTemplate>('cutoff_summary');
  const [format, setFormat] = useState<PayrollFormat>('pdf');
  const [from, setFrom] = useState(isoOffset(14));
  const [to, setTo] = useState(isoToday());
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<'single' | 'bulk'>('bulk');
  const exportJob = useExportJob();
  const isGenerating = exportJob.running;
  const [error, setError] = useState<string | null>(null);

  interface ExportLog {
    filename: string;
    format: string;
    time: string;
  }
  const [exportHistory, setExportHistory] = useState<ExportLog[]>([]);

  // Real historical archives from Supabase
  const [archives, setArchives] = useState<ArchivedPayrollCutoff[]>([]);
  const [loadingArchives, setLoadingArchives] = useState(false);

  // Load Riders, Zones & Archives respecting Hub scope
  useEffect(() => {
    if (!hubReady) return;
    let active = true;

    const loadScopeData = async () => {
      try {
        const [r, z] = await Promise.all([
          getAllRiders({ scope: 'historical' }),
          getZones()
        ]);
        if (active) {
          setRidersList(r);
          setZonesList(z);
          if (r.length > 0) {
            setSingleRiderId(r[0].id);
          } else {
            setSingleRiderId('');
          }
        }
      } catch (err) {
        console.error('Error loading riders and zones in PayrollReports:', err);
      }
    };

    loadScopeData();
    return () => {
      active = false;
    };
  }, [hubReady, workspaceKey, selectedHubId]);

  // Load real historical payroll archives from Supabase
  useEffect(() => {
    if (!hubReady) return;
    let active = true;
    setLoadingArchives(true);

    getArchivedPayrollCutoffsSummary(selectedHubId)
      .then(data => {
        if (active) setArchives(data);
      })
      .catch(err => {
        console.error('Error fetching archived payroll cutoffs:', err);
        if (active) setArchives([]);
      })
      .finally(() => {
        if (active) setLoadingArchives(false);
      });

    return () => {
      active = false;
    };
  }, [hubReady, workspaceKey, selectedHubId]);

  interface ParcelLogRow {
    parcels: number;
    heavy_parcels: number;
    failed_parcels: number;
    returned_parcels: number;
    standard_earnings: number;
    heavy_earnings: number;
    daily_gross: number;
    date: string;
    rider_id: string;
    riders: {
      id: string;
      name: string;
      zone_id: string;
    } | null;
  }
  interface FinalizedRecordRow {
    rider_id: string;
    status: string;
  }
  const [cutoffLogs, setCutoffLogs] = useState<ParcelLogRow[]>([]);
  const [finalizedRecords, setFinalizedRecords] = useState<FinalizedRecordRow[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // Fetch live cutoff logs for the summary card and bar chart
  useEffect(() => {
    if (!from || !to || !hubReady) return;
    let active = true;

    const fetchSummaryData = async () => {
      setLoadingSummary(true);
      try {
        const data = await getParcelLogsSummary(from, to);

        if (active && data) {
          setCutoffLogs(data as unknown as ParcelLogRow[]);
        }
      } catch (err) {
        console.error('Error fetching cutoff summary logs:', err);
      } finally {
        if (active) setLoadingSummary(false);
      }
    };

    fetchSummaryData();
    return () => {
      active = false;
    };
  }, [from, to, hubReady, workspaceKey, selectedHubId]);

  // Fetch finalized records to calculate processed vs pending verification counts
  useEffect(() => {
    if (!from || !to || !hubReady) return;
    let active = true;

    const fetchFinalized = async () => {
      try {
        const data = await getPayrollRecordsSummary(from, to);

        if (active && data) {
          setFinalizedRecords(data);
        }
      } catch (err) {
        console.error('Error fetching finalized payroll records:', err);
      }
    };

    fetchFinalized();
    return () => {
      active = false;
    };
  }, [from, to, hubReady, workspaceKey, selectedHubId]);

  // Deterministic cutoff summary derived from the selected records.
  const authorizedRiderIds = useMemo(() => new Set(ridersList.map(r => r.id)), [ridersList]);

  const filteredLogs = useMemo(() => {
    return cutoffLogs.filter(log => {
      // Must be authorized in current hub scope
      if (!authorizedRiderIds.has(log.rider_id)) return false;
      // Filter by selected zones if specified
      if (selectedZones.length > 0) {
        return log.riders?.zone_id && selectedZones.includes(log.riders.zone_id);
      }
      return true;
    });
  }, [cutoffLogs, authorizedRiderIds, selectedZones]);

  const totalStandardParcels = filteredLogs.reduce((sum, log) => sum + Number(log.parcels || 0), 0);
  const totalHeavyParcels = filteredLogs.reduce((sum, log) => sum + Number(log.heavy_parcels || 0), 0);
  const totalParcels = totalStandardParcels + totalHeavyParcels;
  const totalGross = filteredLogs.reduce((sum, log) => sum + (log.daily_gross || 0), 0);
  const distinctRiders = new Set(filteredLogs.map(log => log.rider_id));
  const totalRiders = distinctRiders.size;

  const activeRidersCount = selectedZones.length === 0
    ? ridersList.length
    : ridersList.filter(r => r.zoneId && selectedZones.includes(r.zoneId)).length;

  const processedCount = finalizedRecords.filter(rec => {
    if (!authorizedRiderIds.has(rec.rider_id)) return false;
    if (selectedZones.length > 0) {
      const rider = ridersList.find(r => r.id === rec.rider_id);
      return rider?.zoneId && selectedZones.includes(rider.zoneId);
    }
    return true;
  }).length;
  
  const pendingCount = Math.max(0, activeRidersCount - processedCount);

  // Group logs by rider for the chart
  const riderParcelsMap: Record<string, { name: string; parcels: number }> = {};
  
  const listRidersForChart = selectedZones.length === 0
    ? ridersList
    : ridersList.filter(r => r.zoneId && selectedZones.includes(r.zoneId));

  listRidersForChart.forEach(r => {
    riderParcelsMap[r.id] = { name: r.name, parcels: 0 };
  });

  filteredLogs.forEach(log => {
    if (riderParcelsMap[log.rider_id]) {
      riderParcelsMap[log.rider_id].parcels += Number(log.parcels || 0) + Number(log.heavy_parcels || 0);
    }
  });

  const chartData = Object.values(riderParcelsMap).sort((a, b) => b.parcels - a.parcels).slice(0, 5);
  const maxParcels = Math.max(...chartData.map(d => d.parcels), 1);
  const chartActiveRiders = chartData.filter(d => d.parcels > 0).length;
  const chartLeader = chartData[0] ?? null;

  const toggleZone = (id: string) => {
    setSelectedZones(prev =>
      prev.includes(id) ? prev.filter(z => z !== id) : [...prev, id]
    );
  };

  const filteredRiders = () => {
    return selectedZones.length === 0
      ? ridersList
      : ridersList.filter(r => r.zoneId && selectedZones.includes(r.zoneId));
  };

  const handleGenerate = async () => {
    if (!from || !to || to < from) {
      setError('Please select a valid date range');
      return;
    }
    setError(null);
    try {
      await exportJob.run('Preparing export…', async setProgress => {
        const cutoffLabel = `${from} to ${to}`;
        const targetRiders = filteredRiders();
        let completedExport: ExportLog | null = null;

        if (template !== 'cutoff_summary' && targetRiders.length === 0) {
          pushToast({ title: 'No Riders match the selected filters', tone: 'warning' });
          return;
        }

        if (template === 'cutoff_summary') {
          setProgress('Loading finalized payroll snapshots…');
          const records = await getPayrollRecords(from, to);
          const finalizedRecords = records.filter(r => isReadOnlyStatus(r.status));
          const filteredRecords = finalizedRecords.filter(r => {
            if (!authorizedRiderIds.has(r.rider_id)) return false;
            if (selectedZones.length > 0) {
              return r.riders?.zone_id && selectedZones.includes(r.riders.zone_id);
            }
            return true;
          });

          if (filteredRecords.length === 0) {
            pushToast({
              title: 'No finalized records found',
              description: 'No finalized payroll entries in Supabase for this range and scope.',
              tone: 'info'
            });
            return;
          }

          const recordsWithDelivery = await Promise.all(filteredRecords.map(async record => ({
            record,
            delivery: await getPayrollDeliveryData(record),
          })));
          const rows = recordsWithDelivery.map(({ record: r, delivery }) => {
            const zName = r.riders?.zones?.name || '—';
            const computedGross = Number(r.gross_pay ?? 0);
            return {
              riderName: r.riders?.name || 'Unknown Rider',
              riderId: r.riders?.mkb_id || '—',
              zone: zName,
              totalParcels: r.total_parcels,
              standardParcels: delivery.summary.standardDelivered,
              heavyParcels: delivery.summary.heavyDelivered,
              failedParcels: delivery.summary.failed,
              returnedParcels: delivery.summary.returned,
              standardEarnings: delivery.summary.standardEarnings,
              heavyEarnings: delivery.summary.heavyEarnings,
              calculationVersion: delivery.calculationVersion,
              flagged: r.status === 'flagged' ? 'YES' : 'NO',
              grossPay: computedGross
            };
          });

          if (format === 'csv') {
            setProgress('Generating CSV cutoff summary…');
            exportCutoffSummaryCSV(
              rows.map(r => ({
                riderName: r.riderName,
                zone: r.zone,
                totalParcels: r.totalParcels,
                standardParcels: r.standardParcels,
                heavyParcels: r.heavyParcels,
                failedParcels: r.failedParcels,
                returnedParcels: r.returnedParcels,
                standardEarnings: r.standardEarnings,
                heavyEarnings: r.heavyEarnings,
                calculationVersion: r.calculationVersion,
                grossPay: r.grossPay
              })),
              { label: cutoffLabel, from, to }
            );
          } else if (format === 'xlsx') {
            setProgress('Generating XLSX cutoff summary…');
            await exportCutoffSummaryXLSX(rows, { label: cutoffLabel, from, to });
          } else {
            setProgress('Generating PDF cutoff summary…');
            exportCutoffSummaryPDF(rows, { label: cutoffLabel, from, to });
          }

          completedExport = {
            filename: buildExportFilename({ prefix: 'payroll_cutoff', from, to, extension: format }),
            format,
            time: 'Just now',
          };

          pushToast({
            title: 'Cutoff Summary exported',
            description: `${rows.length} records · ${format.toUpperCase()}`,
            tone: 'success'
          });

        } else if (template === 'individual_payslips') {
          const targets = bulkMode === 'single'
            ? targetRiders.filter(r => r.id === singleRiderId)
            : targetRiders;

          if (targets.length === 0) {
            pushToast({
              title: 'No Rider selected',
              tone: 'warning'
            });
            return;
          }

          setProgress('Loading finalized payroll snapshots…');
          const payrollRecords = (await getPayrollRecords(from, to)).filter(record => isReadOnlyStatus(record.status));
          const documents: PayslipDocumentData[] = [];
          const preparationFailures: Array<{ riderName: string; message: string }> = [];
          for (let index = 0; index < targets.length; index += 1) {
            const rider = targets[index];
            setProgress(`Preparing ${index + 1} of ${targets.length} payslips…`);
            const payrollRecord = payrollRecords.find(record => record.rider_id === rider.id);
            if (!payrollRecord) {
              preparationFailures.push({ riderName: rider.name, message: 'No finalized payroll snapshot found.' });
              continue;
            }
            try {
              const deliveryData = await getPayrollDeliveryData(payrollRecord);
              const snapshot: PayslipSnapshotContext = {
                source: deliveryData.source, calculationVersion: deliveryData.calculationVersion,
                standardParcels: deliveryData.summary.standardDelivered, heavyParcels: deliveryData.summary.heavyDelivered,
                failedParcels: deliveryData.summary.failed, returnedParcels: deliveryData.summary.returned,
                standardEarnings: deliveryData.summary.standardEarnings, heavyEarnings: deliveryData.summary.heavyEarnings,
                grossDeliveryPay: deliveryData.summary.grossDeliveryPay,
              };
              documents.push(buildPayslipDocumentData({
                riderName: rider.name,
                mkbId: rider.riderCode || 'MKB-RIDER',
                zoneName: zonesList.find(zone => zone.id === rider.zoneId)?.name || '—',
                cutoffFrom: from,
                cutoffTo: to,
                dayEntries: parcelLogsToPayslipDays(deliveryData.lines),
                snapshot,
                adjustments: payslipAdjustmentsFromRecord(payrollRecord),
              }));
            } catch (error) {
              preparationFailures.push({
                riderName: rider.name,
                message: error instanceof Error ? error.message : 'Payroll snapshot could not be loaded.',
              });
            }
          }

          if (documents.length === 0) {
            throw new Error(`No payslips could be generated. ${preparationFailures.map(failure => failure.riderName).join(', ')} have no usable finalized snapshot.`);
          }
          const packageResult = await downloadPayslipPackage(documents, {
            format: format === 'xlsx' ? 'xlsx' : 'pdf',
            from,
            to,
            forceArchive: targets.length > 1,
            onProgress: setProgress,
          });
          const failures = [...preparationFailures, ...packageResult.failures];
          completedExport = { filename: packageResult.filename, format: packageResult.archive ? 'zip' : format, time: 'Just now' };
          if (failures.length > 0) {
            pushToast({
              title: `${packageResult.generatedCount} payslip${packageResult.generatedCount === 1 ? '' : 's'} downloaded with ${failures.length} skipped`,
              description: failures.map(failure => failure.riderName).join(', '),
              tone: 'warning',
              duration: 6000,
            });
          } else {
            pushToast({
              title: packageResult.archive ? `${packageResult.generatedCount} payslips downloaded in one ZIP` : 'Payslip downloaded',
              description: `${format.toUpperCase()} · ${cutoffLabel}`,
              tone: 'success',
            });
          }

        } else if (template === 'parcel_logs') {
          setProgress('Loading parcel logs…');
          const filterOpts: { riderId?: string; riderIds?: string[] } = {};
          if (bulkMode === 'single' && singleRiderId) {
            filterOpts.riderId = singleRiderId;
          } else if (selectedZones.length > 0) {
            filterOpts.riderIds = targetRiders.map(r => r.id);
          } else {
            filterOpts.riderIds = Array.from(authorizedRiderIds);
          }

          const data = await getParcelLogsDetails(from, to, filterOpts);

          if (!data || data.length === 0) {
            pushToast({
              title: 'No raw logs found',
              description: 'No daily parcel entries exist for this cutoff and scope.',
              tone: 'info'
            });
            return;
          }

          const cols = ['Rider', 'Rider ID', 'Zone', 'Date', 'Standard', 'Heavy', 'Failed', 'Returned', 'Standard Rate', 'Heavy Rate', 'Standard Earnings', 'Heavy Earnings', 'Gross Delivery Pay', 'Rate Configuration'];
          const rows = data.map(log => [
            log.riders?.name || 'Unknown Rider',
            log.riders?.mkb_id || '—',
            log.riders?.zones?.name || '—',
            log.date,
            log.parcels,
            Number(log.heavy_parcels ?? 0),
            Number(log.failed_parcels ?? 0),
            Number(log.returned_parcels ?? 0),
            Number(log.rate),
            Number(log.heavy_rate),
            Number(log.standard_earnings),
            Number(log.heavy_earnings),
            Number(log.daily_gross),
            log.rate_configuration_id,
          ]);

          if (format === 'xlsx') {
            setProgress('Generating XLSX parcel log…');
            await exportXLSXFile(
              'Parcel Log',
              cols,
              rows,
              buildExportFilename({ prefix: 'parcel_logs', from, to, extension: 'xlsx' }).replace(/\.xlsx$/, '')
            );
          } else {
            setProgress('Generating CSV parcel log…');
            downloadCsv([cols, ...rows], buildExportFilename({
              prefix: 'parcel_logs', from, to, extension: 'csv',
            }));
          }

          const actualFormat = format === 'xlsx' ? 'xlsx' : 'csv';
          completedExport = {
            filename: buildExportFilename({ prefix: 'parcel_logs', from, to, extension: actualFormat }),
            format: actualFormat,
            time: 'Just now',
          };

          pushToast({
            title: 'Parcel Logs exported',
            description: `${rows.length} entries · ${actualFormat.toUpperCase()}`,
            tone: 'success'
          });
        }

        if (completedExport) setExportHistory(previous => [completedExport!, ...previous]);
      });
    } catch (err) {
      console.error(err);
      pushToast({
        title: 'Export failed',
        description: friendlyExportError(err),
        tone: 'error'
      });
    }
  };

  const scopeLabel = selectedHub ? selectedHub.name : 'All authorized Hubs';
  const selectedTemplate = TEMPLATES.find(t => t.key === template);

  return (
    <div className="dashboard-page space-y-5">
      {/* Scope Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-panel-bg px-3 py-2 text-[11px] text-muted-foreground shadow-2xs">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-primary" />
          <span><strong className="text-foreground">Scope:</strong> {scopeLabel}</span>
        </div>
        <div className="flex items-center gap-1.5 font-mono">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span><strong className="text-foreground">Selected Range:</strong> {from} to {to}</span>
        </div>
      </div>

      {/* Main Content Grid: Left Column is Inputs Panel, Right Column is Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          {/* Inputs Panel with Compact Report-Type Selector */}
          <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
            {/* Modern Compact Report-Type Selector (Matching Admin Reports) */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                {TEMPLATES.map(t => {
                  const Icon = t.icon;
                  const active = template === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setTemplate(t.key);
                        if (t.key === 'cutoff_summary') setFormat('pdf');
                        if (t.key === 'individual_payslips') setFormat('pdf');
                        if (t.key === 'parcel_logs') setFormat('csv');
                      }}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? 'bg-primary text-white shadow-2xs'
                          : 'border border-border bg-panel-bg text-muted-foreground hover:bg-white hover:text-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t.title}</span>
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-mono text-muted-foreground hidden sm:inline-block">
                {selectedTemplate?.meta}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <div className="w-7 h-7 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {selectedTemplate?.title}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">{selectedTemplate?.description}</div>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              {/* Range */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">From</div>
                  <input
                    type="date"
                    value={from}
                    onChange={e => {
                      setFrom(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs text-foreground font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">To</div>
                  <input
                    type="date"
                    value={to}
                    onChange={e => {
                      setTo(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full h-9 px-3 rounded-lg bg-panel-bg border border-border text-xs text-foreground font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-1.5 text-[12px] text-red-600">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Rates come from immutable payroll snapshots. */}
              {template === 'individual_payslips' && (
                <div className="rounded-lg border border-border bg-panel-bg px-3 py-2 text-xs text-muted-foreground">
                  Parcel counts and rates are read-only and come from finalized payroll snapshots.
                </div>
              )}

              {/* Zones Selector */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">
                  Filter Zones {selectedZones.length === 0 && '(all)'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {zonesList.map(z => {
                    const on = selectedZones.includes(z.id);
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() => toggleZone(z.id)}
                        className={`px-2.5 py-1 rounded text-[11px] border transition cursor-pointer ${
                          on
                            ? 'bg-accent border-primary/40 text-accent-foreground font-semibold'
                            : 'bg-panel-bg border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {z.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Mode Selector for Individual Payslips & Logs */}
              {template !== 'cutoff_summary' && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">Mode</div>
                  <div className="inline-flex rounded-md border border-border bg-panel-bg p-0.5 mb-3">
                    <button
                      type="button"
                      onClick={() => setBulkMode('single')}
                      className={`h-7 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                        bulkMode === 'single' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Single rider
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkMode('bulk')}
                      className={`h-7 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 cursor-pointer ${
                        bulkMode === 'bulk' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      All riders ({filteredRiders().length})
                    </button>
                  </div>

                  {bulkMode === 'single' && (
                    <select
                      value={singleRiderId}
                      onChange={e => setSingleRiderId(e.target.value)}
                      className="w-full h-9 px-3 pr-8 rounded-lg bg-panel-bg border border-border text-xs text-foreground font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer"
                    >
                      {filteredRiders().map(r => (
                        <option key={r.id} value={r.id}>
                          {r.name} · {r.riderCode}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Formats Selector */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-1.5 font-semibold">Format</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['pdf', 'csv', 'xlsx'] as const).map(f => {
                    const disabled =
                      (template === 'individual_payslips' && f === 'csv') ||
                      (template === 'parcel_logs' && f === 'pdf');
                    const selected = format === f;
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => !disabled && setFormat(f)}
                        disabled={disabled}
                        className={`h-8 rounded-md border text-xs uppercase transition cursor-pointer ${
                          selected && !disabled
                            ? 'bg-accent border-primary text-accent-foreground font-bold'
                            : disabled
                            ? 'bg-panel-bg border-border text-muted-foreground/30 cursor-not-allowed'
                            : 'bg-panel-bg border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full h-10 rounded-lg bg-primary hover:bg-primary-hover text-white text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-xs disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{exportJob.message ?? 'Generating export…'}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Generate Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div>
          {/* Deterministic Payroll Summary Card */}
          <div className="bg-white border border-border rounded-xl p-5 flex flex-col justify-between h-full shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">Payroll Snapshot Summary</div>
                  <div className="text-[11px] text-muted-foreground font-mono">Calculated from authorized cutoff records</div>
                </div>
              </div>

              {loadingSummary ? (
                <div className="space-y-3 py-4 animate-pulse">
                  <div className="h-4 bg-panel-bg rounded w-full" />
                  <div className="h-4 bg-panel-bg rounded w-5/6" />
                  <div className="h-4 bg-panel-bg rounded w-2/3" />
                </div>
              ) : (
                <div className="text-xs text-muted-foreground leading-relaxed space-y-4">
                  <p>
                    This cutoff has <span className="font-semibold text-foreground">{totalRiders} active rider{totalRiders === 1 ? '' : 's'}</span> who delivered a total of{' '}
                    <span className="font-semibold text-foreground">{totalParcels.toLocaleString()} parcels</span> ({totalStandardParcels.toLocaleString()} standard, {totalHeavyParcels.toLocaleString()} heavy).
                  </p>
                  <p>
                    Total gross payroll calculated at <span className="font-semibold text-primary">₱{totalGross.toLocaleString()}</span>.{' '}
                    {pendingCount > 0 ? (
                      <span>{pendingCount} rider{pendingCount > 1 ? 's are' : ' is'} pending supervisor verification. </span>
                    ) : (
                      <span>All riders verified. </span>
                    )}
                    <span className="text-emerald-600 font-medium">{processedCount} processed.</span>
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <div className="bg-panel-bg border border-border rounded-lg p-3 text-center">
                <div className="text-[20px] font-bold text-foreground font-mono">
                  {loadingSummary ? '...' : totalParcels.toLocaleString()}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mt-0.5">Parcels</div>
              </div>
              <div className="bg-accent/50 border border-primary/25 rounded-lg p-3 text-center">
                <div className="text-[20px] font-bold text-primary font-mono">
                  {loadingSummary ? '...' : `₱${totalGross.toLocaleString()}`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-primary font-semibold mt-0.5">Gross</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Chart Row */}
      <div className="w-full">
        {/* Parcels Delivered per Rider Chart */}
        <div className="rounded-xl border border-border bg-white p-4 shadow-xs sm:p-5">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent ring-1 ring-primary/30">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">Parcels Delivered per Rider</div>
                <div className="font-mono text-[11px] text-muted-foreground">Visual comparison for this cutoff</div>
              </div>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-panel-bg px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              Top {chartData.length} · sorted by volume
            </div>
          </div>

          {loadingSummary ? (
            <div className="space-y-4 rounded-xl border border-border bg-panel-bg/40 p-4 animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="h-3 w-32 rounded bg-border/70" />
                  <div className="h-8 rounded-lg bg-border/50" style={{ width: `${92 - i * 11}%` }} />
                </div>
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-panel-bg/30 px-5 text-center">
              <Package className="h-7 w-7 text-subtle-text" />
              <div className="text-xs font-semibold text-foreground">No parcel activity to compare</div>
              <div className="max-w-sm text-[11px] text-muted-foreground">Adjust the cutoff dates or zone filters to include rider delivery records.</div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-border bg-panel-bg/30">
                <div className="hidden grid-cols-[12rem_minmax(0,1fr)_5rem] items-end gap-4 border-b border-border bg-white/70 px-4 py-2.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground lg:grid">
                  <span>Rider</span>
                  <div className="flex justify-between font-mono font-medium normal-case tracking-normal">
                    <span>0</span><span>25%</span><span>50%</span><span>75%</span><span>{maxParcels}</span>
                  </div>
                  <span className="text-right">Parcels</span>
                </div>

                <div className="divide-y divide-border/80" role="list" aria-label="Rider parcel delivery comparison">
                  {chartData.map((d, index) => {
                    const widthPercent = d.parcels > 0 ? (d.parcels / maxParcels) * 100 : 0;
                    const isLeader = index === 0 && d.parcels > 0;

                    return (
                      <div
                        key={`${d.name}-${index}`}
                        role="listitem"
                        className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-3 py-3 transition-colors sm:px-4 lg:grid-cols-[12rem_minmax(0,1fr)_5rem] lg:items-center lg:gap-4 ${isLeader ? 'bg-accent/35' : 'bg-white/50 hover:bg-white'}`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-bold ${isLeader ? 'border-primary/30 bg-primary text-white' : 'border-border bg-white text-muted-foreground'}`}>
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-semibold text-foreground" title={d.name}>{d.name}</div>
                            <div className={`mt-0.5 text-[9px] font-bold uppercase tracking-wider ${d.parcels > 0 ? 'text-primary' : 'text-subtle-text'}`}>
                              {isLeader ? 'Volume leader' : d.parcels > 0 ? `${Math.round(widthPercent)}% of leader` : 'No parcels recorded'}
                            </div>
                          </div>
                        </div>

                        <div
                          role="meter"
                          aria-label={`${d.name}: ${d.parcels} parcels delivered`}
                          aria-valuemin={0}
                          aria-valuemax={maxParcels}
                          aria-valuenow={d.parcels}
                          className="order-3 col-span-2 relative h-8 overflow-hidden rounded-lg border border-border bg-white shadow-inner lg:order-none lg:col-span-1"
                        >
                          <div className="pointer-events-none absolute inset-0 grid grid-cols-4 divide-x divide-border/60" aria-hidden="true">
                            <span /><span /><span /><span />
                          </div>
                          {d.parcels > 0 ? (
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${widthPercent}%` }}
                              transition={{ duration: 0.7, ease: [0.23, 1, 0.32, 1], delay: index * 0.06 }}
                              className={`relative h-full min-w-2 rounded-r-md bg-primary ${isLeader ? '' : 'opacity-60'}`}
                            >
                              <span className="absolute inset-y-0 right-0 w-px bg-white/60" />
                            </motion.div>
                          ) : (
                            <span className="absolute left-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-border bg-panel-bg" aria-hidden="true" />
                          )}
                        </div>

                        <div className="text-right">
                          <div className={`font-mono text-base font-black tabular-nums ${isLeader ? 'text-primary' : 'text-foreground'}`}>{d.parcels.toLocaleString()}</div>
                          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">pcs</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="col-span-2 rounded-lg border border-primary/20 bg-accent/40 p-3 sm:col-span-1">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">Highest volume</div>
                  <div className="mt-1 truncate text-xs font-bold text-foreground" title={chartLeader?.name}>{chartLeader?.name || 'No rider'}</div>
                </div>
                <div className="rounded-lg border border-border bg-panel-bg/50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Leader output</div>
                  <div className="mt-1 font-mono text-sm font-black text-foreground">{chartLeader?.parcels.toLocaleString() || 0} <span className="text-[9px] font-semibold text-muted-foreground">PCS</span></div>
                </div>
                <div className="rounded-lg border border-border bg-panel-bg/50 p-3">
                  <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Riders with output</div>
                  <div className="mt-1 font-mono text-sm font-black text-foreground">{chartActiveRiders}<span className="text-muted-foreground">/{chartData.length}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Sections: Real History & Archives from Supabase, and Export History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Real Previous Cutoffs & Payroll History */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
              <CalendarRange className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Payroll History & Archives</div>
              <div className="text-[11px] text-muted-foreground font-mono">Real historical cutoff records in Supabase</div>
            </div>
          </div>

          <div className="table-scroll-region" role="region" aria-label="Payroll report history" tabIndex={0}>
            {loadingArchives ? (
              <div className="space-y-2 py-4 animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 bg-panel-bg rounded w-full" />
                ))}
              </div>
            ) : archives.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground italic border border-dashed border-border rounded-lg">
                No historical payroll cutoffs found.
              </div>
            ) : (
              <table className="data-table w-full text-xs">
                <thead className="bg-panel-bg border-b border-border text-[10px] uppercase font-bold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-right">Riders</th>
                    <th className="px-3 py-2 text-right">Gross Total</th>
                    <th className="px-3 py-2 text-center">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {archives.map((item, idx) => {
                    const statusTone =
                      item.status === 'paid'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : item.status === 'approved'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : item.status === 'submitted'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : item.status === 'rejected'
                        ? 'bg-red-50 text-red-700 border-red-200'
                        : item.status === 'mixed'
                        ? 'bg-purple-50 text-purple-700 border-purple-200'
                        : 'bg-gray-50 text-gray-600 border-gray-200';

                    return (
                      <tr key={`${item.cutoffStart}_${idx}`} className="border-b border-border hover:bg-panel-bg transition-colors">
                        <td className="px-3 py-2.5 font-semibold text-foreground">{item.label}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{item.riderCount}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">₱{item.totalGross.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border ${statusTone}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setFrom(item.cutoffStart);
                              setTo(item.cutoffEnd);
                              pushToast({
                                title: 'Cutoff Loaded',
                                description: `${item.label} (${item.riderCount} riders · ₱${item.totalGross.toLocaleString()}) loaded into generator.`,
                                tone: 'success'
                              });
                            }}
                            className="px-2.5 py-1 text-[10px] font-bold text-accent-foreground hover:text-white bg-accent hover:bg-primary rounded transition cursor-pointer"
                          >
                            Load
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Generated Reports & Export History (Session Only) */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Export & Download History</div>
              <div className="text-[11px] text-muted-foreground font-mono">Recent reports exported during this session</div>
            </div>
          </div>

          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            {exportHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground italic border border-dashed border-border rounded-lg">
                No exports run in this session yet. Generate a report above.
              </div>
            ) : (
              exportHistory.map((hist, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-panel-bg/50 hover:bg-panel-bg transition">
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="text-xs font-semibold text-foreground truncate">{hist.filename}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span className="uppercase font-semibold font-mono text-primary">{hist.format}</span>
                      <span>&bull;</span>
                      <span>{hist.time}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                    Success
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

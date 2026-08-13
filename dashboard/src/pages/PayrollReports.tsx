import { useState, useEffect, ComponentType } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarRange,
  Receipt,
  Layers,
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
  ArrowUpRight,
  Users,
  Package
} from 'lucide-react';
import { getZones } from '../services/geofenceService';
import { getAllRiders } from '../services/monitoringService';
import type { Rider, Zone } from '../services/types';
import {
  getPayrollDeliveryData,
  getParcelLogsSummary,
  getPayrollRecordsSummary,
  getParcelLogsDetails,
  getPayrollRecords
} from '../services/parcelService';
import {
  exportParcelPayslipPDF,
  exportParcelCSV,
  exportCutoffSummaryCSV,
  parcelLogsToPayslipDays,
  type PayslipSnapshotContext,
} from '../lib/exports/payrollExport';
import { isReadOnlyStatus } from '../types/payroll';
import { pushToast } from '../hooks/useToast';
import { exportXLSXFile } from '../lib/exports/excelHelper';
import autoTable from 'jspdf-autotable';

type PayrollTemplate = 'cutoff_summary' | 'individual_payslips' | 'parcel_logs';
type PayrollFormat = 'pdf' | 'csv' | 'xlsx';

const TEMPLATES: {
  key: PayrollTemplate;
  title: string;
  description: string;
  meta: string;
  icon: ComponentType<{ className?: string }>;
  accent: string;
}[] = [
  {
    key: 'cutoff_summary',
    title: 'Cutoff Summary',
    description: 'All riders with gross pay totals for the selected cutoff period.',
    meta: 'Per-cutoff · PDF/CSV/XLSX',
    icon: CalendarRange,
    accent: '#db6c00'
  },
  {
    key: 'individual_payslips',
    title: 'Individual Payslips',
    description: 'Generate a payslip per rider — single rider or bulk export for all riders.',
    meta: 'Per-rider · PDF/CSV',
    icon: Receipt,
    accent: '#b85a00'
  },
  {
    key: 'parcel_logs',
    title: 'Parcel Log',
    description: 'Raw daily parcel logs export by rider and date for the selected range.',
    meta: 'Raw data · CSV/XLSX',
    icon: Layers,
    accent: '#db6c00'
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(cell: string | number | null | undefined): string {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function PayrollReports() {
  const [ridersList, setRidersList] = useState<Rider[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [singleRiderId, setSingleRiderId] = useState<string>('');
  const [template, setTemplate] = useState<PayrollTemplate>('cutoff_summary');
  const [format, setFormat] = useState<PayrollFormat>('pdf');
  const [from, setFrom] = useState(isoOffset(14));
  const [to, setTo] = useState(isoToday());
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<'single' | 'bulk'>('bulk');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  interface ExportLog {
    filename: string;
    format: string;
    time: string;
  }
  const [exportHistory, setExportHistory] = useState<ExportLog[]>([
    { filename: 'mkbridertrack_cutoff_summary_2026-06-16_2026-06-30.xlsx', format: 'xlsx', time: 'Yesterday at 3:15 PM' },
    { filename: 'mkbridertrack_individual_payslips_2026-06-16_2026-06-30.pdf', format: 'pdf', time: 'Yesterday at 3:10 PM' },
    { filename: 'mkbridertrack_parcel_log_2026-06-16_2026-06-30.csv', format: 'csv', time: 'Yesterday at 3:08 PM' },
  ]);

  useEffect(() => {
    Promise.all([getAllRiders({ scope: 'historical' }), getZones()]).then(([r, z]) => {
      setRidersList(r);
      setZonesList(z);
      if (r.length > 0) {
        setSingleRiderId(r[0].id);
      }
    });
  }, []);

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
    if (!from || !to) return;
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
  }, [from, to]);

  // Fetch finalized records to calculate processed vs pending verification counts
  useEffect(() => {
    if (!from || !to) return;
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
  }, [from, to]);

  // Stats for the AI Payroll Summary card
  const filteredLogs = selectedZones.length === 0
    ? cutoffLogs
    : cutoffLogs.filter(log => log.riders?.zone_id && selectedZones.includes(log.riders.zone_id));

  const totalStandardParcels = filteredLogs.reduce((sum, log) => sum + Number(log.parcels || 0), 0);
  const totalHeavyParcels = filteredLogs.reduce((sum, log) => sum + Number(log.heavy_parcels || 0), 0);
  const totalParcels = totalStandardParcels + totalHeavyParcels;
  const totalGross = filteredLogs.reduce((sum, log) => sum + (log.daily_gross || 0), 0);
  const distinctRiders = new Set(filteredLogs.map(log => log.rider_id));
  const totalRiders = distinctRiders.size;

  const flaggedRiders = new Set(
    filteredLogs.filter(log => Number(log.parcels || 0) + Number(log.heavy_parcels || 0) > 100).map(log => log.rider_id)
  ).size;

  const activeRidersCount = selectedZones.length === 0
    ? ridersList.length
    : ridersList.filter(r => r.zoneId && selectedZones.includes(r.zoneId)).length;

  const processedCount = finalizedRecords.filter(rec => {
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
    setIsGenerating(true);

    const cutoffLabel = `${from} to ${to}`;
    const targetRiders = filteredRiders();

    try {
      if (targetRiders.length === 0) {
        pushToast({
          title: 'No riders match the selected filters',
          tone: 'error'
        });
        setIsGenerating(false);
        return;
      }

      if (template === 'cutoff_summary') {
        const records = await getPayrollRecords(from, to);
        const finalizedRecords = records.filter(r => isReadOnlyStatus(r.status));
        const filteredRecords = selectedZones.length === 0
          ? finalizedRecords
          : finalizedRecords.filter(r => r.riders?.zone_id && selectedZones.includes(r.riders.zone_id));

        if (filteredRecords.length === 0) {
          pushToast({
            title: 'No finalized records found',
            description: 'No finalized payroll entries in Supabase for this range.',
            tone: 'info'
          });
          setIsGenerating(false);
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
            cutoffLabel
          );
        } else if (format === 'xlsx') {
          await exportXLSXFile(
            'Cutoff Summary',
            ['Rider', 'Rider ID', 'Zone', 'Standard', 'Heavy', 'Failed', 'Returned', 'Standard Earnings', 'Heavy Earnings', 'Gross Delivery Pay', 'Calculation Version', 'Flagged'],
            rows.map(r => [
              r.riderName,
              r.riderId,
              r.zone,
              r.standardParcels, r.heavyParcels, r.failedParcels, r.returnedParcels,
              r.standardEarnings, r.heavyEarnings, r.grossPay, r.calculationVersion, r.flagged
            ]),
            `mkbridertrack_cutoff_summary_${from}_${to}`,
            '/files/MKB_Cutoff_Summary_Payroll_Template.xlsx'
          );
        } else {
          // pdf: Use jsPDF with autoTable to list finalized cutoff totals
          const totalParcels = rows.reduce((s, r) => s + r.totalParcels, 0);
          const totalGross = rows.reduce((s, r) => s + r.grossPay, 0);

          await import('jspdf').then((m) => {
            const jsPDF = m.default;
            const doc = new jsPDF();
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('FLEET CUTOFF SUMMARY — MKB CORPORATION', 105, 20, { align: 'center' });
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Period: ${from} to ${to}`, 105, 27, { align: 'center' });

            autoTable(doc, {
              startY: 35,
              head: [['Rider', 'Zone', 'Standard', 'Heavy', 'Failed', 'Returned', 'Gross Pay', 'Version']],
              body: rows.map(r => [
                r.riderName,
                r.zone,
                r.standardParcels.toString(), r.heavyParcels.toString(),
                r.failedParcels.toString(), r.returnedParcels.toString(),
                `₱${r.grossPay.toLocaleString()}`, `v${r.calculationVersion}`
              ]),
              headStyles: { fillColor: [219, 108, 0], textColor: 255 },
              alternateRowStyles: { fillColor: [255, 241, 224] }
            });

            const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.text(`Total Fleet Parcels : ${totalParcels.toLocaleString()} parcels`, 14, finalY);
            doc.setTextColor(219, 108, 0);
            doc.text(`Total Fleet Gross   : ₱${totalGross.toLocaleString()}`, 14, finalY + 7);

            doc.save(`mkbridertrack_cutoff_summary_${from}_${to}.pdf`);
          });
        }

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
            title: 'No rider selected',
            tone: 'error'
          });
          setIsGenerating(false);
          return;
        }

        const payrollRecords = (await getPayrollRecords(from, to)).filter(record => isReadOnlyStatus(record.status));
        // Finalized payslips are generated only from immutable payroll snapshots.
        for (const rider of targets) {
          const payrollRecord = payrollRecords.find(record => record.rider_id === rider.id);
          if (!payrollRecord) throw new Error(`No finalized payroll snapshot found for ${rider.name}.`);
          const deliveryData = await getPayrollDeliveryData(payrollRecord);
          const dayEntries = parcelLogsToPayslipDays(deliveryData.lines);
          const snapshot: PayslipSnapshotContext = {
            source: deliveryData.source, calculationVersion: deliveryData.calculationVersion,
            standardParcels: deliveryData.summary.standardDelivered, heavyParcels: deliveryData.summary.heavyDelivered,
            failedParcels: deliveryData.summary.failed, returnedParcels: deliveryData.summary.returned,
            standardEarnings: deliveryData.summary.standardEarnings, heavyEarnings: deliveryData.summary.heavyEarnings,
            grossDeliveryPay: deliveryData.summary.grossDeliveryPay,
          };

          const zoneName = zonesList.find(z => z.id === rider.zoneId)?.name || '—';

          if (format === 'csv') {
            exportParcelCSV(
              rider.name,
              rider.riderCode || 'MKB-RIDER',
              from,
              to,
              dayEntries,
              snapshot
            );
          } else {
            exportParcelPayslipPDF(
              rider.name,
              rider.riderCode || 'MKB-RIDER',
              zoneName,
              from,
              to,
              dayEntries,
              snapshot
            );
          }
        }

        pushToast({
          title: `${targets.length} payslips downloaded`,
          description: `${format.toUpperCase()} · ${cutoffLabel}`,
          tone: 'success'
        });

      } else if (template === 'parcel_logs') {
        const filterOpts: { riderId?: string; riderIds?: string[] } = {};
        if (bulkMode === 'single' && singleRiderId) {
          filterOpts.riderId = singleRiderId;
        } else if (selectedZones.length > 0) {
          filterOpts.riderIds = targetRiders.map(r => r.id);
        }
 
        const data = await getParcelLogsDetails(from, to, filterOpts);

        if (!data || data.length === 0) {
          pushToast({
            title: 'No raw logs found',
            description: 'No daily parcel entries exist for this cutoff.',
            tone: 'info'
          });
          setIsGenerating(false);
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
          await exportXLSXFile(
            'Parcel Log',
            cols,
            rows,
            `mkbridertrack_parcel_log_${from}_${to}`,
            '/files/MKB_Raw_Parcel_Delivery_Logs.xlsx'
          );
        } else {
          // PDF / CSV exports raw logs as CSV
          if (format === 'pdf') {
            pushToast({
              title: 'PDF unavailable for raw logs',
              description: 'Exported as CSV instead.',
              tone: 'info'
            });
          }
          const csv = '\uFEFF' + [cols, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n');
          downloadBlob(
            new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
            `mkbridertrack_parcel_log_${from}_${to}.csv`
          );
        }

        pushToast({
          title: 'Parcel Logs exported',
          description: `${rows.length} entries · ${format.toUpperCase()}`,
          tone: 'success'
        });
      }

      // Track export history
      let genFilename = `mkbridertrack_${template}_${from}_${to}.${format}`;
      if (template === 'parcel_logs' && format === 'pdf') {
        genFilename = `mkbridertrack_parcel_log_${from}_${to}.csv`;
      }
      setExportHistory(prev => [
        {
          filename: genFilename,
          format: format === 'pdf' && template === 'parcel_logs' ? 'csv' : format,
          time: 'Just now'
        },
        ...prev
      ]);
    } catch (err) {
      console.error(err);
      pushToast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Failed to complete query transactions.',
        tone: 'error'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="dashboard-page space-y-5">
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEMPLATES.map(t => {
          const Icon = t.icon;
          const active = template === t.key;
          return (
            <button
              key={t.key}
              onClick={() => {
                setTemplate(t.key);
                if (t.key === 'cutoff_summary') setFormat('pdf');
                if (t.key === 'individual_payslips') setFormat('pdf');
                if (t.key === 'parcel_logs') setFormat('csv');
              }}
              className={`group text-left bg-white border rounded-xl p-5 transition relative overflow-hidden ar-card-hover ${active ? 'border-primary ring-2 ring-primary/15' : 'border-border hover:border-primary/30'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center animate-fade-in bg-accent text-accent-foreground border border-primary/20">
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowUpRight
                  className={`w-4 h-4 transition ${active ? 'text-primary' : 'text-muted-foreground group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5'}`}
                />
              </div>
              <div className="text-sm font-semibold text-foreground">{t.title}</div>
              <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{t.description}</div>
              <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                <FileText className="w-3 h-3" />
                {t.meta}
              </div>
              {active && <span className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />}
            </button>
          );
        })}
      </div>

      {/* Main Content Grid: Left Column is Inputs Panel, Right Column is AI Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          {/* Inputs Panel */}
          <div className="bg-white border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {TEMPLATES.find(t => t.key === template)?.title}
                </div>
                <div className="text-[11px] text-muted-foreground font-mono">Configure parameters & export</div>
              </div>
            </div>

            <div className="space-y-4">
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
                    className="w-full h-10 px-3 rounded-lg bg-panel-bg border border-border text-sm text-foreground font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                    className="w-full h-10 px-3 rounded-lg bg-panel-bg border border-border text-sm text-foreground font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
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
                        onClick={() => toggleZone(z.id)}
                        className={`px-2.5 py-1 rounded text-[11px] border transition ${on ? 'bg-accent border-primary/40 text-accent-foreground font-semibold' : 'bg-panel-bg border-border text-muted-foreground hover:text-foreground'}`}
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
                      onClick={() => setBulkMode('single')}
                      className={`h-8 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 ${bulkMode === 'single' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Single rider
                    </button>
                    <button
                      onClick={() => setBulkMode('bulk')}
                      className={`h-8 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 ${bulkMode === 'bulk' ? 'bg-primary text-white shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      All riders ({filteredRiders().length})
                    </button>
                  </div>

                  {bulkMode === 'single' && (
                    <select
                      value={singleRiderId}
                      onChange={e => setSingleRiderId(e.target.value)}
                      className="w-full h-10 px-3 pr-8 rounded-lg bg-panel-bg border border-border text-sm text-foreground font-mono outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 cursor-pointer"
                    >
                      {ridersList.map(r => (
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
                      (template === 'individual_payslips' && f === 'xlsx') ||
                      (template === 'parcel_logs' && f === 'pdf');
                    const selected = format === f;
                    return (
                      <button
                        key={f}
                        onClick={() => !disabled && setFormat(f)}
                        disabled={disabled}
                        className={`h-9 rounded-md border text-xs uppercase transition ${selected && !disabled ? 'bg-accent border-primary text-accent-foreground font-bold' : disabled ? 'bg-panel-bg border-border text-muted-foreground/30 cursor-not-allowed' : 'bg-panel-bg border-border text-muted-foreground hover:text-foreground'}`}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full h-11 rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-primary/30 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating Report...
                  </>
                ) : (
                  'Generate Report'
                )}
              </button>
            </div>
          </div>
        </div>

        <div>
          {/* AI Payroll Summary Card */}
          <div className="bg-white border border-border rounded-xl p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground">AI Payroll Summary</div>
                  <div className="text-[11px] text-muted-foreground font-mono">Dynamic insights</div>
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
                    This cutoff has <span className="font-semibold text-foreground">{totalRiders} active riders</span> who delivered a total of{' '}
                    <span className="font-semibold text-foreground">{totalParcels.toLocaleString()} parcels</span> ({totalStandardParcels.toLocaleString()} standard, {totalHeavyParcels.toLocaleString()} heavy).
                  </p>
                  <p>
                    Total gross payroll calculated at <span className="font-semibold text-primary">₱{totalGross.toLocaleString()}</span>.{' '}
                    {flaggedRiders > 0 && (
                      <span className="text-amber-600 font-medium">
                        {flaggedRiders} rider{flaggedRiders > 1 ? 's are' : ' is'} flagged for unusual delivery counts (&gt;100 parcels/day).{' '}
                      </span>
                    )}
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
        <div className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-5">
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

      {/* Expanded Sections: History, archives, and exports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Previous Cutoffs & Payroll History */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent ring-1 ring-primary/30 flex items-center justify-center">
              <CalendarRange className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground">Payroll History & Archives</div>
              <div className="text-[11px] text-muted-foreground font-mono">Load previous cutoff dates into generator</div>
            </div>
          </div>

          <div className="table-scroll-region" role="region" aria-label="Payroll report history" tabIndex={0}>
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
                {[
                  { start: '2026-07-01', end: '2026-07-15', label: 'Jul 1–15, 2026', riders: 1, gross: 480, status: 'Flagged' },
                  { start: '2026-06-16', end: '2026-06-30', label: 'Jun 16–30, 2026', riders: 24, gross: 11450, status: 'Paid' },
                  { start: '2026-06-01', end: '2026-06-15', label: 'Jun 1–15, 2026', riders: 22, gross: 9820, status: 'Paid' },
                  { start: '2026-05-16', end: '2026-05-31', label: 'May 16–31, 2026', riders: 25, gross: 12400, status: 'Paid' },
                ].map((item, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-panel-bg transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-foreground">{item.label}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">{item.riders}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums">₱{item.gross.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                        item.status === 'Paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => {
                          setFrom(item.start);
                          setTo(item.end);
                          pushToast({ title: 'Cutoff Dates Loaded', description: `${item.label} set.`, tone: 'success' });
                        }}
                        className="px-2.5 py-1 text-[10px] font-bold text-accent-foreground hover:text-white bg-accent hover:bg-primary rounded transition cursor-pointer"
                      >
                        Load
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Generated Reports & Export History */}
        <div className="bg-white border border-border rounded-xl p-5 shadow-sm space-y-4">
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

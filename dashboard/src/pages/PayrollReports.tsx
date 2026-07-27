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
import { getRiderAttendanceInDateRange } from '../services/attendanceService';
import { getZones } from '../services/geofenceService';
import { getAllRiders } from '../services/monitoringService';
import type { Rider, Zone } from '../services/types';
import {
  getParcelLogs,
  getParcelLogsSummary,
  getPayrollRecordsSummary,
  getParcelLogsDetails,
  getPayrollRecords
} from '../services/parcelService';
import {
  exportParcelPayslipPDF,
  exportParcelCSV,
  exportCutoffSummaryCSV,
} from '../lib/exports/payrollExport';
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
  const [rate, setRate] = useState(50);
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
    Promise.all([getAllRiders(), getZones()]).then(([r, z]) => {
      setRidersList(r);
      setZonesList(z);
      if (r.length > 0) {
        setSingleRiderId(r[0].id);
      }
    });
  }, []);

  interface ParcelLogRow {
    parcels: number;
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

  const totalParcels = filteredLogs.reduce((sum, log) => sum + (log.parcels || 0), 0);
  const totalGross = filteredLogs.reduce((sum, log) => sum + (log.daily_gross || 0), 0);
  const distinctRiders = new Set(filteredLogs.map(log => log.rider_id));
  const totalRiders = distinctRiders.size;

  const flaggedRiders = new Set(
    filteredLogs.filter(log => log.parcels > 100).map(log => log.rider_id)
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
      riderParcelsMap[log.rider_id].parcels += log.parcels || 0;
    }
  });

  const chartData = Object.values(riderParcelsMap).sort((a, b) => b.parcels - a.parcels).slice(0, 5);
  const maxParcels = Math.max(...chartData.map(d => d.parcels), 1);

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
        const filteredRecords = selectedZones.length === 0
          ? records
          : records.filter(r => r.riders?.zone_id && selectedZones.includes(r.riders.zone_id));

        if (filteredRecords.length === 0) {
          pushToast({
            title: 'No finalized records found',
            description: 'No finalized payroll entries in Supabase for this range.',
            tone: 'info'
          });
          setIsGenerating(false);
          return;
        }

        const rows = filteredRecords.map(r => {
          const zName = r.riders?.zones?.name || '—';
          const activeRate = parseFloat(r.rate_per_parcel || 10);
          const computedGross = r.gross_pay ? parseFloat(r.gross_pay) : (r.total_parcels * activeRate);
          return {
            riderName: r.riders?.name || 'Unknown Rider',
            riderId: r.riders?.mkb_id || '—',
            zone: zName,
            totalParcels: r.total_parcels,
            ratePerParcel: activeRate,
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
              ratePerParcel: r.ratePerParcel,
              grossPay: r.grossPay
            })),
            cutoffLabel
          );
        } else if (format === 'xlsx') {
          await exportXLSXFile(
            'Cutoff Summary',
            ['Rider', 'Rider ID', 'Zone', 'Total Parcels', 'Flagged', 'Total Gross Pay'],
            rows.map(r => [
              r.riderName,
              r.riderId,
              r.zone,
              r.totalParcels,
              r.flagged,
              r.grossPay
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
              head: [['Rider', 'Zone', 'Total Parcels', 'Rate per Parcel', 'Gross Pay']],
              body: rows.map(r => [
                r.riderName,
                r.zone,
                r.totalParcels.toString(),
                `₱${r.ratePerParcel.toFixed(2)}`,
                `₱${r.grossPay.toLocaleString()}`
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

        // Fetch logs for all target riders and export
        for (const rider of targets) {
          const dates: string[] = [];
          const start = new Date(from);
          const end = new Date(to);
          const current = new Date(start);
          while (current <= end) {
            dates.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 1);
          }

          const [logs, attList] = await Promise.all([
            getParcelLogs(rider.id, from, to),
            getRiderAttendanceInDateRange(rider.id, from, to)
          ]);
          const dayEntries = dates.map(date => {
            const existing = logs.find(l => l.date === date);
            const att = attList.find(a => a.date === date);

            const canonicalTimeIn = att?.rawTimeIn || (att?.timeIn ? `${date}T${att.timeIn}:00` : null);
            let calculatedRate = 10;
            if (canonicalTimeIn) {
              const d = new Date(canonicalTimeIn);
              if (!isNaN(d.getTime())) {
                const hours = d.getHours();
                const mins = d.getMinutes();
                const totalMinutes = hours * 60 + mins;
                if (totalMinutes <= 480) calculatedRate = 12;
                else if (totalMinutes <= 540) calculatedRate = 11;
              }
            } else if (existing && existing.rate) {
              calculatedRate = existing.rate;
            }

            return {
              date,
              parcels: existing?.parcels ?? 0,
              rate: calculatedRate,
              dailyGross: existing ? existing.parcels * calculatedRate : 0
            };
          });

          const zoneName = zonesList.find(z => z.id === rider.zoneId)?.name || '—';

          if (format === 'csv') {
            exportParcelCSV(
              rider.name,
              rider.riderCode || 'MKB-RIDER',
              from,
              to,
              rate,
              dayEntries
            );
          } else {
            exportParcelPayslipPDF(
              rider.name,
              rider.riderCode || 'MKB-RIDER',
              zoneName,
              from,
              to,
              rate,
              dayEntries
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

        const cols = ['Rider', 'Rider ID', 'Zone', 'Date', 'Parcels Delivered', 'Rate per Parcel', 'Daily Gross'];
        const rows = data.map(log => [
          log.riders?.name || 'Unknown Rider',
          log.riders?.mkb_id || '—',
          log.riders?.zones?.name || '—',
          log.date,
          log.parcels,
          parseFloat(log.rate || 10),
          parseFloat(log.daily_gross || 0)
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
        description: 'Failed to complete query transactions.',
        tone: 'error'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
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
              className={`group text-left bg-white border rounded-xl p-5 transition relative overflow-hidden ar-card-hover ${active ? 'border-[#db6c00] ring-2 ring-[#db6c00]/15' : 'border-[#EFEAE2] hover:border-[#db6c00]/30'}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center animate-fade-in"
                  style={{
                    background: `${t.accent}18`,
                    color: t.accent,
                    boxShadow: `inset 0 0 0 1px ${t.accent}38`
                  }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowUpRight
                  className={`w-4 h-4 transition ${active ? 'text-[#db6c00]' : 'text-[#6B6258] group-hover:text-[#db6c00] group-hover:-translate-y-0.5 group-hover:translate-x-0.5'}`}
                />
              </div>
              <div className="text-sm font-semibold text-[#1A1410]">{t.title}</div>
              <div className="text-xs text-[#6B6258] mt-1 leading-relaxed">{t.description}</div>
              <div className="mt-4 pt-3 border-t border-[#EFEAE2] flex items-center gap-2 text-[11px] text-[#6B6258] font-mono">
                <FileText className="w-3 h-3" />
                {t.meta}
              </div>
              {active && <span className="absolute top-0 left-0 right-0 h-[2px] bg-[#db6c00]" />}
            </button>
          );
        })}
      </div>

      {/* Main Content Grid: Left Column is Inputs Panel, Right Column is AI Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          {/* Inputs Panel */}
          <div className="bg-white border border-[#EFEAE2] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#db6c00]" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[#1A1410]">
                  {TEMPLATES.find(t => t.key === template)?.title}
                </div>
                <div className="text-[11px] text-[#6B6258] font-mono">Configure parameters & export</div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">From</div>
                  <input
                    type="date"
                    value={from}
                    onChange={e => {
                      setFrom(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15"
                  />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">To</div>
                  <input
                    type="date"
                    value={to}
                    onChange={e => {
                      setTo(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15"
                  />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-1.5 text-[12px] text-[#DC2626]">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Rate Per Parcel (needed for payslips) */}
              {template === 'individual_payslips' && (
                <div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                    Default Rate per Parcel (₱)
                  </div>
                  <input
                    type="number"
                    min={0}
                    value={rate}
                    onChange={e => setRate(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15"
                  />
                </div>
              )}

              {/* Zones Selector */}
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                  Filter Zones {selectedZones.length === 0 && '(all)'}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {zonesList.map(z => {
                    const on = selectedZones.includes(z.id);
                    return (
                      <button
                        key={z.id}
                        onClick={() => toggleZone(z.id)}
                        className={`px-2.5 py-1 rounded text-[11px] border transition ${on ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00] font-semibold' : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410]'}`}
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
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">Mode</div>
                  <div className="inline-flex rounded-md border border-[#EFEAE2] bg-[#FAFAF7] p-0.5 mb-3">
                    <button
                      onClick={() => setBulkMode('single')}
                      className={`h-8 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 ${bulkMode === 'single' ? 'bg-[#db6c00] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}
                    >
                      <Receipt className="w-3.5 h-3.5" />
                      Single rider
                    </button>
                    <button
                      onClick={() => setBulkMode('bulk')}
                      className={`h-8 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 ${bulkMode === 'bulk' ? 'bg-[#db6c00] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}
                    >
                      <Users className="w-3.5 h-3.5" />
                      All riders ({filteredRiders().length})
                    </button>
                  </div>

                  {bulkMode === 'single' && (
                    <select
                      value={singleRiderId}
                      onChange={e => setSingleRiderId(e.target.value)}
                      className="w-full h-10 px-3 pr-8 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#db6c00] focus:ring-2 focus:ring-[#db6c00]/15 cursor-pointer"
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
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">Format</div>
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
                        className={`h-9 rounded-md border text-xs uppercase transition ${selected && !disabled ? 'bg-[#FFF1E0] border-[#db6c00] text-[#b85a00] font-bold' : disabled ? 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258]/30 cursor-not-allowed' : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410]'}`}
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
                className="w-full h-11 rounded-lg bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#db6c00]/30 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
          <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 flex flex-col justify-between h-full">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-[#db6c00]" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#1A1410]">AI Payroll Summary</div>
                  <div className="text-[11px] text-[#6B6258] font-mono">Dynamic insights</div>
                </div>
              </div>

              {loadingSummary ? (
                <div className="space-y-3 py-4 animate-pulse">
                  <div className="h-4 bg-[#FAFAF7] rounded w-full" />
                  <div className="h-4 bg-[#FAFAF7] rounded w-5/6" />
                  <div className="h-4 bg-[#FAFAF7] rounded w-2/3" />
                </div>
              ) : (
                <div className="text-xs text-[#6B6258] leading-relaxed space-y-4">
                  <p>
                    This cutoff has <span className="font-semibold text-[#1A1410]">{totalRiders} active riders</span> who delivered a total of{' '}
                    <span className="font-semibold text-[#1A1410]">{totalParcels.toLocaleString()} parcels</span>.
                  </p>
                  <p>
                    Total gross payroll calculated at <span className="font-semibold text-[#db6c00]">₱{totalGross.toLocaleString()}</span>.{' '}
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
              <div className="bg-[#FAFAF7] border border-[#EFEAE2] rounded-lg p-3 text-center">
                <div className="text-[20px] font-bold text-[#1A1410] font-mono">
                  {loadingSummary ? '...' : totalParcels.toLocaleString()}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#6B6258] font-semibold mt-0.5">Parcels</div>
              </div>
              <div className="bg-[#FFF1E0]/50 border border-[#db6c00]/25 rounded-lg p-3 text-center">
                <div className="text-[20px] font-bold text-[#db6c00] font-mono">
                  {loadingSummary ? '...' : `₱${totalGross.toLocaleString()}`}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-[#db6c00] font-semibold mt-0.5">Gross</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Chart Row */}
      <div className="w-full">
        {/* Parcels Delivered per Rider Chart */}
        <div className="bg-white border border-[#EFEAE2] rounded-xl p-5">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
              <Package className="w-4 h-4 text-[#db6c00]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1A1410]">Parcels Delivered per Rider</div>
              <div className="text-[11px] text-[#6B6258] font-mono">Visual comparison for this cutoff</div>
            </div>
          </div>

          {loadingSummary ? (
            <div className="h-48 flex items-end justify-around gap-4 px-4 py-2 border-b border-[#EFEAE2] animate-pulse">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="w-12 bg-[#FAFAF7] rounded-t-md" style={{ height: `${20 + i * 15}%` }} />
              ))}
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-xs text-[#6B6258] border border-dashed border-[#EFEAE2] rounded-lg">
              No parcel data available for this range.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bars container */}
              <div className="h-56 flex items-end justify-around gap-4 px-4 pb-2 border-b border-[#EFEAE2]">
                {chartData.map(d => {
                  const heightPercent = maxParcels > 0 ? (d.parcels / maxParcels) * 100 : 0;
                  const isLow = d.parcels > 0 && d.parcels < 60;
                  const barColor = isLow ? 'bg-orange-500' : 'bg-[#db6c00] hover:bg-[#b85a00]';

                  return (
                    <div key={d.name} className="flex-1 flex flex-col items-center max-w-[80px] group">
                      <div className="text-[11px] font-bold text-[#1A1410] mb-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {d.parcels}
                      </div>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(4, heightPercent)}%` }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                        className={`w-full ${barColor} rounded-t-md transition-all duration-300 relative shadow-sm cursor-pointer group-hover:shadow-md`}
                      >
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-[#1A1410] font-mono group-hover:hidden block">
                          {d.parcels}
                        </div>
                      </motion.div>
                    </div>
                  );
                })}
              </div>

              {/* X Axis Labels */}
              <div className="flex justify-around gap-4 px-4">
                {chartData.map(d => (
                  <div key={d.name} className="flex-1 text-center text-[10.5px] font-semibold text-[#6B6258] truncate max-w-[80px]" title={d.name}>
                    {d.name.split(' ')[0]}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Sections: History, archives, and exports */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        {/* Previous Cutoffs & Payroll History */}
        <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
              <CalendarRange className="w-4 h-4 text-[#db6c00]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1A1410]">Payroll History & Archives</div>
              <div className="text-[11px] text-[#6B6258] font-mono">Load previous cutoff dates into generator</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#FAFAF7] border-b border-[#EFEAE2] text-[10px] uppercase font-bold text-[#6B6258]">
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
                  <tr key={idx} className="border-b border-[#EFEAE2] hover:bg-[#FAFAF7] transition-colors">
                    <td className="px-3 py-2.5 font-semibold text-[#1A1410]">{item.label}</td>
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
                        className="px-2.5 py-1 text-[10px] font-bold text-[#db6c00] hover:text-[#b85a00] bg-[#FFF1E0] hover:bg-[#db6c00]/25 rounded transition cursor-pointer"
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
        <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/30 flex items-center justify-center">
              <FileText className="w-4 h-4 text-[#db6c00]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1A1410]">Export & Download History</div>
              <div className="text-[11px] text-[#6B6258] font-mono">Recent reports exported during this session</div>
            </div>
          </div>

          <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
            {exportHistory.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#6B6258] italic border border-dashed border-[#EFEAE2] rounded-lg">
                No exports run in this session yet. Generate a report above.
              </div>
            ) : (
              exportHistory.map((hist, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg border border-[#EFEAE2] bg-[#FAFAF7]/50 hover:bg-[#FAFAF7] transition">
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="text-xs font-semibold text-[#1A1410] truncate">{hist.filename}</div>
                    <div className="text-[10px] text-[#6B6258] mt-0.5 flex items-center gap-2">
                      <span className="uppercase font-semibold font-mono text-[#db6c00]">{hist.format}</span>
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

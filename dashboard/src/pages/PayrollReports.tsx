import React, { useState, createElement, Component } from 'react';
import {
  CalendarRange,
  Receipt,
  Clock,
  Sparkles,
  Loader2,
  AlertCircle,
  FileText,
  ArrowUpRight,
  Users } from
'lucide-react';
import { riders, zones } from '../services/mockData';
import {
  exportCutoffSummaryCSV,
  exportPayslipCSV,
  exportPayslipPDF,
  type PayslipDay } from
'../lib/payrollExport';
import { pushToast } from '../hooks/useToast';
type PayrollTemplate = 'cutoff_summary' | 'individual_payslips' | 'hours_log';
type PayrollFormat = 'pdf' | 'csv' | 'xlsx';
const TEMPLATES: {
  key: PayrollTemplate;
  title: string;
  description: string;
  meta: string;
  icon: ComponentType<{
    className?: string;
  }>;
  accent: string;
}[] = [
{
  key: 'cutoff_summary',
  title: 'Cutoff Summary',
  description:
  'All riders with gross pay totals for the selected cutoff period.',
  meta: 'Per-cutoff · PDF/CSV/XLSX',
  icon: CalendarRange,
  accent: '#ca8a04'
},
{
  key: 'individual_payslips',
  title: 'Individual Payslips',
  description:
  'Generate a payslip per rider — single rider or bulk export for all riders.',
  meta: 'Per-rider · PDF',
  icon: Receipt,
  accent: '#a16207'
},
{
  key: 'hours_log',
  title: 'Hours Log',
  description:
  'Raw attendance hours export by rider and date for the selected range.',
  meta: 'Raw data · CSV/XLSX',
  icon: Clock,
  accent: '#854d0e'
}];

function pad(n: number) {
  return String(n).padStart(2, '0');
}
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
function buildDaysForRange(
riderIndex: number,
from: string,
to: string)
: PayslipDay[] {
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  if (end < start) return [];
  const days: PayslipDay[] = [];
  const rand = seeded(
    riderIndex * 100 + Number(from.replace(/-/g, '')) % 9999
  );
  const cursor = new Date(start);
  while (cursor <= end) {
    const date = `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`;
    const r = rand();
    let status: PayslipDay['status'] = 'Present';
    let timeIn: string | null = '08:00';
    let timeOut: string | null = '17:00';
    let hours = 9;
    if (r < 0.08) {
      status = 'Late';
      timeIn = `08:${pad(Math.floor(r * 100) + 12)}`;
      hours = 8.3;
    } else if (r < 0.12) {
      status = 'Absent';
      timeIn = null;
      timeOut = null;
      hours = 0;
    }
    days.push({
      date,
      timeIn,
      timeOut,
      hours,
      status
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
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
// Simple XLSX-like export via lib/reportExport? We'll inline a CSV fallback for xlsx for simplicity
// using xlsx package directly.
import * as XLSX from 'xlsx';
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
function exportXLSXFile(
title: string,
columns: string[],
rows: (string | number)[][],
filename: string)
{
  const aoa = [columns, ...rows];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = columns.map((col, i) => {
    const maxLen = Math.max(
      col.length,
      ...rows.map((r) => String(r[i] ?? '').length)
    );
    return {
      wch: Math.min(40, Math.max(10, maxLen + 2))
    };
  });
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, title.slice(0, 31));
  XLSX.writeFile(book, `${filename}.xlsx`);
}
function csvEscape(cell: string | number | null | undefined): string {
  const s = String(cell ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
export function PayrollReports() {
  const [template, setTemplate] = useState<PayrollTemplate>('cutoff_summary');
  const [format, setFormat] = useState<PayrollFormat>('pdf');
  const [from, setFrom] = useState(isoOffset(14));
  const [to, setTo] = useState(isoToday());
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [bulkMode, setBulkMode] = useState<'single' | 'bulk'>('bulk');
  const [singleRiderId, setSingleRiderId] = useState(riders[0].id);
  const [dailyRate, setDailyRate] = useState(500);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function toggleZone(id: string) {
    setSelectedZones((prev) =>
    prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]
    );
  }
  function filteredRiders() {
    return selectedZones.length === 0 ?
    riders :
    riders.filter((r) => r.zoneId && selectedZones.includes(r.zoneId));
  }
  async function handleGenerate() {
    if (!from || !to || to < from) {
      setError('Please select a valid date range');
      return;
    }
    setError(null);
    setIsGenerating(true);
    await new Promise((r) => setTimeout(r, 60));
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
        // Build rows summarizing each rider's cutoff
        const rows = targetRiders.map((rider, i) => {
          const riderIndex = riders.findIndex((r) => r.id === rider.id);
          const days = buildDaysForRange(riderIndex, from, to);
          const daysPresent = days.filter(
            (d) => d.status === 'Present' || d.status === 'Late'
          ).length;
          const totalHours =
          Math.round(days.reduce((s, d) => s + d.hours, 0) * 10) / 10;
          const zone = zones.find((z) => z.id === rider.zoneId)?.name ?? '—';
          return {
            riderName: rider.name,
            zone,
            daysPresent,
            totalHours,
            dailyRate,
            grossPay: daysPresent * dailyRate
          };
        });
        if (format === 'csv') {
          exportCutoffSummaryCSV(rows, cutoffLabel);
        } else if (format === 'xlsx') {
          exportXLSXFile(
            'Cutoff Summary',
            ['Rider', 'Zone', 'Days', 'Hours', 'Daily Rate', 'Gross Pay'],
            rows.map((r) => [
            r.riderName,
            r.zone,
            r.daysPresent,
            r.totalHours,
            r.dailyRate.toFixed(2),
            r.grossPay.toFixed(2)]
            ),
            `attenrider_cutoff_summary_${from}_${to}`
          );
        } else {
          // pdf: use payslip-style report — fall back to first rider summary block? Provide CSV for now
          // For simplicity, export PDF summary as a single-page jsPDF table using a quick helper.
          const total = rows.reduce((s, r) => s + r.grossPay, 0);
          await import('jspdf').then((m) => {
            const jsPDF = m.default;
            const doc = new jsPDF({
              unit: 'pt',
              format: 'letter'
            });
            const pageWidth = doc.internal.pageSize.getWidth();
            const marginX = 40;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(18);
            doc.setTextColor(202, 138, 4);
            doc.text('AttenRider', marginX, 40);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(107, 98, 88);
            doc.text('MKB Corporation · Cutoff Summary', marginX, 54);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(26, 20, 16);
            doc.text(`Cutoff: ${cutoffLabel}`, marginX, 80);
            // Table
            const cols = ['Rider', 'Zone', 'Days', 'Hours', 'Gross Pay'];
            const usable = pageWidth - marginX * 2;
            const widths = [0.34, 0.22, 0.1, 0.12, 0.22].map((p) => p * usable);
            let y = 100;
            doc.setFillColor(202, 138, 4);
            doc.rect(marginX, y, usable, 22, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(255, 255, 255);
            let cx = marginX;
            cols.forEach((c, i) => {
              doc.text(c, cx + 6, y + 15);
              cx += widths[i];
            });
            y += 22;
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(26, 20, 16);
            rows.forEach((r, idx) => {
              if (y > 740) {
                doc.addPage();
                y = 60;
              }
              if (idx % 2 === 0) {
                doc.setFillColor(254, 252, 232);
                doc.rect(marginX, y, usable, 18, 'F');
              }
              const cells = [
              r.riderName,
              r.zone,
              String(r.daysPresent),
              r.totalHours.toFixed(1),
              `PHP ${r.grossPay.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}`];

              cx = marginX;
              cells.forEach((cell, i) => {
                doc.text(cell, cx + 6, y + 12);
                cx += widths[i];
              });
              y += 18;
            });
            y += 14;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(202, 138, 4);
            doc.text(
              `TOTAL: PHP ${total.toLocaleString('en-PH', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}`,
              pageWidth - marginX,
              y,
              {
                align: 'right'
              }
            );
            doc.save(`attenrider_cutoff_summary_${from}_${to}.pdf`);
          });
        }
        pushToast({
          title: 'Cutoff Summary exported',
          description: `${rows.length} rider${rows.length === 1 ? '' : 's'} · ${format.toUpperCase()}`,
          tone: 'success'
        });
      } else if (template === 'individual_payslips') {
        const targets =
        bulkMode === 'single' ?
        targetRiders.filter((r) => r.id === singleRiderId) :
        targetRiders;
        if (targets.length === 0) {
          pushToast({
            title: 'No rider selected',
            tone: 'error'
          });
          setIsGenerating(false);
          return;
        }
        targets.forEach((rider) => {
          const riderIndex = riders.findIndex((r) => r.id === rider.id);
          const days = buildDaysForRange(riderIndex, from, to);
          const daysPresent = days.filter(
            (d) => d.status === 'Present' || d.status === 'Late'
          ).length;
          const totalHours =
          Math.round(days.reduce((s, d) => s + d.hours, 0) * 10) / 10;
          const zone = zones.find((z) => z.id === rider.zoneId)?.name ?? '—';
          const grossPay = daysPresent * dailyRate;
          const data = {
            riderName: rider.name,
            riderId: rider.riderCode,
            zone,
            cutoffFrom: from,
            cutoffTo: to,
            dailyRate,
            days,
            daysPresent,
            totalHours,
            grossPay,
            deductions: 0,
            netPay: grossPay
          };
          if (format === 'csv') exportPayslipCSV(data);else
          exportPayslipPDF(data);
        });
        pushToast({
          title: `${targets.length} payslip${targets.length === 1 ? '' : 's'} downloaded`,
          description: `${format.toUpperCase()} · ${cutoffLabel}`,
          tone: 'success'
        });
      } else if (template === 'hours_log') {
        // Raw hours log per rider per day
        const rows: (string | number)[][] = [];
        targetRiders.forEach((rider) => {
          const riderIndex = riders.findIndex((r) => r.id === rider.id);
          const days = buildDaysForRange(riderIndex, from, to);
          const zone = zones.find((z) => z.id === rider.zoneId)?.name ?? '—';
          days.forEach((d) => {
            rows.push([
            rider.name,
            rider.riderCode,
            zone,
            d.date,
            d.timeIn ?? '',
            d.timeOut ?? '',
            d.hours,
            d.status]
            );
          });
        });
        const cols = [
        'Rider',
        'Rider ID',
        'Zone',
        'Date',
        'Time-In',
        'Time-Out',
        'Hours',
        'Status'];

        if (format === 'xlsx') {
          exportXLSXFile(
            'Hours Log',
            cols,
            rows,
            `attenrider_hours_log_${from}_${to}`
          );
        } else if (format === 'pdf') {
          // Fallback to CSV; PDF for big logs is impractical
          pushToast({
            title: 'PDF unavailable for Hours Log',
            description: 'Exported as CSV instead.',
            tone: 'info'
          });
          const csv =
          '\uFEFF' +
          [cols, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
          downloadBlob(
            new Blob([csv], {
              type: 'text/csv;charset=utf-8;'
            }),
            `attenrider_hours_log_${from}_${to}.csv`
          );
        } else {
          const csv =
          '\uFEFF' +
          [cols, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
          downloadBlob(
            new Blob([csv], {
              type: 'text/csv;charset=utf-8;'
            }),
            `attenrider_hours_log_${from}_${to}.csv`
          );
        }
        pushToast({
          title: 'Hours Log exported',
          description: `${rows.length} row${rows.length === 1 ? '' : 's'}`,
          tone: 'success'
        });
      }
    } catch {
      pushToast({
        title: 'Export failed',
        tone: 'error'
      });
    } finally {
      setIsGenerating(false);
    }
  }
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      {/* Report cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const active = template === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTemplate(t.key)}
              className={`group text-left bg-white border rounded-xl p-5 transition relative overflow-hidden ar-card-hover ${active ? 'border-[#ca8a04] ring-2 ring-[#ca8a04]/15' : 'border-[#EFEAE2] hover:border-[#ca8a04]/30'}`}>
              
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    background: `${t.accent}18`,
                    color: t.accent,
                    boxShadow: `inset 0 0 0 1px ${t.accent}38`
                  }}>
                  
                  <Icon className="w-5 h-5" />
                </div>
                <ArrowUpRight
                  className={`w-4 h-4 transition ${active ? 'text-[#ca8a04]' : 'text-[#6B6258] group-hover:text-[#ca8a04] group-hover:-translate-y-0.5 group-hover:translate-x-0.5'}`} />
                
              </div>
              <div className="text-sm font-semibold text-[#1A1410]">
                {t.title}
              </div>
              <div className="text-xs text-[#6B6258] mt-1 leading-relaxed">
                {t.description}
              </div>
              <div className="mt-4 pt-3 border-t border-[#EFEAE2] flex items-center gap-2 text-[11px] text-[#6B6258] font-mono">
                <FileText className="w-3 h-3" />
                {t.meta}
              </div>
              {active &&
              <span className="absolute top-0 left-0 right-0 h-[2px] bg-[#ca8a04]" />
              }
            </button>);

        })}
      </div>

      {/* Generator panel */}
      <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 max-w-3xl">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-[#FEF3C7] ring-1 ring-[#ca8a04]/30 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-[#a16207]" />
          </div>
          <div>
            <div className="text-sm font-semibold text-[#1A1410]">
              {TEMPLATES.find((t) => t.key === template)?.title}
            </div>
            <div className="text-[11px] text-[#6B6258] font-mono">
              Configure & export
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                From
              </div>
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15" />
              
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                To
              </div>
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15" />
              
            </div>
          </div>

          {error &&
          <div className="flex items-start gap-1.5 text-[12px] text-[#DC2626]">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          }

          {/* Daily rate (relevant for summary + payslips) */}
          {template !== 'hours_log' &&
          <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                Daily Rate (₱)
              </div>
              <input
              type="number"
              min={0}
              value={dailyRate}
              onChange={(e) =>
              setDailyRate(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full h-10 px-3 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15" />
            
            </div>
          }

          {/* Zones */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
              Zones {selectedZones.length === 0 && '(all)'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {zones.map((z) => {
                const on = selectedZones.includes(z.id);
                return (
                  <button
                    key={z.id}
                    onClick={() => toggleZone(z.id)}
                    className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${on ? 'bg-[#FEF3C7] border-[#ca8a04]/40 text-[#a16207]' : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410] hover:border-[#ca8a04]/30'}`}>
                    
                    {z.name}
                  </button>);

              })}
            </div>
          </div>

          {/* Individual payslip — single vs bulk */}
          {template === 'individual_payslips' &&
          <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
                Mode
              </div>
              <div className="inline-flex rounded-md border border-[#EFEAE2] bg-[#FAFAF7] p-0.5 mb-3">
                <button
                onClick={() => setBulkMode('single')}
                className={`h-8 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 ${bulkMode === 'single' ? 'bg-[#ca8a04] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
                
                  <Receipt className="w-3.5 h-3.5" />
                  Single rider
                </button>
                <button
                onClick={() => setBulkMode('bulk')}
                className={`h-8 px-3 rounded text-xs font-semibold transition inline-flex items-center gap-1.5 ${bulkMode === 'bulk' ? 'bg-[#ca8a04] text-white shadow-sm' : 'text-[#6B6258] hover:text-[#1A1410]'}`}>
                
                  <Users className="w-3.5 h-3.5" />
                  All riders ({filteredRiders().length})
                </button>
              </div>
              {bulkMode === 'single' &&
            <select
              value={singleRiderId}
              onChange={(e) => setSingleRiderId(e.target.value)}
              className="w-full h-10 px-3 pr-8 rounded-lg bg-[#FAFAF7] border border-[#EFEAE2] text-sm text-[#1A1410] font-mono outline-none focus:border-[#ca8a04] focus:ring-2 focus:ring-[#ca8a04]/15 cursor-pointer">
              
                  {riders.map((r) =>
              <option key={r.id} value={r.id}>
                      {r.name} · {r.riderCode}
                    </option>
              )}
                </select>
            }
            </div>
          }

          {/* Format */}
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-semibold">
              Format
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(['pdf', 'csv', 'xlsx'] as const).map((f) => {
                const disabled =
                template === 'individual_payslips' && f === 'xlsx' ||
                template === 'hours_log' && f === 'pdf';
                const selected = format === f;
                return (
                  <button
                    key={f}
                    onClick={() => !disabled && setFormat(f)}
                    disabled={disabled}
                    className={`h-9 rounded-md border text-xs uppercase transition-colors ${selected && !disabled ? 'bg-[#FEF3C7] border-[#ca8a04] text-[#a16207] font-bold' : disabled ? 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258]/40 cursor-not-allowed' : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410] hover:border-[#ca8a04]/30'}`}>
                    
                    {f}
                  </button>);

              })}
            </div>
          </div>

          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full h-11 rounded-lg bg-[#ca8a04] hover:bg-[#a16207] text-white text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#ca8a04]/30 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            
            {isGenerating ?
            <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating…
              </> :

            'Generate Report'
            }
          </button>
        </div>
      </div>
    </div>);

}
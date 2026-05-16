import { useState } from 'react';
import {
  CalendarRange,
  AlertOctagon,
  MapPinned,
  Trophy,
  Sparkles,
  Loader2,
  AlertCircle } from
'lucide-react';
import { ReportCard } from '../components/reports/ReportCard';
import {
  AttendanceRateChart,
  ViolationsByZoneChart,
  StatusMixChart } from
'../components/reports/Charts';
import { zones } from '../services/mockData';
import {
  generateReport,
  ReportError,
  type ReportTemplate,
  type ReportFormat } from
'../lib/reportExport';
import { pushToast } from '../hooks/useToast';
const SAVED = [
{
  title: 'Weekly Attendance',
  description: 'Aggregate present/late/absent across all riders.',
  meta: 'Updated daily · PDF/CSV',
  icon: CalendarRange,
  accent: '#db6c00'
},
{
  title: 'Violation Summary',
  description: 'Geofence boundary exits and idle excess events by rider.',
  meta: 'Updated hourly · PDF/CSV',
  icon: AlertOctagon,
  accent: '#DC2626'
},
{
  title: 'Zone Coverage',
  description: 'Rider-hours per zone vs scheduled coverage targets.',
  meta: 'Updated daily · PDF',
  icon: MapPinned,
  accent: '#f59e0b'
},
{
  title: 'Rider Performance',
  description: 'Punctuality, hours, and violations per rider.',
  meta: 'Updated weekly · PDF/CSV',
  icon: Trophy,
  accent: '#16A34A'
}];

export function Reports() {
  const [template, setTemplate] = useState<ReportTemplate>('weekly_attendance');
  const [format, setFormat] = useState<ReportFormat>('pdf');
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function toggleZone(id: string) {
    setSelectedZones((prev) =>
    prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]
    );
  }
  function handleFromChange(v: string) {
    setFrom(v);
    if (error) setError(null);
  }
  function handleToChange(v: string) {
    setTo(v);
    if (error) setError(null);
  }
  async function handleGenerate() {
    if (!from || !to || to < from) {
      setError('Please select a date range');
      return;
    }
    setError(null);
    setIsGenerating(true);
    try {
      const result = await generateReport({
        template,
        format,
        from,
        to,
        zoneIds: selectedZones
      });
      pushToast({
        title: 'Report downloaded successfully',
        description: `${result.rowCount} row${result.rowCount === 1 ? '' : 's'} · ${format.toUpperCase()}`,
        tone: 'success'
      });
    } catch (err) {
      if (err instanceof ReportError) {
        if (err.code === 'INVALID_RANGE') {
          setError(err.message);
        } else {
          pushToast({
            title: 'No data matches the selected filters',
            description: 'Try widening the date range or zones.',
            tone: 'error'
          });
        }
      } else {
        pushToast({
          title: 'Report failed to generate',
          description: 'Please try again.',
          tone: 'error'
        });
      }
    } finally {
      setIsGenerating(false);
    }
  }
  return (
    <div className="p-4 md:p-6 lg:p-7 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {SAVED.map((r) =>
        <ReportCard key={r.title} {...r} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <AttendanceRateChart />
        </div>
        <StatusMixChart />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <ViolationsByZoneChart />
        </div>

        {/* Generate Report panel */}
        <div className="bg-white border border-[#EFEAE2] rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-[#FFF1E0] ring-1 ring-[#db6c00]/25 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-[#db6c00]" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[#1A1410]">
                Generate Report
              </div>
              <div className="text-[11px] text-[#6B6258] font-mono">
                Custom export
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-mono">
                Template
              </div>
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value as ReportTemplate)}
                className="rep-input">
                
                <option value="weekly_attendance">Weekly Attendance</option>
                <option value="violation_summary">Violation Summary</option>
                <option value="zone_coverage">Zone Coverage</option>
                <option value="rider_performance">Rider Performance</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-mono">
                  From
                </div>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => handleFromChange(e.target.value)}
                  className={`rep-input ${error ? 'rep-input-error' : ''}`} />
                
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-mono">
                  To
                </div>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => handleToChange(e.target.value)}
                  className={`rep-input ${error ? 'rep-input-error' : ''}`} />
                
              </div>
            </div>

            {error &&
            <div className="flex items-start gap-1.5 text-[12px] text-[#DC2626]">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            }

            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-mono">
                Zones
              </div>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => {
                  const on = selectedZones.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      onClick={() => toggleZone(z.id)}
                      className={`px-2.5 py-1 rounded text-[11px] border transition-colors ${on ? 'bg-[#FFF1E0] border-[#db6c00]/40 text-[#b85a00]' : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410] hover:border-[#db6c00]/30'}`}>
                      
                      {z.name}
                    </button>);

                })}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-[#6B6258] mb-1.5 font-mono">
                Format
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['pdf', 'csv', 'xlsx'] as const).map((f) => {
                  const selected = format === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setFormat(f)}
                      className={`h-9 rounded-md border text-xs uppercase transition-colors ${selected ? 'bg-[#FFF1E0] border-[#db6c00] text-[#b85a00] font-bold' : 'bg-[#FAFAF7] border-[#EFEAE2] text-[#6B6258] hover:text-[#1A1410] hover:border-[#db6c00]/30'}`}>
                      
                      {f}
                    </button>);

                })}
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full h-10 rounded-md bg-[#db6c00] hover:bg-[#b85a00] text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#db6c00]/25 shadow-sm disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2">
              
              {isGenerating ?
              <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating…
                </> :

              'Generate'
              }
            </button>
          </div>

          <style>{`
            .rep-input {
              width: 100%;
              height: 36px;
              padding: 0 12px;
              background: #FAFAF7;
              border: 1px solid #EFEAE2;
              border-radius: 6px;
              color: #1A1410;
              font-size: 13px;
              outline: none;
              font-family: 'Geist Mono', monospace;
              transition: border-color 150ms ease, box-shadow 150ms ease;
            }
            .rep-input:focus {
              border-color: #db6c00;
              box-shadow: 0 0 0 3px rgba(219, 108, 0, 0.12);
            }
            .rep-input-error {
              border-color: #DC2626;
            }
            .rep-input-error:focus {
              border-color: #DC2626;
              box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
            }
            select.rep-input {
              appearance: none;
              padding-right: 32px;
              background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6258' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
              background-repeat: no-repeat;
              background-position: right 12px center;
            }
            input[type="date"].rep-input::-webkit-calendar-picker-indicator { opacity: 0.7; cursor: pointer; }
          `}</style>
        </div>
      </div>
    </div>);

}
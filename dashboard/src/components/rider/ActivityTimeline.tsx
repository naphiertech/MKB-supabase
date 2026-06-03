import {
  LogIn,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Coffee,
  Clock } from
'lucide-react';
import { motion } from 'framer-motion';
export type ActivityKind =
'time_in' |
'time_out' |
'geofence_ok' |
'geofence_alert' |
'break' |
'note';
export interface ActivityEvent {
  id: string;
  ts: string; // HH:MM (24h)
  kind: ActivityKind;
  label: string;
  detail?: string;
}
const KIND_META: Record<
  ActivityKind,
  {
    icon: typeof LogIn;
    tone: string;
    ring: string;
  }> =
{
  time_in: {
    icon: LogIn,
    tone: 'text-emerald-700',
    ring: 'bg-emerald-50 border-emerald-500/30'
  },
  time_out: {
    icon: LogOut,
    tone: 'text-[#db6c00]',
    ring: 'bg-[#FFF1E0] border-[#db6c00]/30'
  },
  geofence_ok: {
    icon: ShieldCheck,
    tone: 'text-emerald-700',
    ring: 'bg-emerald-50 border-emerald-500/20'
  },
  geofence_alert: {
    icon: ShieldAlert,
    tone: 'text-red-700',
    ring: 'bg-red-50 border-red-500/30'
  },
  break: {
    icon: Coffee,
    tone: 'text-amber-700',
    ring: 'bg-amber-50 border-amber-500/30'
  },
  note: {
    icon: Clock,
    tone: 'text-[#1A1410]',
    ring: 'bg-[#FAFAF7] border-[#EFEAE2]'
  }
};
interface ActivityTimelineProps {
  events: ActivityEvent[];
}
export function ActivityTimeline({ events }: ActivityTimelineProps) {
  return (
    <section className="rounded-2xl border border-[#EFEAE2] bg-white p-5 shadow-sm">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[#1A1410] font-semibold text-base">
            Today's Activity
          </h2>
          <p className="text-[11px] text-[#6B6258] font-mono mt-0.5">
            Live event log · synced from geofence + scanner
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#6B6258] font-mono font-semibold">
          {events.length} events
        </span>
      </header>

      {events.length === 0 ?
      <div className="text-sm text-[#6B6258] py-8 text-center">
          No activity recorded yet today.
        </div> :

      <ol className="relative pl-6 space-y-3">
          <span className="absolute left-[10px] top-1 bottom-1 w-px bg-[#EFEAE2]" />
          {events.map((e, index) => {
          const meta = KIND_META[e.kind];
          const Icon = meta.icon;
          return (
            <motion.li 
              key={e.id} 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1, duration: 0.3 }}
              className="relative flex items-start gap-3"
            >
                <span
                className={`absolute -left-6 mt-1 flex items-center justify-center w-5 h-5 rounded-full border ${meta.ring}`}>
                
                  <Icon className={`w-3 h-3 ${meta.tone}`} />
                </span>
                <span className="text-[12px] font-mono tabular-nums text-[#6B6258] w-14 shrink-0 mt-0.5">
                  {e.ts}
                </span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${meta.tone}`}>
                    {e.label}
                  </div>
                  {e.detail &&
                <div className="text-[11px] text-[#6B6258] mt-0.5">
                      {e.detail}
                    </div>
                }
                </div>
              </motion.li>);

        })}
        </ol>
      }
    </section>);

}

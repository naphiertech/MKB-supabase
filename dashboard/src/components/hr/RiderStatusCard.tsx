import React from 'react';
import { Clock } from 'lucide-react';
import type { Rider, Zone } from '../../services/mockData';
interface RiderStatusCardProps {
  rider: Rider;
  zone?: Zone;
  hoursToday: number | null;
  onClick?: (riderId: string) => void;
}
const RING: Record<Rider['status'], string> = {
  active: 'ring-emerald-500/80',
  idle: 'ring-amber-500/80',
  violation: 'ring-red-500/80',
  offline: 'ring-[#6B6258]/60'
};
const DOT: Record<Rider['status'], string> = {
  active: 'bg-emerald-500',
  idle: 'bg-amber-500',
  violation: 'bg-red-500',
  offline: 'bg-[#6B6258]'
};
const LABEL: Record<Rider['status'], string> = {
  active: 'Online',
  idle: 'Idle',
  violation: 'Violation',
  offline: 'Offline'
};
const STATUS_TEXT: Record<Rider['status'], string> = {
  active: 'text-emerald-700',
  idle: 'text-amber-700',
  violation: 'text-red-700',
  offline: 'text-[#6B6258]'
};
const LEFT_ACCENT: Record<Rider['status'], string> = {
  active: 'before:bg-emerald-500',
  idle: 'before:bg-amber-500',
  violation: 'before:bg-red-500',
  offline: 'before:bg-[#6B6258]'
};
export function RiderStatusCard({
  rider,
  zone,
  hoursToday,
  onClick
}: RiderStatusCardProps) {
  return (
    <button
      onClick={() => onClick?.(rider.id)}
      className={`group relative text-left bg-white border border-[#EFEAE2] hover:border-[#db6c00]/30 rounded-xl p-3.5 transition flex flex-col gap-3 ar-card-hover overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] ${LEFT_ACCENT[rider.status]}`}>
      
      <div className="flex items-center gap-3">
        <div className="relative">
          <img
            src={rider.avatar}
            alt=""
            className={`w-11 h-11 rounded-full bg-[#FAFAF7] ring-2 ${RING[rider.status]} ring-offset-2 ring-offset-white`} />
          
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full ${DOT[rider.status]} border-2 border-white`} />
          
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#1A1410] truncate">
            {rider.name}
          </div>
          <div className="text-[11px] text-[#6B6258] font-mono truncate">
            {rider.riderCode}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#FAFAF7] text-[#1A1410] border border-[#EFEAE2] truncate max-w-[60%]">
          {zone?.name ?? '—'}
        </span>
        <span
          className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold ${STATUS_TEXT[rider.status]}`}>
          
          <span className={`w-1.5 h-1.5 rounded-full ${DOT[rider.status]}`} />
          {LABEL[rider.status]}
        </span>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-[#EFEAE2]">
        <span className="inline-flex items-center gap-1 text-[11px] text-[#6B6258]">
          <Clock className="w-3 h-3" />
          Today
        </span>
        <span className="font-mono text-sm text-[#1A1410] tabular-nums font-semibold">
          {hoursToday != null && hoursToday > 0 ?
          `${hoursToday.toFixed(1)}h` :
          '—'}
        </span>
      </div>
    </button>);

}
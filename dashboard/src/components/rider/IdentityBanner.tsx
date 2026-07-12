import { MapPin, Sun, Sunrise, Moon, Sunset } from 'lucide-react';
import { motion } from 'framer-motion';

export type RiderOnlineStatus = 'online' | 'offline' | 'break';

interface IdentityBannerProps {
  name: string;
  zoneName: string;
  date: Date;
  onlineStatus: RiderOnlineStatus;
}

function greetingFor(date: Date) {
  const h = date.getHours();
  if (h < 5)
    return {
      text: 'Working late',
      Icon: Moon
    };
  if (h < 12)
    return {
      text: 'Good morning',
      Icon: Sunrise
    };
  if (h < 17)
    return {
      text: 'Good afternoon',
      Icon: Sun
    };
  if (h < 20)
    return {
      text: 'Good evening',
      Icon: Sunset
    };
  return {
    text: 'Good evening',
    Icon: Moon
  };
}

const ONLINE_THEME: Record<
  RiderOnlineStatus,
  {
    dot: string;
    ring: string;
    text: string;
    label: string;
    pulse: boolean;
  }
> = {
  online: {
    dot: 'bg-emerald-500',
    ring: 'border-emerald-500/30 bg-emerald-50',
    text: 'text-emerald-700',
    label: 'Online',
    pulse: true
  },
  break: {
    dot: 'bg-amber-500',
    ring: 'border-amber-500/30 bg-amber-50',
    text: 'text-amber-700',
    label: 'On Break',
    pulse: false
  },
  offline: {
    dot: 'bg-[#6B6258]',
    ring: 'border-[#EFEAE2] bg-[#FAFAF7]',
    text: 'text-[#6B6258]',
    label: 'Offline',
    pulse: false
  }
};

export function IdentityBanner({
  name,
  zoneName,
  date,
  onlineStatus
}: IdentityBannerProps) {
  const { text, Icon } = greetingFor(date);
  const firstName = name.split(' ')[0];
  const ot = ONLINE_THEME[onlineStatus];
  const dateStr = date.toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-2xl border border-[#EFEAE2] bg-gradient-to-br from-[#FFF1E0] via-white to-white p-5 sm:p-6 shadow-sm"
    >
      {/* Decorative accents */}
      <div className="pointer-events-none absolute -top-20 -right-16 w-72 h-72 rounded-full bg-[#db6c00]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-[#f59e0b]/8 blur-3xl" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#6B6258] font-mono font-semibold">
            <Icon className="w-3.5 h-3.5 text-[#db6c00]" />
            {text}
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-[#1A1410] truncate">
            {text}, <span className="text-[#db6c00]">{firstName}</span>!
          </h1>
          <p className="mt-1 text-sm text-[#6B6258] font-mono">{dateStr}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#EFEAE2] text-sm shadow-sm">
            <MapPin className="w-3.5 h-3.5 text-[#db6c00]" />
            <span className="text-[10px] uppercase tracking-[0.16em] text-[#6B6258] font-mono font-semibold">
              Zone
            </span>
            <span className="text-[#1A1410] font-semibold">{zoneName}</span>
          </span>

          <span
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border ${ot.ring} text-sm`}
          >
            <span className="relative flex w-2 h-2">
              {ot.pulse && (
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${ot.dot}`}
                />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${ot.dot}`} />
            </span>
            <span
              className={`${ot.text} text-[11px] uppercase tracking-[0.16em] font-semibold`}
            >
              {ot.label}
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}

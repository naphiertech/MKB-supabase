import { ComponentType, useEffect } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

function CountUp({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest));
  
  useEffect(() => {
    const controls = animate(count, value, { duration: 0.8, ease: "easeOut" });
    return controls.stop;
  }, [value, count]);

  return <motion.span>{rounded}</motion.span>;
}
interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon: ComponentType<{
    className?: string;
  }>;
  accent?: 'blue' | 'green' | 'red' | 'amber';
  trend?: {
    direction: 'up' | 'down' | 'flat';
    value: string;
    positive?: boolean;
  };
  spark?: number[];
  pulse?: boolean;
  index?: number;
}
const ACCENT: Record<
  NonNullable<StatCardProps['accent']>,
  {
    ring: string;
    icon: string;
    bg: string;
    topBar: string;
    sparkBar: string;
  }> =
{
  blue: {
    ring: 'ring-[#db6c00]/25',
    icon: 'text-[#db6c00]',
    bg: 'bg-[#FFF1E0]',
    topBar: 'bg-[#db6c00]',
    sparkBar: 'bg-[#db6c00]/70'
  },
  green: {
    ring: 'ring-emerald-500/25',
    icon: 'text-emerald-600',
    bg: 'bg-emerald-50',
    topBar: 'bg-emerald-500',
    sparkBar: 'bg-emerald-500/70'
  },
  red: {
    ring: 'ring-red-500/25',
    icon: 'text-red-600',
    bg: 'bg-red-50',
    topBar: 'bg-red-500',
    sparkBar: 'bg-red-500/70'
  },
  amber: {
    ring: 'ring-amber-500/25',
    icon: 'text-amber-600',
    bg: 'bg-amber-50',
    topBar: 'bg-amber-500',
    sparkBar: 'bg-amber-500/70'
  }
};
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'blue',
  trend,
  spark,
  pulse,
  index = 0
}: StatCardProps) {
  const a = ACCENT[accent];
  const maxSpark = spark && spark.length ? Math.max(...spark) : 1;
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileHover={{ y: -2 }}
      className="relative bg-white border border-[#EFEAE2] rounded-xl p-4 sm:p-5 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
    >
      {/* top accent edge */}
      <div className={`absolute top-0 left-0 right-0 h-[2px] ${a.topBar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#6B6258] font-semibold">
              {label}
            </span>
            {pulse &&
            <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
            }
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-semibold text-[#1A1410] leading-none tracking-tight tabular-nums">
            {typeof value === 'number' ? <CountUp value={value} /> : value}
          </div>
          {sub && <div className="mt-2 text-xs text-[#6B6258]">{sub}</div>}
        </div>
        <div
          className={`w-9 h-9 rounded-lg ${a.bg} ring-1 ${a.ring} flex items-center justify-center`}>
          
          <Icon className={`w-[18px] h-[18px] ${a.icon}`} />
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        {trend ?
        <div
          className={`inline-flex items-center gap-1 text-xs font-semibold ${trend.positive === false ? 'text-red-600' : trend.direction === 'flat' ? 'text-[#6B6258]' : 'text-emerald-600'}`}>
          
            {trend.direction === 'up' && <ArrowUp className="w-3 h-3" />}
            {trend.direction === 'down' && <ArrowDown className="w-3 h-3" />}
            <span className="font-mono">{trend.value}</span>
          </div> :

        <span />
        }

        {spark && spark.length > 0 &&
        <div className="flex items-end gap-[3px] h-7">
            {spark.map((v, i) =>
          <div
            key={i}
            className={`w-[3px] rounded-sm ${a.sparkBar}`}
            style={{
              height: `${Math.max(8, v / maxSpark * 100)}%`
            }} />

          )}
          </div>
        }
      </div>
    </motion.div>);

}

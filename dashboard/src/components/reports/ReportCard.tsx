import { ComponentType } from 'react';
import { FileText, ArrowUpRight } from 'lucide-react';
interface ReportCardProps {
  title: string;
  description: string;
  meta: string;
  icon: ComponentType<{
    className?: string;
  }>;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}
export function ReportCard({
  title,
  description,
  meta,
  icon: Icon,
  accent,
  active,
  onClick
}: ReportCardProps) {
  return (
    <button 
      onClick={onClick}
      className={`group text-left bg-white border rounded-xl p-5 transition relative overflow-hidden ar-card-hover cursor-pointer w-full ${
        active 
          ? 'border-primary ring-2 ring-primary/20 shadow-[0_4px_16px_rgba(219,108,0,0.08)]' 
          : 'border-border hover:border-primary/30 shadow-sm'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{
            background: `${accent}18`,
            color: accent,
            boxShadow: `inset 0 0 0 1px ${accent}38`
          }}>
          
          <Icon className="w-5 h-5" />
        </div>
        <ArrowUpRight className={`w-4 h-4 transition ${active ? 'text-primary translate-x-0.5 -translate-y-0.5' : 'text-muted-foreground group-hover:text-primary group-hover:-translate-y-0.5 group-hover:translate-x-0.5'}`} />
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
        {description}
      </div>
      <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
        <FileText className="w-3 h-3" />
        {meta}
      </div>
    </button>);

}

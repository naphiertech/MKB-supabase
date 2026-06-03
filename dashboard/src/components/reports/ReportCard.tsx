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
}
export function ReportCard({
  title,
  description,
  meta,
  icon: Icon,
  accent
}: ReportCardProps) {
  return (
    <button className="group text-left bg-white border border-[#EFEAE2] hover:border-[#db6c00]/30 rounded-xl p-5 transition relative overflow-hidden ar-card-hover">
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
        <ArrowUpRight className="w-4 h-4 text-[#6B6258] group-hover:text-[#db6c00] group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition" />
      </div>
      <div className="text-sm font-semibold text-[#1A1410]">{title}</div>
      <div className="text-xs text-[#6B6258] mt-1 leading-relaxed">
        {description}
      </div>
      <div className="mt-4 pt-3 border-t border-[#EFEAE2] flex items-center gap-2 text-[11px] text-[#6B6258] font-mono">
        <FileText className="w-3 h-3" />
        {meta}
      </div>
    </button>);

}

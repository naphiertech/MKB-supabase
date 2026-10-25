import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '../../lib/pagination';

interface TablePaginationProps {
  from: number;
  to: number;
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  noun?: string;
}

const NAV_BUTTON =
  'inline-flex items-center justify-center w-7 h-7 rounded-md border border-border bg-white text-muted-foreground transition cursor-pointer hover:text-foreground hover:border-primary/30 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted-foreground disabled:hover:border-border';

export function TablePagination({
  from,
  to,
  total,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  noun = 'entries',
}: TablePaginationProps) {
  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-panel-bg/60">
      <div className="text-[11px] text-muted-foreground font-mono tabular-nums">
        {from}–{to} of {total} {noun}
      </div>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            Rows
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-7 rounded-md border border-border bg-white px-1.5 text-xs text-foreground outline-none focus:border-primary"
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            className={NAV_BUTTON}
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] text-muted-foreground font-mono tabular-nums min-w-[64px] text-center">
            Page {page} / {pageCount}
          </span>
          <button
            type="button"
            className={NAV_BUTTON}
            onClick={() => onPageChange(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50] as const;

export interface PageSlice<T> {
  items: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

/** Returns one page of `rows`. `page` is 1-based and clamped into the valid range. */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): PageSlice<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);
  return {
    items,
    page: safePage,
    pageCount,
    from: total === 0 ? 0 : start + 1,
    to: start + items.length,
    total,
  };
}

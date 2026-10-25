import { useMemo, useState } from 'react';
import { paginate, type PageSlice } from '../lib/pagination';

/**
 * Pages `rows`. Changing `resetKey` (a string describing the active filters) returns to page 1
 * without an effect, so a filter change never leaves the table on a stale page.
 */
export function usePagedRows<T>(rows: readonly T[], resetKey: string, initialPageSize = 10) {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [requested, setRequested] = useState({ page: 1, key: resetKey });
  const page = requested.key === resetKey ? requested.page : 1;
  const slice: PageSlice<T> = useMemo(() => paginate(rows, page, pageSize), [rows, page, pageSize]);

  return {
    ...slice,
    pageSize,
    setPage: (next: number) => setRequested({ page: next, key: resetKey }),
    setPageSize: (next: number) => {
      setPageSizeState(next);
      setRequested({ page: 1, key: resetKey });
    },
  };
}

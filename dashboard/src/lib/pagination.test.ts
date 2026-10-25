import { describe, expect, it } from 'vitest';
import { paginate } from './pagination';

const rows = Array.from({ length: 160 }, (_, i) => i + 1);

describe('paginate', () => {
  it('slices 160 rows into bounded pages', () => {
    const first = paginate(rows, 1, 25);
    expect(first.items).toHaveLength(25);
    expect(first).toMatchObject({ page: 1, pageCount: 7, from: 1, to: 25, total: 160 });

    const last = paginate(rows, 7, 25);
    expect(last.items).toEqual(rows.slice(150));
    expect(last).toMatchObject({ page: 7, from: 151, to: 160 });
  });

  it('clamps an out-of-range page after the row count shrinks', () => {
    const slice = paginate([1, 2, 3], 9, 10);
    expect(slice).toMatchObject({ page: 1, pageCount: 1, from: 1, to: 3, total: 3 });
  });

  it('reports an empty list as 0 of 0 on page 1', () => {
    expect(paginate([], 3, 10)).toMatchObject({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

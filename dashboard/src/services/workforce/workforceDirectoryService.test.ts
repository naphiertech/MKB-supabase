import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { getRiderWorkforceDirectory } from './workforceDirectoryService';

const rows = [
  { id: 'active', name: 'Active Rider', mkb_id: 'MKB-1', zone_id: 'z1', zone_name: 'Zone 1', employment_status: 'active', archive_effective_date: null, restored_at: null },
  { id: 'archived', name: 'Archived Rider', mkb_id: 'MKB-2', zone_id: 'z2', zone_name: 'Zone 2', employment_status: 'archived', archive_effective_date: '2026-08-10', restored_at: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: rows, error: null });
});

describe('explicit workforce directory scopes', () => {
  it('returns only current active employment for active scope', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'active' })).map((row) => row.id)).toEqual(['active']);
  });

  it('retains archived identities for historical scope', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'historical' })).map((row) => row.id)).toEqual(['active', 'archived']);
  });

  it('uses effective-date employment for operational work-date scope', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'employed_on_date', date: '2026-08-09' })).map((row) => row.id)).toEqual(['active', 'archived']);
    expect((await getRiderWorkforceDirectory({ scope: 'employed_on_date', date: '2026-08-10' })).map((row) => row.id)).toEqual(['active']);
  });

  it('requires a business date for employed-on-date scope', async () => {
    await expect(getRiderWorkforceDirectory({ scope: 'employed_on_date' })).rejects.toThrow('business date');
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import { getRiderWorkforceDirectory } from './workforceDirectoryService';

const rows = [
  { id: 'active', name: 'Active Rider', mkb_id: 'MKB-1', zone_id: 'z1', zone_name: 'Zone 1', hub_id: 'hub-1', employment_status: 'active', archive_effective_date: null, restored_at: null },
  { id: 'active-hub-2', name: 'Other Hub Rider', mkb_id: 'MKB-3', zone_id: 'z3', zone_name: 'Zone 3', hub_id: 'hub-2', employment_status: 'active', archive_effective_date: null, restored_at: null },
  { id: 'archived', name: 'Archived Rider', mkb_id: 'MKB-2', zone_id: 'z2', zone_name: 'Zone 2', hub_id: 'hub-1', employment_status: 'archived', archive_effective_date: '2026-08-10', restored_at: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: rows, error: null });
});

describe('explicit workforce directory scopes', () => {
  it('returns only current active employment for active scope', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'active' })).map((row) => row.id)).toEqual(['active', 'active-hub-2']);
  });

  it('scopes results to explicit hubId when provided', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'active', hubId: 'hub-1' })).map((row) => row.id)).toEqual(['active']);
    expect((await getRiderWorkforceDirectory({ scope: 'active', hubId: 'hub-2' })).map((row) => row.id)).toEqual(['active-hub-2']);
  });

  it('retains archived identities for historical scope', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'historical' })).map((row) => row.id)).toEqual(['active', 'active-hub-2', 'archived']);
  });

  it('uses effective-date employment for operational work-date scope', async () => {
    expect((await getRiderWorkforceDirectory({ scope: 'employed_on_date', date: '2026-08-09' })).map((row) => row.id)).toEqual(['active', 'active-hub-2', 'archived']);
    expect((await getRiderWorkforceDirectory({ scope: 'employed_on_date', date: '2026-08-10' })).map((row) => row.id)).toEqual(['active', 'active-hub-2']);
  });

  it('requires a business date for employed-on-date scope', async () => {
    await expect(getRiderWorkforceDirectory({ scope: 'employed_on_date' })).rejects.toThrow('business date');
  });
});

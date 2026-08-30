import { describe, it, expect, vi } from 'vitest';
import { listExternalRiderMappings, saveExternalRiderMapping } from './externalRiderMappingService';

vi.mock('../../lib/supabaseClient', () => {
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockUpsert = vi.fn();
  const mockSingle = vi.fn();

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'external_rider_mappings') {
          return {
            select: mockSelect.mockReturnValue({
              eq: mockEq.mockResolvedValue({
                data: [
                  {
                    id: 'm1',
                    source_system: 'spx_fms',
                    external_driver_id: '410740',
                    external_display_name: 'Shamera Habibun Asali',
                    rider_id: 'r1',
                    created_by: 'u1',
                    created_at: '2026-09-01T00:00:00Z',
                    updated_at: '2026-09-01T00:00:00Z',
                    riders: {
                      id: 'r1',
                      name: 'Shamera Habibun Asali',
                      mkb_id: 'MKB-001',
                      hub_id: 'h1',
                      status: 'offline',
                    },
                  },
                ],
                error: null,
              }),
            }),
            upsert: mockUpsert.mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: mockSingle.mockResolvedValue({
                  data: {
                    id: 'm1',
                    source_system: 'spx_fms',
                    external_driver_id: '410740',
                    external_display_name: 'Shamera Habibun Asali',
                    rider_id: 'r1',
                    created_by: 'u1',
                    created_at: '2026-09-01T00:00:00Z',
                    updated_at: '2026-09-01T00:00:00Z',
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {};
      }),
    },
  };
});

describe('externalRiderMappingService', () => {
  it('loads external rider mappings mapped by driver ID', async () => {
    const mappings = await listExternalRiderMappings('spx_fms');
    expect(mappings['410740']).toBeDefined();
    expect(mappings['410740'].rider_id).toBe('r1');
    expect(mappings['410740'].rider?.name).toBe('Shamera Habibun Asali');
  });

  it('saves an external rider mapping', async () => {
    const saved = await saveExternalRiderMapping({
      external_driver_id: '410740',
      external_display_name: 'Shamera Habibun Asali',
      rider_id: 'r1',
    });
    expect(saved.external_driver_id).toBe('410740');
    expect(saved.rider_id).toBe('r1');
  });
});

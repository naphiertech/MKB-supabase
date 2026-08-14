import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('../lib/supabaseClient', () => ({ supabase: { rpc: mocks.rpc } }));

import {
  deployRiderTemporarily,
  endRiderDeploymentEarly,
  extendRiderDeployment,
  getRiderAssignmentWorkspace,
  transferRiderPermanently,
} from './riderAssignmentService';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
});

describe('Rider assignment RPC boundary', () => {
  it('loads the server-authorized workspace with optional hub and rider focus', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { riders: [], history: [] }, error: null });

    await getRiderAssignmentWorkspace({ hubId: 'hub-1', riderId: 'rider-1' });

    expect(mocks.rpc).toHaveBeenCalledWith('get_rider_assignment_workspace', {
      p_hub_id: 'hub-1',
      p_rider_id: 'rider-1',
    });
  });

  it('uses one atomic RPC for permanent transfer', async () => {
    await transferRiderPermanently({
      riderId: 'rider-1', targetHubId: 'hub-2', targetZoneId: 'zone-2',
      effectiveDate: '2026-08-13', reason: 'Permanent route reassignment',
    });

    expect(mocks.rpc).toHaveBeenCalledWith('transfer_rider_permanently', {
      p_rider_id: 'rider-1', p_target_hub_id: 'hub-2', p_target_zone_id: 'zone-2',
      p_effective_date: '2026-08-13', p_reason: 'Permanent route reassignment',
    });
  });

  it('uses controlled RPCs for deployment lifecycle changes', async () => {
    await deployRiderTemporarily({
      riderId: 'rider-1', targetHubId: 'hub-2', targetZoneId: 'zone-2',
      startDate: '2026-08-13', endDate: '2026-08-20', reason: 'Coverage support',
    });
    await extendRiderDeployment('assignment-1', '2026-08-27', 'Extended coverage');
    await endRiderDeploymentEarly('assignment-1', 'Coverage completed');

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'deploy_rider_temporarily', {
      p_rider_id: 'rider-1', p_target_hub_id: 'hub-2', p_target_zone_id: 'zone-2',
      p_start_date: '2026-08-13', p_end_date: '2026-08-20', p_reason: 'Coverage support',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'extend_rider_deployment', {
      p_assignment_id: 'assignment-1', p_new_end_date: '2026-08-27', p_reason: 'Extended coverage',
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, 'end_rider_deployment_early', {
      p_assignment_id: 'assignment-1', p_reason: 'Coverage completed',
    });
  });

  it('surfaces the authoritative database reason', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Resolve the open attendance session first.' } });

    await expect(transferRiderPermanently({
      riderId: 'rider-1', targetHubId: 'hub-2', targetZoneId: 'zone-2',
      effectiveDate: '2026-08-13', reason: 'Transfer',
    })).rejects.toThrow('Resolve the open attendance session first.');
  });
});

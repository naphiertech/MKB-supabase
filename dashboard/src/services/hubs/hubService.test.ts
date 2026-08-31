import { describe, expect, it, vi, beforeEach } from 'vitest';
import { supabase } from '../../lib/supabaseClient';
import {
  createHub,
  getHubManagementSnapshot,
  listAccessibleHubs,
  updateHub,
} from './hubService';

vi.mock('../../lib/supabaseClient', () => {
  return {
    supabase: {
      from: vi.fn(),
      rpc: vi.fn(),
    },
  };
});

describe('hubService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listAccessibleHubs', () => {
    it('queries active hubs with geofence columns and maps row data', async () => {
      const orderMock = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'hub-1',
            name: 'Talon-Talon Hub',
            description: 'Main southern hub',
            active: true,
            latitude: 6.9123456,
            longitude: 122.0812345,
            attendance_radius_m: 120,
            created_at: '2026-08-01T00:00:00Z',
            updated_at: '2026-08-10T00:00:00Z',
          },
          {
            id: 'hub-2',
            name: 'Ayala Hub',
            description: null,
            active: true,
            latitude: null,
            longitude: null,
            attendance_radius_m: null,
            created_at: '2026-08-01T00:00:00Z',
            updated_at: '2026-08-10T00:00:00Z',
          },
        ],
        error: null,
      });
      const eqMock = vi.fn().mockReturnValue({ order: orderMock });
      const selectMock = vi.fn().mockReturnValue({ eq: eqMock, order: orderMock });
      vi.mocked(supabase.from).mockReturnValue({ select: selectMock } as unknown as ReturnType<typeof supabase.from>);

      const result = await listAccessibleHubs({ activeOnly: true });

      expect(supabase.from).toHaveBeenCalledWith('hubs');
      expect(selectMock).toHaveBeenCalledWith(
        'id, name, description, active, latitude, longitude, attendance_radius_m, created_at, updated_at',
      );
      expect(eqMock).toHaveBeenCalledWith('active', true);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'hub-1',
        name: 'Talon-Talon Hub',
        description: 'Main southern hub',
        active: true,
        latitude: 6.9123456,
        longitude: 122.0812345,
        attendanceRadiusM: 120,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-10T00:00:00Z',
      });
      expect(result[1]).toEqual({
        id: 'hub-2',
        name: 'Ayala Hub',
        description: null,
        active: true,
        latitude: null,
        longitude: null,
        attendanceRadiusM: null,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-10T00:00:00Z',
      });
    });
  });

  describe('createHub', () => {
    it('inserts hub with name, description, and required geofence fields', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'hub-new',
          name: 'Guiwan Hub',
          description: 'East facility',
          active: true,
          latitude: 6.9254321,
          longitude: 122.0987654,
          attendance_radius_m: 100,
          created_at: '2026-08-30T00:00:00Z',
          updated_at: '2026-08-30T00:00:00Z',
        },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const insertMock = vi.fn().mockReturnValue({ select: selectMock });
      vi.mocked(supabase.from).mockReturnValue({ insert: insertMock } as unknown as ReturnType<typeof supabase.from>);

      const result = await createHub({
        name: '  Guiwan Hub  ',
        description: '  East facility  ',
        latitude: 6.9254321,
        longitude: 122.0987654,
        attendanceRadiusM: 100,
      });

      expect(insertMock).toHaveBeenCalledWith({
        name: 'Guiwan Hub',
        description: 'East facility',
        latitude: 6.9254321,
        longitude: 122.0987654,
        attendance_radius_m: 100,
      });
      expect(result.latitude).toBe(6.9254321);
      expect(result.longitude).toBe(122.0987654);
      expect(result.attendanceRadiusM).toBe(100);
    });
  });

  describe('updateHub', () => {
    it('updates geofence coordinates and radius alongside metadata', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'hub-1',
          name: 'Updated Talon Hub',
          description: 'New desc',
          active: true,
          latitude: 6.915,
          longitude: 122.085,
          attendance_radius_m: 150,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-30T12:00:00Z',
        },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqMock = vi.fn().mockReturnValue({ select: selectMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as unknown as ReturnType<typeof supabase.from>);

      const result = await updateHub('hub-1', {
        name: 'Updated Talon Hub',
        description: 'New desc',
        latitude: 6.915,
        longitude: 122.085,
        attendanceRadiusM: 150,
      });

      expect(updateMock).toHaveBeenCalledWith({
        name: 'Updated Talon Hub',
        description: 'New desc',
        latitude: 6.915,
        longitude: 122.085,
        attendance_radius_m: 150,
      });
      expect(eqMock).toHaveBeenCalledWith('id', 'hub-1');
      expect(result.attendanceRadiusM).toBe(150);
    });

    it('allows updating legacy metadata without touching geofence', async () => {
      const singleMock = vi.fn().mockResolvedValue({
        data: {
          id: 'hub-legacy',
          name: 'Renamed Legacy Hub',
          description: null,
          active: false,
          latitude: null,
          longitude: null,
          attendance_radius_m: null,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-30T12:00:00Z',
        },
        error: null,
      });
      const selectMock = vi.fn().mockReturnValue({ single: singleMock });
      const eqMock = vi.fn().mockReturnValue({ select: selectMock });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      vi.mocked(supabase.from).mockReturnValue({ update: updateMock } as unknown as ReturnType<typeof supabase.from>);

      const result = await updateHub('hub-legacy', {
        name: 'Renamed Legacy Hub',
        active: false,
      });

      expect(updateMock).toHaveBeenCalledWith({
        name: 'Renamed Legacy Hub',
        active: false,
      });
      expect(result.latitude).toBeNull();
      expect(result.attendanceRadiusM).toBeNull();
    });
  });

  describe('getHubManagementSnapshot', () => {
    it('loads hubs and zones with geofence fields mapped', async () => {
      vi.mocked(supabase.rpc).mockResolvedValue({
        data: {
          hubs: [
            {
              id: 'h-1',
              name: 'Talon-Talon',
              description: 'South hub',
              active: true,
              latitude: 6.92,
              longitude: 122.08,
              attendance_radius_m: 80,
              created_at: '2026-08-01T00:00:00Z',
              updated_at: '2026-08-10T00:00:00Z',
              zone_count: 3,
              rider_count: 12,
              staff_count: 2,
            },
          ],
          zones: [
            {
              id: 'z-1',
              name: 'Zone Alpha',
              status: 'active',
              hub_id: 'h-1',
              rider_count: 5,
            },
          ],
        },
        error: null,
      } as never);

      const snapshot = await getHubManagementSnapshot();

      expect(supabase.rpc).toHaveBeenCalledWith('get_hub_management_snapshot');
      expect(snapshot.hubs[0]).toEqual({
        id: 'h-1',
        name: 'Talon-Talon',
        description: 'South hub',
        active: true,
        latitude: 6.92,
        longitude: 122.08,
        attendanceRadiusM: 80,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-10T00:00:00Z',
        zoneCount: 3,
        riderCount: 12,
        staffCount: 2,
      });
    });
  });
});

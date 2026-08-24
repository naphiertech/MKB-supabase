import { supabase } from '../lib/supabaseClient';
import { isEmploymentActiveOnDate } from '../lib/workforce/employmentLifecycle';
import type { EmploymentStatus } from './types';
import { getSelectedHubId } from '../lib/hubWorkspaceState';

export type WorkforceScope = 'active' | 'historical' | 'employed_on_date';

export interface WorkforceDirectoryEntry {
  id: string;
  name: string;
  mkb_id: string;
  zone_id?: string;
  zones: { name: string } | null;
  employmentStatus: EmploymentStatus;
  archiveEffectiveDate: string | null;
  restoredAt: string | null;
  hubId: string;
}

interface WorkforceDirectoryRow {
  id: string;
  name: string;
  mkb_id: string;
  zone_id: string | null;
  zone_name: string | null;
  employment_status: EmploymentStatus;
  archive_effective_date: string | null;
  restored_at: string | null;
  hub_id: string;
}

export async function getRiderWorkforceDirectory(options: {
  scope: WorkforceScope;
  date?: string;
}): Promise<WorkforceDirectoryEntry[]> {
  if (options.scope === 'employed_on_date' && !options.date) {
    throw new Error('A business date is required for employed-on-date workforce lookup.');
  }
  const { data, error } = await supabase.rpc('get_rider_workforce_directory');
  if (error) throw error;

  const selectedHubId = getSelectedHubId();
  return ((data || []) as WorkforceDirectoryRow[])
    .filter((row) => !selectedHubId || row.hub_id === selectedHubId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      mkb_id: row.mkb_id,
      zone_id: row.zone_id || undefined,
      zones: row.zone_name ? { name: row.zone_name } : null,
      employmentStatus: row.employment_status,
      archiveEffectiveDate: row.archive_effective_date,
      restoredAt: row.restored_at,
      hubId: row.hub_id,
    }))
    .filter((row) => {
      if (options.scope === 'historical') return true;
      if (options.scope === 'active') return row.employmentStatus === 'active';
      return isEmploymentActiveOnDate(row, options.date!);
    });
}

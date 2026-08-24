import { supabase } from '../../lib/supabaseClient';
import type { AttendanceLog } from '../types';

export interface AttendanceAssignmentHistoryRow {
  rider_id: string;
  assignment_type: 'permanent_transfer' | 'temporary_deployment';
  from_zone_id: string | null;
  target_zone_id: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'completed' | 'ended_early' | 'expired';
  ended_at: string | null;
  from_zone: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  target_zone: { id: string; name: string } | Array<{ id: string; name: string }> | null;
}

function relatedZone(value: AttendanceAssignmentHistoryRow['from_zone']): { id: string; name: string } | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function manilaDate(value: string): string {
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function assignmentZone(
  row: AttendanceAssignmentHistoryRow,
  side: 'from' | 'target',
): { zoneId: string; zoneName: string } | null {
  const relation = relatedZone(side === 'from' ? row.from_zone : row.target_zone);
  const zoneId = side === 'from' ? row.from_zone_id : row.target_zone_id;
  return zoneId ? { zoneId, zoneName: relation?.name ?? 'Unknown Zone' } : null;
}

export function resolveHistoricalAttendanceZone(
  log: AttendanceLog,
  assignments: AttendanceAssignmentHistoryRow[],
): Pick<AttendanceLog, 'zoneId' | 'zoneName' | 'zoneContext'> {
  const riderAssignments = assignments
    .filter(row => row.rider_id === log.riderId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (riderAssignments.length === 0) {
    return { zoneId: log.zoneId, zoneName: log.zoneName, zoneContext: 'current_assignment' };
  }

  const deployments = riderAssignments.filter(row => row.assignment_type === 'temporary_deployment');
  const deployment = [...deployments].reverse().find(row => {
    const effectiveEnd = row.status === 'ended_early' && row.ended_at ? manilaDate(row.ended_at) : row.end_date;
    return row.start_date <= log.date && (!effectiveEnd || log.date <= effectiveEnd);
  });
  if (deployment) {
    const zone = assignmentZone(deployment, 'target');
    if (zone) return { ...zone, zoneContext: 'assignment_history' };
  }

  const transfers = riderAssignments.filter(row => row.assignment_type === 'permanent_transfer');
  const latestTransfer = [...transfers].reverse().find(row => row.start_date <= log.date);
  if (latestTransfer) {
    const zone = assignmentZone(latestTransfer, 'target');
    if (zone) return { ...zone, zoneContext: 'assignment_history' };
  }

  const nextTransfer = transfers.find(row => row.start_date > log.date);
  if (nextTransfer) {
    const zone = assignmentZone(nextTransfer, 'from');
    if (zone) return { ...zone, zoneContext: 'assignment_history' };
  }

  const homeReference = [...deployments].reverse().find(row => row.from_zone_id);
  if (homeReference) {
    const zone = assignmentZone(homeReference, 'from');
    if (zone) return { ...zone, zoneContext: 'assignment_history' };
  }

  return { zoneId: log.zoneId, zoneName: log.zoneName, zoneContext: 'current_assignment' };
}

export async function enrichAttendanceWithHistoricalZones(logs: AttendanceLog[]): Promise<AttendanceLog[]> {
  const riderIds = [...new Set(logs.map(log => log.riderId))];
  if (riderIds.length === 0) return logs;
  const { data, error } = await supabase
    .from('rider_assignments')
    .select(`
      rider_id, assignment_type, from_zone_id, target_zone_id, start_date, end_date, status, ended_at,
      from_zone:zones!rider_assignments_from_zone_id_fkey(id, name),
      target_zone:zones!rider_assignments_target_zone_id_fkey(id, name)
    `)
    .in('rider_id', riderIds)
    .order('start_date', { ascending: true });
  if (error) throw error;
  const assignments = (data ?? []) as unknown as AttendanceAssignmentHistoryRow[];
  return logs.map(log => ({ ...log, ...resolveHistoricalAttendanceZone(log, assignments) }));
}

import { supabase } from '../lib/supabaseClient';

export interface AttendancePolicyConfiguration {
  id: string;
  late_threshold: string; // "08:15:00"
  effective_from: string; // "YYYY-MM-DD"
  effective_until: string | null; // "YYYY-MM-DD" or null
  active: boolean;
  change_reason: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendancePolicyAudit {
  id: string;
  policy_configuration_id: string;
  action: 'INSERT' | 'UPDATE' | 'DEACTIVATE';
  changed_by: string | null;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  change_reason: string;
}

export interface AttendancePolicyAuditWithPerson extends AttendancePolicyAudit {
  changedByName: string;
}

export interface AttendancePolicyInput {
  lateThreshold: string; // "08:15" or "08:15:00"
  effectiveFrom: string; // "YYYY-MM-DD"
  reason: string;
}

export const DEFAULT_LATE_THRESHOLD = '08:15:00';

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + amount);
  return localDateString(value);
}

/**
 * Standardizes a time string to "HH:mm:ss" format.
 * Accepts "08:15", "8:15", "08:15:00", or Date ISO strings.
 */
export function normalizeTimeString(timeStr: string): string {
  const clean = timeStr.trim();
  if (clean.includes('T')) {
    // Parse ISO timestamp at Manila timezone (+08:00)
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const phTime = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
      const h = String(phTime.getHours()).padStart(2, '0');
      const m = String(phTime.getMinutes()).padStart(2, '0');
      const s = String(phTime.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }
  }

  const parts = clean.split(':');
  if (parts.length >= 2) {
    const h = String(Number(parts[0])).padStart(2, '0');
    const m = String(Number(parts[1])).padStart(2, '0');
    const s = parts[2] ? String(Number(parts[2])).padStart(2, '0') : '00';
    return `${h}:${m}:${s}`;
  }
  return clean;
}

/**
 * Formats "08:15:00" or "08:15" to a human-readable 12-hour string (e.g. "8:15 AM").
 */
export function formatTime12Hour(timeStr: string): string {
  const norm = normalizeTimeString(timeStr);
  const [hStr, mStr] = norm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return timeStr;

  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Pure comparison function: Checks if timeA is strictly after timeB.
 * Time strings should be in "HH:mm:ss" or "HH:mm" format.
 */
export function isTimePastThreshold(timeToCheck: string, threshold: string): boolean {
  const normTime = normalizeTimeString(timeToCheck);
  const normThreshold = normalizeTimeString(threshold);

  const [tH, tM, tS = 0] = normTime.split(':').map(Number);
  const [thH, thM, thS = 0] = normThreshold.split(':').map(Number);

  const timeSeconds = tH * 3600 + tM * 60 + tS;
  const thresholdSeconds = thH * 3600 + thM * 60 + thS;

  return timeSeconds > thresholdSeconds;
}

/**
 * Validates user input when creating/scheduling an attendance policy.
 */
export function validateAttendancePolicyInput(
  input: AttendancePolicyInput,
  today = localDateString()
): string | null {
  const normThreshold = normalizeTimeString(input.lateThreshold);
  const [hStr, mStr] = normThreshold.split(':');
  const h = Number(hStr);
  const m = Number(mStr);

  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return 'Please provide a valid late threshold time (e.g. 08:15 AM).';
  }

  if (!input.effectiveFrom || input.effectiveFrom <= today) {
    return 'Effective date must be a future date.';
  }

  if (!input.reason || !input.reason.trim()) {
    return 'A reason is required for every policy change.';
  }

  return null;
}

/**
 * Resolves the effective policy configuration for a given attendance date.
 * If multiple policies match, it selects the active policy whose [effective_from, effective_until]
 * range encompasses targetDate.
 */
export function getEffectiveAttendancePolicy(
  configurations: AttendancePolicyConfiguration[],
  targetDate = localDateString()
): AttendancePolicyConfiguration | null {
  const activeConfigs = configurations.filter((c) => c.active);

  return (
    activeConfigs.find(
      (c) =>
        c.effective_from <= targetDate &&
        (!c.effective_until || c.effective_until >= targetDate)
    ) ?? null
  );
}

/**
 * Returns the effective late threshold string ("HH:mm:ss") for targetDate,
 * falling back to DEFAULT_LATE_THRESHOLD ("08:15:00") if unconfigured.
 */
export function resolveLateThreshold(
  configurations: AttendancePolicyConfiguration[],
  targetDate = localDateString()
): string {
  const policy = getEffectiveAttendancePolicy(configurations, targetDate);
  return policy?.late_threshold || DEFAULT_LATE_THRESHOLD;
}

/**
 * Authoritative punctuality evaluator:
 * Determines if a time_in on targetDate is considered 'late'.
 */
export function isAttendanceLate(
  timeIn: string | Date | null | undefined,
  targetDate: string,
  configurations?: AttendancePolicyConfiguration[]
): boolean {
  if (!timeIn) return false;

  const threshold = configurations
    ? resolveLateThreshold(configurations, targetDate)
    : DEFAULT_LATE_THRESHOLD;

  const timeString = typeof timeIn === 'string' ? timeIn : timeIn.toISOString();
  return isTimePastThreshold(timeString, threshold);
}

/**
 * Fetches all attendance policy configurations sorted by effective_from descending.
 */
export async function listAttendancePolicyConfigurations(): Promise<AttendancePolicyConfiguration[]> {
  const { data, error } = await supabase
    .from('attendance_policy_configurations')
    .select('*')
    .order('effective_from', { ascending: false });

  if (error) {
    console.error('Error fetching attendance_policy_configurations:', error);
    throw error;
  }
  return (data as AttendancePolicyConfiguration[]) ?? [];
}

/**
 * Fetches audit logs for attendance policy modifications.
 */
export async function listAttendancePolicyAudit(): Promise<AttendancePolicyAuditWithPerson[]> {
  const { data, error } = await supabase
    .from('attendance_policy_configuration_audit')
    .select('*')
    .order('changed_at', { ascending: false });

  if (error) {
    console.error('Error fetching attendance_policy_configuration_audit:', error);
    throw error;
  }

  const rows = (data as AttendancePolicyAudit[]) ?? [];
  const userIds = Array.from(
    new Set(rows.map((r) => r.changed_by).filter(Boolean) as string[])
  );

  const names = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, full_name')
      .in('id', userIds);

    if (!userError && users) {
      users.forEach((u: { id: string; full_name: string }) => names.set(u.id, u.full_name));
    }
  }

  return rows.map((row) => ({
    ...row,
    changedByName: row.changed_by ? names.get(row.changed_by) ?? row.changed_by : 'System',
  }));
}

async function currentAuthUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('You must be signed in.');
  return data.user.id;
}

/**
 * Creates a future-dated attendance policy.
 * Closes the predecessor policy's effective_until on the day before the new policy starts.
 */
export async function createFutureAttendancePolicy(
  input: AttendancePolicyInput
): Promise<void> {
  const validation = validateAttendancePolicyInput(input);
  if (validation) throw new Error(validation);

  const userId = await currentAuthUserId();
  const normalizedThreshold = normalizeTimeString(input.lateThreshold);

  const configurations = (await listAttendancePolicyConfigurations())
    .filter((c) => c.active)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));

  if (configurations.some((c) => c.effective_from === input.effectiveFrom)) {
    throw new Error('An active policy configuration already starts on that date.');
  }

  const predecessor = [...configurations]
    .reverse()
    .find((c) => c.effective_from < input.effectiveFrom);

  const previousEnd = predecessor?.effective_until ?? null;
  const previousReason = predecessor?.change_reason ?? '';
  let predecessorWasUpdated = false;

  if (
    predecessor &&
    (!predecessor.effective_until || predecessor.effective_until >= input.effectiveFrom)
  ) {
    const newUntil = addDays(input.effectiveFrom, -1);
    const { error: updateError } = await supabase
      .from('attendance_policy_configurations')
      .update({
        effective_until: newUntil,
        change_reason: `Replaced by future policy effective ${input.effectiveFrom}. ${input.reason}`.trim(),
        updated_by: userId,
      })
      .eq('id', predecessor.id);

    if (updateError) throw updateError;
    predecessorWasUpdated = true;
  }

  const successor = configurations.find((c) => c.effective_from > input.effectiveFrom);
  const effectiveUntil = successor ? addDays(successor.effective_from, -1) : null;

  const { error: insertError } = await supabase
    .from('attendance_policy_configurations')
    .insert({
      late_threshold: normalizedThreshold,
      effective_from: input.effectiveFrom,
      effective_until: effectiveUntil,
      active: true,
      change_reason: input.reason.trim(),
      created_by: userId,
      updated_by: userId,
    });

  if (insertError) {
    if (predecessorWasUpdated && predecessor) {
      await supabase
        .from('attendance_policy_configurations')
        .update({
          effective_until: previousEnd,
          change_reason: previousReason,
          updated_by: userId,
        })
        .eq('id', predecessor.id);
    }
    throw insertError;
  }
}

/**
 * Deactivates an unstarted future attendance policy.
 */
export async function deactivateFutureAttendancePolicy(
  policyId: string,
  reason: string,
  today = localDateString()
): Promise<void> {
  if (!reason.trim()) throw new Error('A reason is required to cancel a policy.');

  const userId = await currentAuthUserId();
  const configurations = await listAttendancePolicyConfigurations();
  const target = configurations.find((c) => c.id === policyId);

  if (!target) throw new Error('Policy not found.');
  if (target.effective_from <= today) {
    throw new Error('Policies that have already taken effect cannot be canceled.');
  }

  const activeConfigs = configurations
    .filter((c) => c.active && c.id !== policyId)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));

  const predecessor = [...activeConfigs]
    .reverse()
    .find((c) => c.effective_from < target.effective_from);

  const successor = activeConfigs.find((c) => c.effective_from > target.effective_from);

  const { error } = await supabase
    .from('attendance_policy_configurations')
    .update({
      active: false,
      change_reason: reason.trim(),
      updated_by: userId,
    })
    .eq('id', policyId);

  if (error) throw error;

  if (predecessor) {
    const newUntil = successor ? addDays(successor.effective_from, -1) : null;
    await supabase
      .from('attendance_policy_configurations')
      .update({
        effective_until: newUntil,
        change_reason: `Restored boundary after cancellation of ${target.effective_from} policy. ${reason}`.trim(),
        updated_by: userId,
      })
      .eq('id', predecessor.id);
  }
}

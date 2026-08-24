import { supabase } from '../../lib/supabaseClient';
import type { Database } from '../../types/supabase';

export type ParcelRateConfiguration = Database['public']['Tables']['parcel_rate_configurations']['Row'];
export type ParcelRateAudit = Database['public']['Tables']['parcel_rate_configuration_audit']['Row'];
export interface ParcelRateAuditWithPerson extends ParcelRateAudit { changedByName: string; }

export interface ParcelRateInput {
  earlyStandardRate: number;
  regularStandardRate: number;
  lateStandardRate: number;
  heavyParcelRate: number;
  heavyThresholdKg: number;
  effectiveFrom: string;
  reason: string;
}

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

export function validateParcelRateInput(input: ParcelRateInput, today = localDateString()): string | null {
  const rates = [input.earlyStandardRate, input.regularStandardRate, input.lateStandardRate, input.heavyParcelRate];
  if (rates.some((rate) => !Number.isFinite(rate) || rate < 0)) return 'Rates must be zero or greater.';
  if (!Number.isFinite(input.heavyThresholdKg) || input.heavyThresholdKg <= 0) return 'Heavy parcel threshold must be greater than zero.';
  if (!input.effectiveFrom || input.effectiveFrom <= today) return 'Effective date must be a future date.';
  if (!input.reason.trim()) return 'A reason is required for every rate change.';
  return null;
}

export async function listParcelRateConfigurations(): Promise<ParcelRateConfiguration[]> {
  const { data, error } = await supabase
    .from('parcel_rate_configurations')
    .select('*')
    .order('effective_from', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listParcelRateAudit(): Promise<ParcelRateAuditWithPerson[]> {
  const { data, error } = await supabase
    .from('parcel_rate_configuration_audit')
    .select('*')
    .order('changed_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const userIds = Array.from(new Set(rows.map((row) => row.changed_by).filter(Boolean) as string[]));
  const names = new Map<string, string>();
  if (userIds.length) {
    const { data: users, error: userError } = await supabase.from('users').select('id, full_name').in('id', userIds);
    if (!userError) users?.forEach((person) => names.set(person.id, person.full_name));
  }
  return rows.map((row) => ({ ...row, changedByName: row.changed_by ? names.get(row.changed_by) ?? row.changed_by : 'System' }));
}

export function getCurrentParcelRateConfiguration(
  configurations: ParcelRateConfiguration[],
  today = localDateString(),
): ParcelRateConfiguration | null {
  return configurations.find((configuration) =>
    configuration.active &&
    configuration.effective_from <= today &&
    (!configuration.effective_until || configuration.effective_until >= today)
  ) ?? null;
}

async function currentAuthUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw error ?? new Error('You must be signed in.');
  return data.user.id;
}

export async function createFutureParcelRateConfiguration(input: ParcelRateInput): Promise<void> {
  const validation = validateParcelRateInput(input);
  if (validation) throw new Error(validation);
  const userId = await currentAuthUserId();
  const configurations = (await listParcelRateConfigurations())
    .filter((configuration) => configuration.active)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const predecessor = [...configurations].reverse().find((configuration) => configuration.effective_from < input.effectiveFrom);
  const successor = configurations.find((configuration) => configuration.effective_from > input.effectiveFrom);
  if (configurations.some((configuration) => configuration.effective_from === input.effectiveFrom)) {
    throw new Error('An active configuration already starts on that date.');
  }

  const previousEnd = predecessor?.effective_until ?? null;
  const previousReason = predecessor?.change_reason ?? '';
  let predecessorWasUpdated = false;
  if (predecessor && (!predecessor.effective_until || predecessor.effective_until >= input.effectiveFrom)) {
    const { error } = await supabase
      .from('parcel_rate_configurations')
      .update({
        effective_until: addDays(input.effectiveFrom, -1),
        updated_by: userId,
        change_reason: `Scheduled transition: ${input.reason.trim()}`,
      })
      .eq('id', predecessor.id);
    if (error) throw error;
    predecessorWasUpdated = true;
  }

  const { error: insertError } = await supabase.from('parcel_rate_configurations').insert({
    early_standard_rate: input.earlyStandardRate,
    regular_standard_rate: input.regularStandardRate,
    late_standard_rate: input.lateStandardRate,
    heavy_parcel_rate: input.heavyParcelRate,
    heavy_threshold_kg: input.heavyThresholdKg,
    effective_from: input.effectiveFrom,
    effective_until: successor ? addDays(successor.effective_from, -1) : null,
    active: true,
    change_reason: input.reason.trim(),
    created_by: userId,
    updated_by: userId,
  });

  if (insertError) {
    if (predecessor && predecessorWasUpdated) {
      await supabase.from('parcel_rate_configurations').update({
        effective_until: previousEnd,
        updated_by: userId,
        change_reason: previousReason,
      }).eq('id', predecessor.id);
    }
    throw insertError;
  }
}

export async function updateFutureParcelRateConfiguration(
  configuration: ParcelRateConfiguration,
  input: ParcelRateInput,
): Promise<void> {
  if (configuration.effective_from <= localDateString()) throw new Error('Only future configurations can be edited.');
  const validation = validateParcelRateInput({ ...input, effectiveFrom: configuration.effective_from });
  if (validation) throw new Error(validation);
  const userId = await currentAuthUserId();
  const { error } = await supabase.from('parcel_rate_configurations').update({
    early_standard_rate: input.earlyStandardRate,
    regular_standard_rate: input.regularStandardRate,
    late_standard_rate: input.lateStandardRate,
    heavy_parcel_rate: input.heavyParcelRate,
    heavy_threshold_kg: input.heavyThresholdKg,
    change_reason: input.reason.trim(),
    updated_by: userId,
  }).eq('id', configuration.id);
  if (error) throw error;
}

export async function deactivateFutureParcelRateConfiguration(
  configuration: ParcelRateConfiguration,
  reason: string,
): Promise<void> {
  if (configuration.effective_from <= localDateString()) throw new Error('Only future configurations can be deactivated.');
  if (!reason.trim()) throw new Error('A reason is required to deactivate a configuration.');
  const userId = await currentAuthUserId();
  const activeConfigurations = (await listParcelRateConfigurations())
    .filter((row) => row.active && row.id !== configuration.id)
    .sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const predecessor = [...activeConfigurations].reverse().find((row) => row.effective_from < configuration.effective_from);
  const successor = activeConfigurations.find((row) => row.effective_from > configuration.effective_from);
  const { error } = await supabase.from('parcel_rate_configurations').update({
    active: false,
    change_reason: reason.trim(),
    updated_by: userId,
  }).eq('id', configuration.id);
  if (error) throw error;

  if (predecessor) {
    const { error: reconnectError } = await supabase.from('parcel_rate_configurations').update({
      effective_until: successor ? addDays(successor.effective_from, -1) : null,
      change_reason: `Schedule restored: ${reason.trim()}`,
      updated_by: userId,
    }).eq('id', predecessor.id);
    if (reconnectError) {
      await supabase.from('parcel_rate_configurations').update({
        active: true,
        change_reason: configuration.change_reason,
        updated_by: userId,
      }).eq('id', configuration.id);
      throw reconnectError;
    }
  }
}

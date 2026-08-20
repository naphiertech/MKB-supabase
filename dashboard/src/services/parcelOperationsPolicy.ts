import { supabase } from '../lib/supabaseClient';
import { getLocalDateString } from './attendanceService';

export interface ParcelRateContext {
  id: string;
  earlyStandardRate: number;
  regularStandardRate: number;
  lateStandardRate: number;
  heavyParcelRate: number;
  heavyThresholdKg: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
}

export interface ParcelOperationalMetrics {
  totalDelivered: number;
  totalHandled: number;
  deliverySuccessRate: number;
  standardEarnings: number;
  heavyEarnings: number;
  dailyGross: number;
}

export function validateParcelCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole number.`);
  }
}

export function validateParcelWorkDate(date: string, today = getLocalDateString()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Select a valid work date.');
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime()) || getLocalDateString(parsed) !== date || date > today) {
    throw new Error('Select a valid work date that is not in the future.');
  }
}

export function calculateParcelOperationalMetrics(input: {
  standardDelivered: number;
  heavyDelivered: number;
  failed: number;
  returned: number;
  standardRate: number;
  heavyRate: number;
}): ParcelOperationalMetrics {
  validateParcelCount(input.standardDelivered, 'Standard Delivered');
  validateParcelCount(input.heavyDelivered, 'Heavy Delivered');
  validateParcelCount(input.failed, 'Failed');
  validateParcelCount(input.returned, 'Returned');
  const totalDelivered = input.standardDelivered + input.heavyDelivered;
  const totalHandled = totalDelivered + input.failed + input.returned;
  const standardEarnings = input.standardDelivered * input.standardRate;
  const heavyEarnings = input.heavyDelivered * input.heavyRate;
  return {
    totalDelivered,
    totalHandled,
    deliverySuccessRate: totalHandled > 0 ? Math.round((totalDelivered / totalHandled) * 1000) / 10 : 0,
    standardEarnings,
    heavyEarnings,
    dailyGross: standardEarnings + heavyEarnings,
  };
}

function timeInMinutes(rawTimeIn: string | null | undefined): number | null {
  if (!rawTimeIn) return null;
  const timeOnly = rawTimeIn.match(/^(\d{1,2}):(\d{2})/);
  if (timeOnly) return Number(timeOnly[1]) * 60 + Number(timeOnly[2]);
  const value = new Date(rawTimeIn);
  if (Number.isNaN(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(value);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  const minute = Number(parts.find(part => part.type === 'minute')?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

export function resolveStandardRateForTimeIn(rate: ParcelRateContext, rawTimeIn: string | null | undefined): number {
  const minutes = timeInMinutes(rawTimeIn);
  if (minutes !== null && minutes <= 8 * 60) return rate.earlyStandardRate;
  if (minutes !== null && minutes <= 9 * 60) return rate.regularStandardRate;
  return rate.lateStandardRate;
}

export async function getParcelRateContextForDate(date: string): Promise<ParcelRateContext> {
  validateParcelWorkDate(date);
  const { data, error } = await supabase
    .from('parcel_rate_configurations')
    .select('id, early_standard_rate, regular_standard_rate, late_standard_rate, heavy_parcel_rate, heavy_threshold_kg, effective_from, effective_until')
    .eq('active', true)
    .lte('effective_from', date)
    .or(`effective_until.is.null,effective_until.gte.${date}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No active parcel rate configuration exists for ${date}.`);
  return {
    id: data.id,
    earlyStandardRate: Number(data.early_standard_rate),
    regularStandardRate: Number(data.regular_standard_rate),
    lateStandardRate: Number(data.late_standard_rate),
    heavyParcelRate: Number(data.heavy_parcel_rate),
    heavyThresholdKg: Number(data.heavy_threshold_kg),
    effectiveFrom: data.effective_from,
    effectiveUntil: data.effective_until,
  };
}

// Monitoring service — stubbed for Magic Patterns
// TODO: Replace with Supabase queries / channel subscriptions in production
import {
  riders,
  violations,
  zones,
  type Rider,
  type ViolationEvent,
  type Zone } from
'./mockData';

export async function getOnlineRiders(): Promise<Rider[]> {
  // TODO: replace with supabase.from('riders').select('*').eq('online', true)
  return Promise.resolve(riders.filter((r) => r.status !== 'offline'));
}

export async function getZones(): Promise<Zone[]> {
  // TODO: supabase.from('zones').select('*')
  return Promise.resolve(zones);
}

export async function getViolations(): Promise<ViolationEvent[]> {
  // TODO: supabase.from('violations').select('*').order('ts', { ascending: false })
  return Promise.resolve([...violations].sort((a, b) => b.ts - a.ts));
}

export async function markViolationRead(id: string): Promise<void> {
  // TODO: supabase.from('violations').update({ read: true }).eq('id', id)
  const v = violations.find((x) => x.id === id);
  if (v) v.read = true;
}

export async function markAllViolationsRead(): Promise<void> {
  // TODO: supabase.from('violations').update({ read: true }).eq('read', false)
  violations.forEach((v) => v.read = true);
}
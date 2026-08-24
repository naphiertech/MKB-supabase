import { logActivity } from '../../lib/apiService';
import { logViolation } from '../monitoringService';

export function phoneHref(phone: string | null | undefined): string | null {
  const normalized = phone?.trim().replace(/[^\d+]/g, '') ?? '';
  return normalized ? `tel:${normalized}` : null;
}

export async function createLiveMonitoringManualFlag(input: {
  riderId: string;
  riderName: string;
  zoneId?: string | null;
  zoneName?: string | null;
  lat?: number;
  lng?: number;
  reason?: string;
}): Promise<void> {
  await logViolation({
    riderId: input.riderId,
    zoneId: input.zoneId ?? undefined,
    zoneName: input.zoneName ?? undefined,
    lat: input.lat,
    lng: input.lng,
    type: 'manual_flag',
  });
  await logActivity({
    riderId: input.riderId,
    eventType: 'manual_flag_created',
    description: `Manual monitoring flag created for "${input.riderName}".`,
    metadata: {
      source: 'live_monitoring',
      reason: input.reason?.trim() || null,
      zone_id: input.zoneId ?? null,
      zone_name: input.zoneName ?? null,
      lat: input.lat ?? null,
      lng: input.lng ?? null,
    },
  });
}

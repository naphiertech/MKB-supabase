const HUB_SCOPED_RESOURCES = new Set([
  'activity_logs',
  'attendance_logs',
  'parcel_correction_requests',
  'parcel_log_audit',
  'parcel_logs',
  'payroll_delivery_lines',
  'payroll_records',
  'rider_documents',
  'rider_locations',
  'rider_schedule_audit_events',
  'rider_schedules',
  'rider_absence_request_audit_events',
  'rider_absence_requests',
  'riders',
  'user_devices',
  'v_attendance_summary',
  'violations',
  'zones',
]);

let selectedHubId: string | null = null;

export function getSelectedHubId(): string | null {
  return selectedHubId;
}

export function setSelectedHubId(id: string | null): void {
  selectedHubId = id;
}

function scopedResource(url: URL): string | null {
  const match = url.pathname.match(/\/rest\/v1\/([^/]+)$/);
  if (!match) return null;
  return decodeURIComponent(match[1]);
}

export async function hubWorkspaceFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const rawUrl = input instanceof Request ? input.url : input.toString();
  const url = new URL(rawUrl);
  const resource = scopedResource(url);
  const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

  if (
    selectedHubId
    && resource
    && HUB_SCOPED_RESOURCES.has(resource)
    && ['GET', 'HEAD', 'PATCH', 'DELETE'].includes(method)
    && !url.searchParams.has('hub_id')
  ) {
    url.searchParams.set('hub_id', `eq.${selectedHubId}`);
  }

  const nextInput = input instanceof Request
    ? new Request(url.toString(), input)
    : url.toString();
  return fetch(nextInput, init);
}

import type { Rider } from '../../services/types';

export function resolveInitialZoneHubId(
  selectedWorkspaceHubId: string | null,
  activeAuthorizedHubIds: string[],
): string {
  return selectedWorkspaceHubId && activeAuthorizedHubIds.includes(selectedWorkspaceHubId)
    ? selectedWorkspaceHubId
    : '';
}

export function filterRidersForZoneHub(riders: Rider[], hubId: string): Rider[] {
  if (!hubId) return [];
  return riders.filter((rider) => rider.hubId === hubId);
}

export function getZoneSaveErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'Unable to save the zone.';
}

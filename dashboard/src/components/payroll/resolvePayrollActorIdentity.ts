export interface PayrollActorIdentityInput {
  snapshotName?: string | null;
  snapshotEmail?: string | null;
  currentName?: string | null;
  currentEmail?: string | null;
  legacyFallbackLabel: string;
}

export interface ResolvedPayrollActorIdentity {
  name: string;
  email: string | null;
  isSnapshot: boolean;
  isLegacy: boolean;
}

export function resolvePayrollActorIdentity({
  snapshotName,
  snapshotEmail,
  currentName,
  currentEmail,
  legacyFallbackLabel,
}: PayrollActorIdentityInput): ResolvedPayrollActorIdentity {
  const historicalName = snapshotName?.trim();
  const historicalEmail = snapshotEmail?.trim();
  if (historicalName && historicalEmail) {
    return {
      name: historicalName,
      email: historicalEmail,
      isSnapshot: true,
      isLegacy: false,
    };
  }

  const fallbackName = currentName?.trim();
  const fallbackEmail = currentEmail?.trim();
  return {
    name: fallbackName || legacyFallbackLabel,
    email: fallbackEmail || null,
    isSnapshot: false,
    isLegacy: true,
  };
}

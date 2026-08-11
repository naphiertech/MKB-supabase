import {
  resolvePayrollActorIdentity,
  type PayrollActorIdentityInput,
} from './resolvePayrollActorIdentity';

export function PayrollActorIdentity({
  snapshotName,
  snapshotEmail,
  currentName,
  currentEmail,
  legacyFallbackLabel,
  tone = "default",
}: PayrollActorIdentityInput & { tone?: "default" | "success" | "danger" }) {
  const identity = resolvePayrollActorIdentity({
    snapshotName,
    snapshotEmail,
    currentName,
    currentEmail,
    legacyFallbackLabel,
  });
  const toneClass = tone === "success"
    ? "text-emerald-700"
    : tone === "danger"
      ? "text-rose-700"
      : "text-foreground";

  return (
    <div className="min-w-0">
      <div className={`truncate font-semibold ${toneClass}`}>{identity.name}</div>
      {identity.email && (
        <div className="truncate font-mono text-[9px] text-muted-foreground">{identity.email}</div>
      )}
      {identity.isLegacy && (
        <div className="text-[8.5px] italic text-subtle-text">
          Legacy record · historical identity snapshot unavailable
        </div>
      )}
    </div>
  );
}

export const ATTENDANCE_CONTEXT_INVALIDATED = 'mkb:attendance-context-invalidated';

// Invalidation only: no request identifiers, reasons or review data in the event.
export function invalidateAttendanceContext(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ATTENDANCE_CONTEXT_INVALIDATED));
}

import type { ViolationEvent } from '../services/types';

const MANILA_TIME_ZONE = 'Asia/Manila';

export const VIOLATION_TYPE_LABEL: Record<ViolationEvent['type'], string> = {
  boundary_exit: 'Boundary exit',
  idle_timeout: 'Idle timeout',
  manual_flag: 'Manual flag'
};

export function violationTypeLabel(type: ViolationEvent['type']): string {
  return VIOLATION_TYPE_LABEL[type];
}

export function isActiveViolation(violation: ViolationEvent): boolean {
  return !violation.resolved;
}

function manilaBusinessDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(timestamp));
}

export function isViolationOnBusinessDate(timestamp: number, referenceTimestamp: number): boolean {
  return manilaBusinessDate(timestamp) === manilaBusinessDate(referenceTimestamp);
}

export function isManualFlagMetadata(metadata: Record<string, unknown> | null): boolean {
  return metadata?.manual_flag === true;
}

export interface ViolationTickerEvent {
  incidentId: string;
  icon: 'out' | 'idle' | 'flag' | 'resolved';
  tone: 'red' | 'amber' | 'brand' | 'green';
  text: string;
  timestamp: number;
}

export function buildViolationTickerEvents(violations: ViolationEvent[]): ViolationTickerEvent[] {
  return violations.slice(0, 12).map((violation) => {
    if (violation.resolved) {
      return {
        incidentId: violation.id,
        icon: 'resolved',
        tone: 'green',
        text: `${violation.riderName} ${violationTypeLabel(violation.type).toLowerCase()} resolved`,
        timestamp: violation.resolvedAt ?? violation.ts
      };
    }

    if (violation.type === 'idle_timeout') {
      return {
        incidentId: violation.id,
        icon: 'idle',
        tone: 'amber',
        text: `${violation.riderName} location timed out`,
        timestamp: violation.ts
      };
    }

    if (violation.type === 'manual_flag') {
      return {
        incidentId: violation.id,
        icon: 'flag',
        tone: 'brand',
        text: `${violation.riderName} was manually flagged`,
        timestamp: violation.ts
      };
    }

    return {
      incidentId: violation.id,
      icon: 'out',
      tone: 'red',
      text: `${violation.riderName} left ${violation.zoneName}`,
      timestamp: violation.ts
    };
  });
}

import { describe, expect, it } from 'vitest';
import type { ViolationEvent } from '../services/types';
import {
  buildViolationTickerEvents,
  isActiveViolation,
  isManualFlagMetadata,
  isViolationOnBusinessDate,
  violationTypeLabel
} from './violationPresentation';

const violation = (overrides: Partial<ViolationEvent> = {}): ViolationEvent => ({
  id: 'violation-1',
  riderId: 'rider-1',
  riderName: 'Test Rider',
  zoneName: 'Test Zone',
  ts: Date.parse('2026-08-09T00:30:00.000Z'),
  type: 'boundary_exit',
  read: false,
  resolved: false,
  ...overrides
});

describe('violation presentation semantics', () => {
  it('counts unresolved incidents as active independently of read state', () => {
    expect(isActiveViolation(violation({ read: true }))).toBe(true);
    expect(isActiveViolation(violation({ resolved: true }))).toBe(false);
  });

  it('uses the Asia/Manila business date for Today filtering', () => {
    const now = Date.parse('2026-08-09T16:30:00.000Z'); // Aug 10, 00:30 Manila
    expect(isViolationOnBusinessDate(Date.parse('2026-08-09T16:05:00.000Z'), now)).toBe(true);
    expect(isViolationOnBusinessDate(Date.parse('2026-08-09T15:59:59.000Z'), now)).toBe(false);
  });

  it('uses only persisted database violation types', () => {
    expect(violationTypeLabel('boundary_exit')).toBe('Boundary exit');
    expect(violationTypeLabel('idle_timeout')).toBe('Idle timeout');
    expect(violationTypeLabel('manual_flag')).toBe('Manual flag');
  });

  it('does not treat an automatic notification as a manual flag', () => {
    expect(isManualFlagMetadata({ source: 'violation_auto_notification', manual_flag: false })).toBe(false);
    expect(isManualFlagMetadata({ source: 'hr_violation_flag', manual_flag: true })).toBe(true);
    expect(isManualFlagMetadata(null)).toBe(false);
  });

  it('builds ticker entries only from real violation incidents and resolution state', () => {
    const events = buildViolationTickerEvents([
      violation(),
      violation({
        id: 'violation-2',
        type: 'manual_flag',
        resolved: true,
        resolvedAt: Date.parse('2026-08-09T01:00:00.000Z')
      })
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ incidentId: 'violation-1', tone: 'red' });
    expect(events[0].text).toContain('left Test Zone');
    expect(events[1]).toMatchObject({ incidentId: 'violation-2', tone: 'green' });
    expect(events[1].text).toContain('resolved');
  });
});

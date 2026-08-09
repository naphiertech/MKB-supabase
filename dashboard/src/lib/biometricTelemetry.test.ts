import { describe, expect, it } from 'vitest';

describe('biometric performance telemetry', () => {
  it('records timing-only entries without accepting biometric payloads', async () => {
    const faceAi = await import('./faceAi') as typeof import('./faceAi') & Record<string, unknown>;
    expect(faceAi.createBiometricTelemetry).toBeTypeOf('function');

    const createTelemetry = faceAi.createBiometricTelemetry as (options: {
      enabled: boolean;
      now: () => number;
    }) => {
      start: (name: string) => () => number;
      snapshot: () => unknown[];
    };
    const times = [10, 34];
    const telemetry = createTelemetry({ enabled: true, now: () => times.shift() ?? 34 });
    const finish = telemetry.start('descriptor_inference');

    expect(finish()).toBe(24);
    expect(telemetry.snapshot()).toEqual([
      { name: 'descriptor_inference', durationMs: 24, startedAt: 10 },
    ]);
    expect(Object.keys(telemetry.snapshot()[0] as object).sort()).toEqual([
      'durationMs',
      'name',
      'startedAt',
    ]);
  });
});

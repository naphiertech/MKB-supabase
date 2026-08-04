import { describe, expect, it, vi } from 'vitest';
import {
  canStartRiderAttendance,
  startRiderGeolocationWatch,
  type GeoPosition
} from './riderGeolocation';

describe('rider geolocation integrity', () => {
  it('reports GPS denial without manufacturing a location', () => {
    let onSuccess: PositionCallback | null = null;
    let onFailure: PositionErrorCallback | null = null;
    const source = {
      watchPosition: vi.fn((success: PositionCallback, failure: PositionErrorCallback | null) => {
        onSuccess = success;
        onFailure = failure;
        return 42;
      }),
      clearWatch: vi.fn()
    };
    const onPosition = vi.fn();
    const onError = vi.fn();

    const stop = startRiderGeolocationWatch(source, { onPosition, onError });
    (onFailure as PositionErrorCallback | null)?.({ message: 'Permission denied' } as GeolocationPositionError);

    expect(onError).toHaveBeenCalledWith('Permission denied');
    expect(onPosition).not.toHaveBeenCalled();
    expect(onSuccess).not.toBeNull();

    stop();
    expect(source.clearWatch).toHaveBeenCalledWith(42);
  });

  it('forwards a real device reading with its original accuracy and timestamp', () => {
    let onSuccess: PositionCallback | null = null;
    const source = {
      watchPosition: vi.fn((success: PositionCallback) => {
        onSuccess = success;
        return 7;
      }),
      clearWatch: vi.fn()
    };
    const onPosition = vi.fn();

    startRiderGeolocationWatch(source, { onPosition, onError: vi.fn() });
    (onSuccess as PositionCallback | null)?.({
      coords: { latitude: 6.9214, longitude: 122.079, accuracy: 9 },
      timestamp: 1_754_300_000_000
    } as GeolocationPosition);

    expect(onPosition).toHaveBeenCalledWith({
      lat: 6.9214,
      lng: 122.079,
      accuracy: 9,
      ts: 1_754_300_000_000
    });
  });

  it('accepts a recent real position for Time In and never requires GPS for Time Out', () => {
    const now = 1_754_300_000_000;
    const recent: GeoPosition = {
      lat: 6.9214,
      lng: 122.079,
      accuracy: 12,
      ts: now - 30_000
    };
    const stale = { ...recent, ts: now - 121_000 };

    expect(canStartRiderAttendance('time-in', recent, now)).toBe(true);
    expect(canStartRiderAttendance('time-in', stale, now)).toBe(false);
    expect(canStartRiderAttendance('time-in', null, now)).toBe(false);
    expect(canStartRiderAttendance('time-out', null, now)).toBe(true);
  });
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useAttendanceContextVersion } from './useAttendanceContextVersion';
import { invalidateAttendanceContext } from '../services/attendance/attendanceContextInvalidation';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('refreshes on safe local invalidation, focus, reconnect and visible polling, then cleans up', () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  const container = document.createElement('div');
  const root = createRoot(container);
  let version = '';
  function Probe() { version = useAttendanceContextVersion(); return null; }
  act(() => root.render(<Probe />));
  const initial = version;
  act(() => invalidateAttendanceContext());
  expect(version).not.toBe(initial);
  const local = version;
  act(() => window.dispatchEvent(new Event('focus')));
  expect(version).not.toBe(local);
  const focus = version;
  act(() => window.dispatchEvent(new Event('online')));
  expect(version).not.toBe(focus);
  const reconnect = version;
  act(() => vi.advanceTimersByTime(60_000));
  expect(version).not.toBe(reconnect);
  visibility.mockReturnValue('hidden');
  const hidden = version;
  act(() => vi.advanceTimersByTime(120_000));
  expect(version).toBe(hidden);
  visibility.mockReturnValue('visible');
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  expect(version).not.toBe(hidden);
  act(() => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
});

// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { AppUser } from '../../services/types';

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('../../services/attendance/attendanceContextService', () => ({ listAttendanceContext: mocks.list }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ session: { id: 'admin', role: 'admin' } }) }));
vi.mock('../../services/riders/riderService', () => ({ getUserTrustedDevice: vi.fn().mockResolvedValue(null), resetUserTrustedDevice: vi.fn() }));
vi.mock('../../services/riders/riderAssignmentService', () => ({ getRiderAssignmentWorkspace: vi.fn().mockResolvedValue({ riders: [] }) }));
vi.mock('../../lib/exports/employeeExport', () => ({ exportEmployeeProfileCard: vi.fn(), exportEmployeeDTR: vi.fn() }));
vi.mock('./RiderDocumentsTab', () => ({ RiderDocumentsTab: () => null }));
import { EmployeeDetails } from './EmployeeDetails';

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

it('does not infer absent calendar dates while authoritative context is unavailable', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T10:00:00Z'));
  mocks.list.mockResolvedValue([]);
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    const user = { id: 'user', riderId: 'rider', name: 'Rider', email: 'rider@example.test', role: 'rider', status: 'active' } as AppUser;
    await act(async () => { root.render(<EmployeeDetails user={user} zones={[]} onClose={vi.fn()} onEdit={vi.fn()} />); });
    const tab = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Attendance History Calendar'));
    expect(tab).toBeDefined();
    act(() => tab!.click());
    const day = [...container.querySelectorAll('button')].find(button => button.textContent === '1' && !button.disabled);
    expect(day).toBeDefined();
    expect(day!.className).not.toContain('bg-red-500');
  } finally {
    act(() => root.unmount());
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});

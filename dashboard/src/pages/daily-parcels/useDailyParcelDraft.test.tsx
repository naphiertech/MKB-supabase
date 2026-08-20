// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DailyParcelRow } from '../../services/operationsService';
import { useDailyParcelDraft } from './useDailyParcelDraft';

const savedRow: DailyParcelRow = {
  riderId: 'rider-1',
  riderName: 'Juan Rider',
  riderMkbId: 'MKB-001',
  riderAvatar: '',
  zoneId: 'zone-1',
  zoneName: 'North Hub',
  attendanceStatus: 'present',
  timeIn: '8:00 AM',
  deliveredParcels: 10,
  heavyParcels: 2,
  assignedParcels: 15,
  failedDeliveries: 1,
  returnedParcels: 2,
  notes: 'Saved note',
  standardRate: 8,
  heavyRate: 10,
  standardEarnings: 80,
  heavyEarnings: 20,
  dailyGross: 100,
  isModified: false,
};

describe('useDailyParcelDraft characterization', () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useDailyParcelDraft>;
  let drawerResetKey: string;

  function Probe() {
    latest = useDailyParcelDraft(drawerResetKey);
    return null;
  }

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    drawerResetKey = '2026-08-20';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<Probe />));
    act(() => latest.replaceRows([savedRow]));
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('uses a row edit when the same rider is opened in the drawer', () => {
    act(() => latest.updateRowCount('rider-1', 'deliveredParcels', 14));
    act(() => latest.openDrawer(latest.rows[0]));

    expect(latest.selectedRiderDrawer?.deliveredParcels).toBe(14);
    expect(latest.drawerDraft.deliveredParcels).toBe(14);
  });

  it('stages drawer edits back to the table only when they are applied', () => {
    act(() => latest.openDrawer(latest.rows[0]));
    act(() => latest.updateDrawerField('heavyParcels', 6));
    expect(latest.rows[0].heavyParcels).toBe(2);

    act(() => latest.stageDrawerDraft());
    expect(latest.rows[0].heavyParcels).toBe(6);
    expect(latest.rows[0].isModified).toBe(true);
  });

  it('keeps count-based dirty detection and the existing drawer staging behavior', () => {
    act(() => latest.updateRowCount('rider-1', 'failedDeliveries', 3));
    expect(latest.modifiedRows.map(row => row.riderId)).toEqual(['rider-1']);

    act(() => latest.updateRowCount('rider-1', 'failedDeliveries', 1));
    expect(latest.modifiedRows).toEqual([]);

    act(() => latest.openDrawer(latest.rows[0]));
    act(() => latest.stageDrawerDraft());
    expect(latest.modifiedRows.map(row => row.riderId)).toEqual(['rider-1']);
  });

  it('restores the four saved outcome counts on reset', () => {
    act(() => {
      latest.updateRowCount('rider-1', 'deliveredParcels', 20);
      latest.updateRowCount('rider-1', 'heavyParcels', 7);
      latest.updateRowCount('rider-1', 'failedDeliveries', 4);
      latest.updateRowCount('rider-1', 'returnedParcels', 5);
    });

    act(() => latest.reset());
    expect(latest.rows[0]).toMatchObject({
      deliveredParcels: 10,
      heavyParcels: 2,
      failedDeliveries: 1,
      returnedParcels: 2,
      isModified: false,
    });

    act(() => latest.openDrawer(latest.rows[0]));
    act(() => latest.updateDrawerField('deliveredParcels', 25));
    drawerResetKey = '2026-08-19';
    act(() => root.render(<Probe />));
    expect(latest.drawerDraft.deliveredParcels).toBe(10);
  });
});

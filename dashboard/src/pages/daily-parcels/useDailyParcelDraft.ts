import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyParcelRow } from '../../services/operationsService';

export type ParcelCountField =
  | 'deliveredParcels'
  | 'heavyParcels'
  | 'failedDeliveries'
  | 'returnedParcels';

export interface DailyParcelDrawerDraft {
  deliveredParcels: number;
  heavyParcels: number;
  assignedParcels: number;
  failedDeliveries: number;
  returnedParcels: number;
  notes: string;
}

interface InitialParcelCounts {
  standard: number;
  heavy: number;
  failed: number;
  returned: number;
}

const EMPTY_DRAWER_DRAFT: DailyParcelDrawerDraft = {
  deliveredParcels: 0,
  heavyParcels: 0,
  assignedParcels: 0,
  failedDeliveries: 0,
  returnedParcels: 0,
  notes: '',
};

function withDirtyState(
  row: DailyParcelRow,
  initial: InitialParcelCounts | undefined,
): DailyParcelRow {
  return {
    ...row,
    isModified: !initial
      || row.deliveredParcels !== initial.standard
      || row.heavyParcels !== initial.heavy
      || row.failedDeliveries !== initial.failed
      || row.returnedParcels !== initial.returned,
  };
}

export function useDailyParcelDraft(drawerResetKey?: string) {
  const [rows, setRows] = useState<DailyParcelRow[]>([]);
  const [initialRows, setInitialRows] = useState<Record<string, InitialParcelCounts>>({});
  const [selectedRiderDrawer, setSelectedRiderDrawer] = useState<DailyParcelRow | null>(null);
  const [drawerDraft, setDrawerDraft] = useState<DailyParcelDrawerDraft>(EMPTY_DRAWER_DRAFT);

  useEffect(() => {
    if (!selectedRiderDrawer) return;
    setDrawerDraft({
      deliveredParcels: selectedRiderDrawer.deliveredParcels,
      heavyParcels: selectedRiderDrawer.heavyParcels,
      assignedParcels: selectedRiderDrawer.assignedParcels || 0,
      failedDeliveries: selectedRiderDrawer.failedDeliveries || 0,
      returnedParcels: selectedRiderDrawer.returnedParcels || 0,
      notes: selectedRiderDrawer.notes || '',
    });
  }, [drawerResetKey, selectedRiderDrawer]);

  const replaceRows = useCallback((nextRows: DailyParcelRow[]) => {
    const nextInitialRows: Record<string, InitialParcelCounts> = {};
    nextRows.forEach(row => {
      nextInitialRows[row.riderId] = {
        standard: row.deliveredParcels,
        heavy: row.heavyParcels,
        failed: row.failedDeliveries,
        returned: row.returnedParcels,
      };
    });
    setRows(nextRows);
    setInitialRows(nextInitialRows);
  }, []);

  const updateRowCount = useCallback((riderId: string, field: ParcelCountField, value: number) => {
    setRows(previousRows => previousRows.map(row => {
      if (row.riderId !== riderId) return row;
      return withDirtyState({ ...row, [field]: value }, initialRows[riderId]);
    }));
    setSelectedRiderDrawer(previousRow => {
      if (!previousRow || previousRow.riderId !== riderId) return previousRow;
      return withDirtyState({ ...previousRow, [field]: value }, initialRows[riderId]);
    });
  }, [initialRows]);

  const updateDrawerField = useCallback(<Field extends keyof DailyParcelDrawerDraft>(
    field: Field,
    value: DailyParcelDrawerDraft[Field],
  ) => {
    setDrawerDraft(previousDraft => ({ ...previousDraft, [field]: value }));
  }, []);

  const openDrawer = useCallback((row: DailyParcelRow) => {
    setSelectedRiderDrawer(row);
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedRiderDrawer(null);
  }, []);

  const stageDrawerDraft = useCallback(() => {
    if (!selectedRiderDrawer) return;
    setRows(previousRows => previousRows.map(row => (
      row.riderId === selectedRiderDrawer.riderId
        ? {
            ...row,
            deliveredParcels: drawerDraft.deliveredParcels,
            heavyParcels: drawerDraft.heavyParcels,
            notes: drawerDraft.notes,
            assignedParcels: drawerDraft.assignedParcels,
            failedDeliveries: drawerDraft.failedDeliveries,
            returnedParcels: drawerDraft.returnedParcels,
            isModified: true,
          }
        : row
    )));
    setSelectedRiderDrawer(null);
  }, [drawerDraft, selectedRiderDrawer]);

  const reset = useCallback(() => {
    setRows(previousRows => previousRows.map(row => ({
      ...row,
      deliveredParcels: initialRows[row.riderId]?.standard ?? 0,
      heavyParcels: initialRows[row.riderId]?.heavy ?? 0,
      failedDeliveries: initialRows[row.riderId]?.failed ?? 0,
      returnedParcels: initialRows[row.riderId]?.returned ?? 0,
      isModified: false,
    })));
    setSelectedRiderDrawer(previousRow => previousRow
      ? {
          ...previousRow,
          deliveredParcels: initialRows[previousRow.riderId]?.standard ?? 0,
          heavyParcels: initialRows[previousRow.riderId]?.heavy ?? 0,
          failedDeliveries: initialRows[previousRow.riderId]?.failed ?? 0,
          returnedParcels: initialRows[previousRow.riderId]?.returned ?? 0,
          isModified: false,
        }
      : previousRow);
  }, [initialRows]);

  const modifiedRows = useMemo(() => rows.filter(row => row.isModified), [rows]);

  return {
    rows,
    modifiedRows,
    selectedRiderDrawer,
    drawerDraft,
    replaceRows,
    updateRowCount,
    updateDrawerField,
    openDrawer,
    closeDrawer,
    stageDrawerDraft,
    reset,
  };
}

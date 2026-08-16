import { useMemo, useState } from 'react';

export interface ExportJobState {
  running: boolean;
  message: string | null;
}

export function createExportJobController(onChange: (state: ExportJobState) => void) {
  let state: ExportJobState = { running: false, message: null };
  const update = (next: ExportJobState) => {
    state = next;
    onChange(next);
  };

  return {
    getState: () => state,
    async run<T>(
      initialMessage: string,
      task: (setMessage: (message: string) => void) => Promise<T>,
    ): Promise<{ started: boolean; value?: T }> {
      if (state.running) return { started: false };
      update({ running: true, message: initialMessage });
      try {
        const value = await task(message => update({ running: true, message }));
        return { started: true, value };
      } finally {
        update({ running: false, message: null });
      }
    },
  };
}

export function useExportJob() {
  const [state, setState] = useState<ExportJobState>({ running: false, message: null });
  const controller = useMemo(() => createExportJobController(setState), []);
  return { ...state, run: controller.run };
}

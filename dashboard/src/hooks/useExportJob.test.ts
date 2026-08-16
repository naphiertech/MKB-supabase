import { describe, expect, it, vi } from 'vitest';

type ExportJobModule = {
  createExportJobController?: (onChange: (state: { running: boolean; message: string | null }) => void) => {
    run: <T>(message: string, task: (setMessage: (message: string) => void) => Promise<T>) => Promise<{ started: boolean; value?: T }>;
    getState: () => { running: boolean; message: string | null };
  };
};

async function loadModule(): Promise<ExportJobModule> {
  try {
    return await import('./useExportJob') as ExportJobModule;
  } catch {
    return {};
  }
}

describe('export job duplicate protection', () => {
  it('runs one action at a time while preserving real count-based status messages', async () => {
    const module = await loadModule();
    expect(typeof module.createExportJobController).toBe('function');
    const states: Array<{ running: boolean; message: string | null }> = [];
    const controller = module.createExportJobController!(state => states.push(state));
    let finish!: (value: string) => void;
    const task = vi.fn((setMessage: (message: string) => void) => new Promise<string>(resolve => {
      setMessage('Generating 1 of 2 payslips…');
      finish = resolve;
    }));

    const first = controller.run('Preparing 2 payslips…', task);
    const duplicate = await controller.run('Preparing 2 payslips…', task);
    expect(duplicate).toEqual({ started: false });
    expect(task).toHaveBeenCalledTimes(1);
    expect(controller.getState()).toEqual({ running: true, message: 'Generating 1 of 2 payslips…' });

    finish('done');
    await expect(first).resolves.toEqual({ started: true, value: 'done' });
    expect(controller.getState()).toEqual({ running: false, message: null });
    expect(states).toContainEqual({ running: true, message: 'Preparing 2 payslips…' });
  });
});

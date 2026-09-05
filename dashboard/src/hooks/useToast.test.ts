import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sileo } from 'sileo';
import { pushToast, dismissToast, useToasts, appToast } from './useToast';

vi.mock('sileo', () => ({
  sileo: {
    show: vi.fn((opts) => opts.id || 'mock-id-show'),
    success: vi.fn((opts) => opts.id || 'mock-id-success'),
    error: vi.fn((opts) => opts.id || 'mock-id-error'),
    warning: vi.fn((opts) => opts.id || 'mock-id-warning'),
    info: vi.fn((opts) => opts.id || 'mock-id-info'),
    action: vi.fn((opts) => opts.id || 'mock-id-action'),
    promise: vi.fn((p) => (typeof p === 'function' ? p() : p)),
    dismiss: vi.fn(),
    clear: vi.fn(),
  },
}));

describe('useToast / Sileo adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pushToast compatibility layer', () => {
    it('defaults to 3200ms duration and maps default tone to sileo.show', () => {
      const id = pushToast({ title: 'Standard message' });

      expect(sileo.show).toHaveBeenCalledTimes(1);
      expect(sileo.show).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Standard message',
          duration: 3200,
        })
      );
      expect(id).toBe('mock-id-show');
    });

    it('maps success tone to sileo.success', () => {
      const id = pushToast({
        title: 'Operation successful',
        description: 'Records were committed.',
        tone: 'success',
      });

      expect(sileo.success).toHaveBeenCalledTimes(1);
      expect(sileo.success).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Operation successful',
          description: 'Records were committed.',
          duration: 3200,
        })
      );
      expect(id).toBe('mock-id-success');
    });

    it('maps error tone to sileo.error', () => {
      const id = pushToast({
        title: 'Operation failed',
        tone: 'error',
      });

      expect(sileo.error).toHaveBeenCalledTimes(1);
      expect(sileo.error).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Operation failed',
          duration: 3200,
        })
      );
      expect(id).toBe('mock-id-error');
    });

    it('maps warning tone to sileo.warning', () => {
      const id = pushToast({
        title: 'Caution required',
        tone: 'warning',
      });

      expect(sileo.warning).toHaveBeenCalledTimes(1);
      expect(sileo.warning).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Caution required',
          duration: 3200,
        })
      );
      expect(id).toBe('mock-id-warning');
    });

    it('maps info tone to sileo.info', () => {
      const id = pushToast({
        title: 'Heads up',
        tone: 'info',
      });

      expect(sileo.info).toHaveBeenCalledTimes(1);
      expect(sileo.info).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Heads up',
          duration: 3200,
        })
      );
      expect(id).toBe('mock-id-info');
    });

    it('preserves explicit duration, custom id, and position', () => {
      const id = pushToast({
        id: 'custom-toast-id',
        title: 'Long notification',
        duration: 5000,
        position: 'top-right',
        tone: 'success',
      });

      expect(sileo.success).toHaveBeenCalledWith({
        id: 'custom-toast-id',
        title: 'Long notification',
        description: undefined,
        duration: 5000,
        position: 'top-right',
      });
      expect(id).toBe('custom-toast-id');
    });
  });

  describe('dismissToast & useToasts', () => {
    it('dismissToast maps to sileo.dismiss', () => {
      dismissToast('toast-123');
      expect(sileo.dismiss).toHaveBeenCalledWith('toast-123');
    });

    it('useToasts returns empty array and dismiss function', () => {
      const { toasts, dismiss } = useToasts();
      expect(toasts).toEqual([]);
      dismiss('toast-456');
      expect(sileo.dismiss).toHaveBeenCalledWith('toast-456');
    });
  });

  describe('appToast adapter', () => {
    it('appToast.success forwards string with default 3200ms duration', () => {
      const id = appToast.success('Saved successfully');
      expect(sileo.success).toHaveBeenCalledWith({
        title: 'Saved successfully',
        duration: 3200,
      });
      expect(id).toBe('mock-id-success');
    });

    it('appToast.success respects extra options and explicit duration', () => {
      appToast.success('Saved successfully', { duration: 6000, description: 'Details' });
      expect(sileo.success).toHaveBeenCalledWith({
        title: 'Saved successfully',
        duration: 6000,
        description: 'Details',
      });
    });

    it('appToast.error forwards string with default 3200ms duration', () => {
      appToast.error('An error occurred');
      expect(sileo.error).toHaveBeenCalledWith({
        title: 'An error occurred',
        duration: 3200,
      });
    });

    it('appToast.warning forwards string with default 3200ms duration', () => {
      appToast.warning('Check input fields');
      expect(sileo.warning).toHaveBeenCalledWith({
        title: 'Check input fields',
        duration: 3200,
      });
    });

    it('appToast.info forwards string with default 3200ms duration', () => {
      appToast.info('Batch loaded');
      expect(sileo.info).toHaveBeenCalledWith({
        title: 'Batch loaded',
        duration: 3200,
      });
    });

    it('appToast.show forwards string with default 3200ms duration', () => {
      appToast.show('Neutral notice');
      expect(sileo.show).toHaveBeenCalledWith({
        title: 'Neutral notice',
        duration: 3200,
      });
    });

    it('appToast.dismiss calls sileo.dismiss', () => {
      appToast.dismiss('test-id');
      expect(sileo.dismiss).toHaveBeenCalledWith('test-id');
    });

    it('appToast.clear calls sileo.clear', () => {
      appToast.clear('top-right');
      expect(sileo.clear).toHaveBeenCalledWith('top-right');
    });

    it('appToast.action delegates to sileo.action', () => {
      appToast.action({ title: 'Undo action' });
      expect(sileo.action).toHaveBeenCalledWith({ title: 'Undo action' });
    });

    it('appToast.promise delegates to sileo.promise', async () => {
      const p = Promise.resolve('ok');
      const result = await appToast.promise(p, {
        loading: { title: 'Loading...' },
        success: { title: 'Done' },
        error: { title: 'Failed' },
      });
      expect(result).toBe('ok');
      expect(sileo.promise).toHaveBeenCalledTimes(1);
    });
  });
});

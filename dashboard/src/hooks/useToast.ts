// Tiny toast system. Module-level store so any component can fire toasts.
import { useEffect, useState, useCallback } from 'react';

export type ToastTone = 'default' | 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

let toasts: Toast[] = [];
const listeners = new Set<(t: Toast[]) => void>();

function emit() {
  listeners.forEach((l) => l(toasts));
}

function makeId() {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function pushToast(input: {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}) {
  const toast: Toast = {
    id: makeId(),
    title: input.title,
    description: input.description,
    tone: input.tone ?? 'default',
    duration: input.duration ?? 3200
  };
  toasts = [...toasts, toast];
  emit();
  if (toast.duration > 0) {
    setTimeout(() => dismissToast(toast.id), toast.duration);
  }
  return toast.id;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts() {
  const [list, setList] = useState<Toast[]>(toasts);
  useEffect(() => {
    const listener = (t: Toast[]) => setList(t);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  const dismiss = useCallback((id: string) => dismissToast(id), []);
  return { toasts: list, dismiss };
}
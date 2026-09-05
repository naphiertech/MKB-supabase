import { sileo, type SileoOptions, type SileoPosition } from "sileo";
import type { ReactNode } from "react";

export type ToastTone = "default" | "success" | "info" | "warning" | "error";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

export interface PushToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
  id?: string;
  position?: SileoPosition;
}

const DEFAULT_PUSH_TOAST_DURATION = 3200;

export function pushToast(input: PushToastInput): string {
  const tone = input.tone ?? "default";
  const duration = input.duration ?? DEFAULT_PUSH_TOAST_DURATION;

  const options: SileoOptions = {
    title: input.title,
    description: input.description,
    duration,
    ...(input.id ? { id: input.id } : {}),
    ...(input.position ? { position: input.position } : {}),
  };

  switch (tone) {
    case "success":
      return sileo.success(options);
    case "error":
      return sileo.error(options);
    case "warning":
      return sileo.warning(options);
    case "info":
      return sileo.info(options);
    default:
      return sileo.show(options);
  }
}

export function dismissToast(id: string): void {
  sileo.dismiss(id);
}

export function useToasts() {
  return { toasts: [] as Toast[], dismiss: dismissToast };
}

export type AppToastOptions = Omit<SileoOptions, "title"> & {
  description?: ReactNode | string;
};

function normalizeAppToastOptions(
  input: string | SileoOptions,
  extraOptions?: AppToastOptions,
): SileoOptions {
  if (typeof input === "string") {
    return {
      title: input,
      duration: extraOptions?.duration ?? DEFAULT_PUSH_TOAST_DURATION,
      ...extraOptions,
    };
  }
  return {
    duration: input.duration ?? DEFAULT_PUSH_TOAST_DURATION,
    ...input,
    ...extraOptions,
  };
}

export const appToast = {
  success: (input: string | SileoOptions, options?: AppToastOptions): string =>
    sileo.success(normalizeAppToastOptions(input, options)),
  error: (input: string | SileoOptions, options?: AppToastOptions): string =>
    sileo.error(normalizeAppToastOptions(input, options)),
  warning: (input: string | SileoOptions, options?: AppToastOptions): string =>
    sileo.warning(normalizeAppToastOptions(input, options)),
  info: (input: string | SileoOptions, options?: AppToastOptions): string =>
    sileo.info(normalizeAppToastOptions(input, options)),
  show: (input: string | SileoOptions, options?: AppToastOptions): string =>
    sileo.show(normalizeAppToastOptions(input, options)),
  action: (opts: SileoOptions): string => sileo.action(opts),
  promise: <T>(
    promise: Promise<T> | (() => Promise<T>),
    opts: Parameters<typeof sileo.promise>[1],
  ): Promise<T> => sileo.promise(promise, opts),
  dismiss: (id: string): void => sileo.dismiss(id),
  clear: (position?: SileoPosition): void => sileo.clear(position),
};

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).pushToast = pushToast;
  (window as unknown as Record<string, unknown>).appToast = appToast;
}

import { toast } from "react-hot-toast";
import React from "react";

export type ToastTone = "default" | "success" | "info" | "warning" | "error";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  duration: number;
}

export function pushToast(input: {
  title: string;
  description?: string;
  tone?: ToastTone;
  duration?: number;
}) {
  const tone = input.tone ?? "default";
  const duration = input.duration ?? 3200;

  const content = React.createElement(
    "div",
    { className: "flex flex-col text-left" },
    React.createElement(
      "span",
      { className: "text-sm font-semibold text-foreground" },
      input.title,
    ),
    input.description &&
      React.createElement(
        "span",
        { className: "text-[11px] text-muted-foreground mt-0.5" },
        input.description,
      ),
  );

  const options = {
    duration,
    position: "top-right" as const,
  };

  switch (tone) {
    case "success":
      return toast.success(content, options);
    case "error":
      return toast.error(content, options);
    case "warning":
      return toast(content, { ...options, icon: "⚠️" });
    case "info":
      return toast(content, { ...options, icon: "ℹ️" });
    default:
      return toast(content, options);
  }
}

export function dismissToast(id: string) {
  toast.dismiss(id);
}

export function useToasts() {
  return { toasts: [] as Toast[], dismiss: (id: string) => toast.dismiss(id) };
}

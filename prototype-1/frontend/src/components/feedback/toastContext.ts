import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "warning" | "info";

export interface ToastOptions {
  /** Headline, e.g. "Document encrypted". Required. */
  title: string;
  /** Optional supporting sentence. */
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. Pass 0 to require manual dismissal. */
  duration?: number;
  /** Optional inline action, e.g. { label: "View transfer", onClick } */
  action?: { label: string; onClick: () => void };
}

export interface Toast extends Required<Pick<ToastOptions, "title" | "tone" | "duration">> {
  id: number;
  description?: string;
  action?: ToastOptions["action"];
}

export interface ToastApi {
  /** Show a toast. Returns its id so you can dismiss it early. */
  toast: (options: ToastOptions) => number;
  /** Shorthand for tone: "success". */
  success: (title: string, description?: string) => number;
  /** Shorthand for tone: "error" — announced assertively. */
  error: (title: string, description?: string) => number;
  warning: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  dismiss: (id: number) => void;
  dismissAll: () => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Access the toast API from any component beneath <ToastProvider>.
 *
 * Usage:
 *   import { useToast } from "../components/feedback/toastContext";
 *
 *   const { success, error } = useToast();
 *   success("Document encrypted", `${filename} is ready to transmit.`);
 *   error("DECRYPTION FAILED", getErrorMessage(err.code, err.message));
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>.");
  return ctx;
}

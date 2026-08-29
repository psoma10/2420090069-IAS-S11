import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, CloseIcon, InfoIcon } from "./icons";
import { ToastContext, type Toast, type ToastApi, type ToastOptions, type ToastTone } from "./toastContext";
import styles from "./Toast.module.css";

const DEFAULT_DURATION = 4000;
/** Beyond this, older toasts are evicted so the stack can't fill the screen. */
const MAX_VISIBLE = 4;
/** Must match --duration-base so the exit animation finishes before unmount. */
const EXIT_MS = 200;

const ICONS: Record<ToastTone, typeof CheckCircleIcon> = {
  success: CheckCircleIcon,
  error: AlertTriangleIcon,
  warning: AlertCircleIcon,
  info: InfoIcon,
};

/** Redundant text label — the tone is never conveyed by colour alone. */
const TONE_LABEL: Record<ToastTone, string> = {
  success: "Success",
  error: "Error",
  warning: "Warning",
  info: "Info",
};

/**
 * App-wide toast notifications. No external dependency.
 *
 * Mount once, above the router:
 *   <ToastProvider><App /></ToastProvider>
 *
 * Then anywhere below it:
 *   const { success, error } = useToast();
 *   success("Transfer complete", "confidential.txt was decrypted by the server.");
 *
 * Behaviour: auto-dismiss after ~4s, paused while the pointer is over the
 * stack or while any toast inside it has keyboard focus, so a user reading or
 * tabbing to an action never has it disappear mid-reach. Errors default to a
 * longer 7s life and are announced assertively; everything else is polite.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [leaving, setLeaving] = useState<number[]>([]);
  const [paused, setPaused] = useState(false);

  const nextId = useRef(1);
  // Live timer handles, keyed by toast id, so pausing can cancel and resume.
  const timers = useRef(new Map<number, number>());
  // Remaining ms at the moment of pause, so resume doesn't restart the clock.
  const remaining = useRef(new Map<number, number>());
  const startedAt = useRef(new Map<number, number>());

  const clearTimer = useCallback((id: number) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) window.clearTimeout(handle);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      remaining.current.delete(id);
      startedAt.current.delete(id);
      // Mark as leaving, then unmount once the slide-out has played.
      setLeaving((prev) => (prev.includes(id) ? prev : [...prev, id]));
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        setLeaving((prev) => prev.filter((x) => x !== id));
      }, EXIT_MS);
    },
    [clearTimer],
  );

  const schedule = useCallback(
    (id: number, ms: number) => {
      if (ms <= 0) return; // duration 0 means "stay until dismissed"
      startedAt.current.set(id, Date.now());
      remaining.current.set(id, ms);
      timers.current.set(id, window.setTimeout(() => dismiss(id), ms));
    },
    [dismiss],
  );

  const toast = useCallback(
    (options: ToastOptions): number => {
      const id = nextId.current++;
      const tone = options.tone ?? "info";
      // Failures get longer on screen: they usually carry a next step.
      const duration = options.duration ?? (tone === "error" ? 7000 : DEFAULT_DURATION);

      setToasts((prev) => {
        const next = [...prev, { id, title: options.title, description: options.description, tone, duration, action: options.action }];
        // Evict the oldest beyond the cap, cancelling its pending timer.
        const overflow = next.length - MAX_VISIBLE;
        if (overflow > 0) {
          for (const stale of next.slice(0, overflow)) clearTimer(stale.id);
          return next.slice(overflow);
        }
        return next;
      });

      schedule(id, duration);
      return id;
    },
    [clearTimer, schedule],
  );

  // Pause: freeze every countdown, banking how much time each has left.
  const pause = useCallback(() => {
    setPaused(true);
    for (const [id, handle] of timers.current) {
      window.clearTimeout(handle);
      const start = startedAt.current.get(id) ?? Date.now();
      const left = (remaining.current.get(id) ?? 0) - (Date.now() - start);
      remaining.current.set(id, Math.max(left, 400));
    }
    timers.current.clear();
  }, []);

  // Resume: restart each countdown from its banked remainder.
  const resume = useCallback(() => {
    setPaused(false);
    for (const [id, left] of remaining.current) {
      if (left > 0 && !timers.current.has(id)) schedule(id, left);
    }
  }, [schedule]);

  const dismissAll = useCallback(() => {
    for (const t of toasts) dismiss(t.id);
  }, [dismiss, toasts]);

  // Escape clears the stack — a keyboard escape hatch matching dialog norms.
  useEffect(() => {
    if (toasts.length === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismissAll();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismissAll, toasts.length]);

  // Clear every pending timer on unmount so nothing fires into a dead tree.
  useEffect(() => {
    const handles = timers.current;
    return () => {
      for (const handle of handles.values()) window.clearTimeout(handle);
      handles.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (title, description) => toast({ title, description, tone: "success" }),
      error: (title, description) => toast({ title, description, tone: "error" }),
      warning: (title, description) => toast({ title, description, tone: "warning" }),
      info: (title, description) => toast({ title, description, tone: "info" }),
      dismiss,
      dismissAll,
    }),
    [dismiss, dismissAll, toast],
  );

  const polite = toasts.filter((t) => t.tone !== "error");
  const assertive = toasts.filter((t) => t.tone === "error");

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/*
        Two live regions rather than one: errors interrupt (assertive),
        confirmations wait for a pause in speech (polite). aria-relevant
        additions stops removals from being re-announced on dismiss.
      */}
      <div
        className={styles.viewport}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocusCapture={pause}
        onBlurCapture={resume}
      >
        <div aria-live="polite" aria-relevant="additions" style={{ display: "contents" }}>
          {polite.map((t) => (
            <ToastItem key={t.id} toast={t} paused={paused} leaving={leaving.includes(t.id)} onDismiss={dismiss} />
          ))}
        </div>
        <div aria-live="assertive" aria-relevant="additions" style={{ display: "contents" }}>
          {assertive.map((t) => (
            <ToastItem key={t.id} toast={t} paused={paused} leaving={leaving.includes(t.id)} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

interface ToastItemProps {
  toast: Toast;
  paused: boolean;
  leaving: boolean;
  onDismiss: (id: number) => void;
}

function ToastItem({ toast, paused, leaving, onDismiss }: ToastItemProps) {
  const Icon = ICONS[toast.tone];
  return (
    <div className={[styles.toast, styles[toast.tone], leaving ? styles.leaving : ""].filter(Boolean).join(" ")}>
      <Icon className={styles.icon} size={18} />
      <div className={styles.body}>
        {/* Spoken prefix so the tone survives without colour or icon. */}
        <span className="sr-only">{TONE_LABEL[toast.tone]}: </span>
        <span className={styles.title}>{toast.title}</span>
        {toast.description && <span className={styles.description}>{toast.description}</span>}
        {toast.action && (
          <button
            type="button"
            className={styles.action}
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={() => onDismiss(toast.id)}
        aria-label={`Dismiss notification: ${toast.title}`}
      >
        <CloseIcon size={14} />
      </button>
      {toast.duration > 0 && (
        <span
          className={[styles.progress, paused ? styles.paused : ""].filter(Boolean).join(" ")}
          style={{ animationDuration: `${toast.duration}ms` }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

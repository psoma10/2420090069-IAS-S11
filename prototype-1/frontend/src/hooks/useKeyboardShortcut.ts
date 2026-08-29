import { useEffect } from "react";

interface Options {
  /** Require the platform's primary modifier (Cmd on macOS, Ctrl elsewhere). */
  meta?: boolean;
  shift?: boolean;
  /** Set false to temporarily disable without unmounting the caller. */
  enabled?: boolean;
  /**
   * Fire even while the user is typing in a field. Default false — a bare
   * letter shortcut must never steal keystrokes from an input, which would
   * make forms unusable for keyboard and voice-input users.
   */
  allowInEditable?: boolean;
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Binds a document-level keyboard shortcut with the guards that hand-rolled
 * keydown listeners usually forget: editable-field suppression, IME
 * composition, and cross-platform Cmd/Ctrl normalisation.
 *
 * USAGE:
 *
 *   // Cmd/Ctrl+K opens a command palette
 *   useKeyboardShortcut("k", () => setPaletteOpen(true), { meta: true });
 *
 *   // Escape closes a drawer — safe to fire from inside inputs
 *   useKeyboardShortcut("Escape", close, { allowInEditable: true });
 *
 * `key` is matched case-insensitively against KeyboardEvent.key, so pass
 * "k", "Escape", "/" etc. The handler receives the event if it needs to
 * inspect it; preventDefault is already called for you.
 *
 * ACCESSIBILITY CONTRACT: a shortcut must never be the ONLY way to reach a
 * feature. Always ship a visible, focusable control that does the same
 * thing — the shortcut is an accelerator, not the interface. If you add
 * one, surface it in the UI (e.g. a <kbd>⌘K</kbd> hint) so it is
 * discoverable rather than hidden knowledge.
 */
export function useKeyboardShortcut(
  key: string,
  handler: (event: KeyboardEvent) => void,
  { meta = false, shift = false, enabled = true, allowInEditable = false }: Options = {},
) {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      // Mid-composition keystrokes belong to the IME, not to us.
      if (event.isComposing) return;
      if (event.key.toLowerCase() !== key.toLowerCase()) return;

      const modifierHeld = event.metaKey || event.ctrlKey;
      if (meta !== modifierHeld) return;
      if (shift !== event.shiftKey) return;
      if (!allowInEditable && isEditable(event.target)) return;

      event.preventDefault();
      handler(event);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [key, handler, meta, shift, enabled, allowInEditable]);
}

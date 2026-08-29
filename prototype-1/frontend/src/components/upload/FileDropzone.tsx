import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Button } from "../ui/Button";
import styles from "./FileDropzone.module.css";
import { ACCEPT, dragLooksAcceptable, formatSize, type Rejection } from "./fileValidation";

interface FileDropzoneProps {
  file: File | null;
  rejection: Rejection | null;
  /** Byte ceiling for the current direction, shown as guidance and as a gauge. */
  limit: number;
  disabled?: boolean;
  /** Null when the user clears the selection. */
  onSelect: (file: File | null) => void;
}

/**
 * PRD Screen 3 upload target.
 *
 * Accessibility: the drop surface is a genuine <button>, so Enter and Space
 * open the file browser with no custom key handling — drag-and-drop is an
 * enhancement layered on top of a keyboard-complete control, never the only
 * way in. Drag state is tracked with a counter because dragenter/dragleave
 * fire for every descendant element and a boolean flag flickers.
 */
export function FileDropzone({ file, rejection, limit, disabled = false, onSelect }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  // True from the moment we ask for a file chooser until the browser hands
  // focus back. The chooser is an OS-level modal that the page cannot see or
  // close, so without this latch every extra click/Enter/Space stacks another
  // dialog on top of the last one and the user ends up unable to pick at all.
  const pickerOpen = useRef(false);
  const [dragState, setDragState] = useState<"none" | "accept" | "reject">("none");
  const descriptionId = useId();

  function releasePicker() {
    pickerOpen.current = false;
  }

  useEffect(() => {
    // Two independent "the dialog went away" signals, because neither alone
    // covers every browser: `cancel` fires when the user dismisses without
    // choosing (not in React's typings yet, hence the imperative listener),
    // and window focus covers selection plus any browser that skips `cancel`.
    const input = inputRef.current;
    input?.addEventListener("cancel", releasePicker);
    window.addEventListener("focus", releasePicker);
    return () => {
      input?.removeEventListener("cancel", releasePicker);
      window.removeEventListener("focus", releasePicker);
    };
  }, [file]);

  function openPicker() {
    if (disabled || pickerOpen.current) return;
    pickerOpen.current = true;
    inputRef.current?.click();
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    // Chrome fires change before the window focus event, so release here too
    // rather than relying on focus alone.
    releasePicker();
    const picked = event.target.files?.[0] ?? null;
    if (picked) onSelect(picked);
    event.target.value = ""; // Allow re-picking the same filename.
  }

  function handleDragEnter(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (disabled) return;
    dragDepth.current += 1;
    setDragState(dragLooksAcceptable(event) ? "accept" : "reject");
  }

  function handleDragOver(event: DragEvent<HTMLButtonElement>) {
    // Required — without preventDefault the browser navigates to the file.
    event.preventDefault();
    if (!disabled) event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragState("none");
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragState("none");
    if (disabled) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) onSelect(dropped);
  }

  // A selected file replaces the zone with a summary, so the screen always
  // shows exactly one state rather than stacking a target under a result.
  if (file) {
    const invalid = Boolean(rejection);
    const usage = Math.min(100, (file.size / limit) * 100);

    return (
      <div
        className={[styles.selected, invalid ? styles.selectedBad : styles.selectedOk].join(" ")}
        aria-live="polite"
      >
        <span className={styles.fileIcon} aria-hidden="true">
          TXT
        </span>

        <div className={styles.fileBody}>
          <p className={styles.fileName}>{file.name}</p>

          <div className={styles.fileFacts}>
            <span>{formatSize(file.size)}</span>
            <span>LIMIT {formatSize(limit)}</span>
          </div>

          <div
            className={styles.gauge}
            role="progressbar"
            aria-label="File size against the upload limit"
            aria-valuenow={Math.round(usage)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              className={[styles.gaugeFill, invalid ? styles.gaugeFillOver : ""].filter(Boolean).join(" ")}
              style={{ width: `${Math.max(4, usage)}%` }}
            />
          </div>

          <p className={[styles.statusLine, invalid ? styles.statusBad : styles.statusOk].join(" ")}>
            <span aria-hidden="true">{invalid ? "✕" : "✓"}</span>
            {invalid ? rejection?.message : "Ready for encryption"}
          </p>
        </div>

        <div className={styles.fileActions}>
          <Button type="button" variant="secondary" size="sm" onClick={openPicker} disabled={disabled}>
            Replace
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => onSelect(null)} disabled={disabled}>
            Remove
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className={styles.hiddenInput}
          tabIndex={-1}
          disabled={disabled}
          onChange={handleInputChange}
        />
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={[
          styles.zone,
          dragState === "accept" ? styles.dragging : "",
          dragState === "reject" ? styles.rejecting : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={openPicker}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        disabled={disabled}
        aria-describedby={descriptionId}
      >
        <span className={styles.icon} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V16" strokeLinecap="round" />
          </svg>
        </span>

        <span className={styles.copy}>
          <span className={styles.headline}>
            {dragState === "reject" ? "That file type isn't supported" : "Drop your .txt file here"}
          </span>
          <span className={styles.sub}>or use the button below to browse</span>
        </span>

        <span className={styles.cta} aria-hidden="true">
          SELECT FILE
        </span>

        <span className={styles.meta}>.TXT &middot; MAX {formatSize(limit)}</span>
      </button>

      <p id={descriptionId} className="sr-only">
        Press Enter or Space to open the file browser, or drag a plain-text .txt file onto this area. Maximum size{" "}
        {formatSize(limit)}.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className={styles.hiddenInput}
        tabIndex={-1}
        disabled={disabled}
        onChange={handleInputChange}
      />
    </>
  );
}

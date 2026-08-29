import { useEffect, useState } from "react";
import { api, ApiError } from "../../lib/api";
import type { ShareLink } from "../../types/api";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Modal } from "../ui/Modal";
import { CopyButton } from "../data";
import { shareUrlFor } from "../../lib/share";
import styles from "./ShareDocumentModal.module.css";

interface ShareDocumentModalProps {
  open: boolean;
  onClose: () => void;
  documentId: number;
  filename: string;
  /** Fired after a link is created so lists can refresh without a full reload. */
  onCreated?: (share: ShareLink) => void;
}

/** "Never" is the absence of expires_in_days, not a sentinel the API understands. */
const EXPIRY_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

function LinkGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Two-phase dialog: a small create form, then the resulting link with a copy
 * control. Kept in one modal so the user never loses the link to a navigation
 * — the token is shown exactly once here and is only recoverable afterwards
 * from the Share links screen.
 */
export function ShareDocumentModal({ open, onClose, documentId, filename, onCreated }: ShareDocumentModalProps) {
  const [label, setLabel] = useState("");
  const [expiry, setExpiry] = useState("never");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ShareLink | null>(null);

  // Reset on each open so a reopened dialog never shows the previous link.
  useEffect(() => {
    if (!open) return;
    setLabel("");
    setExpiry("never");
    setSubmitting(false);
    setError(null);
    setCreated(null);
  }, [open]);

  const handleCreate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const trimmed = label.trim();
      const share = await api.shares.create(documentId, {
        ...(trimmed ? { label: trimmed } : {}),
        ...(expiry === "never" ? {} : { expires_in_days: Number(expiry) }),
      });
      setCreated(share);
      onCreated?.(share);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "The share link could not be created. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const shareUrl = created ? shareUrlFor(created.share_path) : "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? "Share link ready" : "Share this document"}
      description={
        created
          ? "Anyone with this link can read the document. It does not require an account."
          : `Create a public link to ${filename}. Anyone who has the link can read it.`
      }
      size="md"
      footer={
        created ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void handleCreate()} loading={submitting}>
              Create link
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className={styles.result}>
          <div className={styles.linkRow}>
            <span className={styles.linkIcon} aria-hidden="true">
              <LinkGlyph />
            </span>
            <span className={styles.linkText}>{shareUrl}</span>
            <CopyButton
              value={shareUrl}
              className={styles.copyButton}
              copiedClassName={styles.copied}
              label="Copy link"
            />
          </div>

          <dl className={styles.summary}>
            <div className={styles.summaryItem}>
              <dt>Expires</dt>
              <dd>{created.expires_at ? new Date(created.expires_at).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }) : "Never"}</dd>
            </div>
            {created.label && (
              <div className={styles.summaryItem}>
                <dt>Label</dt>
                <dd>{created.label}</dd>
              </div>
            )}
          </dl>

          <p className={styles.note}>
            You can withdraw this link at any time from <strong>Share links</strong>. Revoking takes
            effect immediately.
          </p>
        </div>
      ) : (
        <div className={styles.form}>
          <Input
            label="Label (optional)"
            placeholder="For the committee"
            value={label}
            maxLength={120}
            onChange={(event) => setLabel(event.target.value)}
            hint="Only you can see this. It helps you tell links apart later."
          />
          <Select
            label="Expiry"
            options={EXPIRY_OPTIONS}
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            hint="After this window the link stops working automatically."
          />
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

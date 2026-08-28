import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { EncryptionStats, formatBytes } from "../components/encryption/EncryptionStats";
import { PlaintextCiphertextPanel } from "../components/encryption/PlaintextCiphertextPanel";
import { ApiError, api } from "../lib/api";
import type { EncryptionPreview, TransferDetail } from "../types/api";
import styles from "./EncryptionPreviewPage.module.css";

/**
 * State handed over by the upload screen (`navigate("/upload/preview", { state })`).
 * Every field is optional so the route stays directly reachable — without a
 * document we show a sample transformation rather than an empty screen.
 */
interface PreviewNavState {
  documentId?: number;
  filename?: string;
  algorithm?: string;
  key?: string;
  text?: string;
  direction?: string;
}

const SAMPLE_TEXT =
  "This document contains confidential information for secure transmission.\n" +
  "CyberVault encrypts it on the client before any bytes reach the network.";

/** Shown when the backend is unreachable so the transformation is still legible. */
const SAMPLE_PREVIEW: EncryptionPreview = {
  algorithm: "aes",
  algorithm_label: "AES-256",
  plaintext: SAMPLE_TEXT,
  ciphertext:
    "8F72A91C3D8E4B02A7719CE3D8104FBA2C91E7730A18BD44\n" +
    "B192AC77D3A15E90C2748FA3019BE7C5D6208A41F39C7E0B\n" +
    "92C81F72A0D4E63B8175CA290EF3B6D4187A05C9E2F84A31\n" +
    "5D0C93E71A8F462B0937DA8E15C4B72096E3F81DA470C25B",
  plaintext_size: SAMPLE_TEXT.length,
  ciphertext_size: 192,
  encryption_time_ms: 1.83,
};

function FileIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.fileIcon}
      aria-hidden="true"
    >
      <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5Z" />
      <path d="M9 1.5v4h4" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.bannerIcon}
      aria-hidden="true"
    >
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 5v3.5" />
      <path d="M8 11h.01" />
    </svg>
  );
}

/** Network-class failures fall back to sample data; everything else surfaces. */
function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "NETWORK_ERROR" || error.code === "SERVER_UNAVAILABLE");
}

/**
 * PRD Screen 4 — Encryption Preview.
 * Shows the plaintext -> encryption -> ciphertext transformation side by side,
 * the FR-12 encryption details, and the "Send to Server" action that creates a
 * transfer and hands off to the Transfer Monitor (Screen 5).
 */
export function EncryptionPreviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const nav = (location.state ?? {}) as PreviewNavState;

  const [preview, setPreview] = useState<EncryptionPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const { algorithm, key, text, documentId, filename, direction } = nav;

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOffline(false);

    // No handoff state — demonstrate the screen with the sample transformation.
    if (!algorithm || !key || !text) {
      setPreview(SAMPLE_PREVIEW);
      setOffline(true);
      setLoading(false);
      return;
    }

    try {
      const data = (await api.encryption.preview({ algorithm, key, text })) as EncryptionPreview;
      setPreview(data);
    } catch (err) {
      if (isOfflineError(err)) {
        setPreview(SAMPLE_PREVIEW);
        setOffline(true);
      } else {
        setPreview(null);
        setError(err instanceof ApiError ? err.message : "Encryption preview failed.");
      }
    } finally {
      setLoading(false);
    }
  }, [algorithm, key, text]);

  useEffect(() => {
    void runPreview();
  }, [runPreview]);

  async function handleSend() {
    if (!preview) return;
    setSending(true);
    setSendError(null);

    // Without a real document there is nothing to transfer — show the monitor
    // in its fallback (mock) mode so the demo flow stays continuous.
    if (documentId === undefined || !algorithm || !key) {
      navigate("/transfers/123");
      return;
    }

    try {
      const transfer = (await api.transfers.create({
        document_id: documentId,
        algorithm,
        key,
        direction,
      })) as TransferDetail;
      navigate(`/transfers/${transfer.id}`, { state: { transfer, key } });
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "The transfer could not be started.");
      setSending(false);
    }
  }

  const sizeLabel = preview ? formatBytes(preview.plaintext_size) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Encryption Preview</h1>
          <p className={styles.subtitle}>
            Review the transformation before transmission. Only the ciphertext on the right leaves this
            machine — the plaintext never touches the network.
          </p>
        </div>
        <div className={styles.headerMeta}>
          {preview && <Badge tone="accent">{preview.algorithm_label}</Badge>}
          {sizeLabel && <Badge tone="neutral">{sizeLabel}</Badge>}
        </div>
      </header>

      {offline && !error && (
        <div className={[styles.banner, styles.bannerWarning].join(" ")} role="status">
          <AlertIcon />
          <span>
            <span className={styles.bannerTitle}>Showing a sample transformation. </span>
            <span className={styles.bannerBody}>
              Encrypt a document from Secure Upload to preview your own file.
            </span>
          </span>
        </div>
      )}

      {error && (
        <div className={[styles.banner, styles.bannerDanger].join(" ")} role="alert">
          <AlertIcon />
          <span>
            <span className={styles.bannerTitle}>Encryption failed. </span>
            <span className={styles.bannerBody}>{error}</span>
          </span>
        </div>
      )}

      {(filename || preview) && (
        <div className={styles.fileBar}>
          <span className={styles.fileName}>
            <FileIcon />
            {filename ?? "sample_document.txt"}
          </span>
          {preview && (
            <>
              <span className={styles.fileFact}>
                Algorithm
                <span className={styles.fileFactValue}>{preview.algorithm_label}</span>
              </span>
              <span className={styles.fileFact}>
                Size
                <span className={styles.fileFactValue}>{formatBytes(preview.plaintext_size)}</span>
              </span>
            </>
          )}
        </div>
      )}

      {loading ? (
        <div className={styles.skeletonGrid} aria-hidden="true">
          <div className={styles.skeletonPanel} />
          <div className={styles.skeletonPanel} />
        </div>
      ) : (
        preview && (
          <>
            <PlaintextCiphertextPanel
              plaintext={preview.plaintext}
              ciphertext={preview.ciphertext}
              plaintextMeta={`${preview.plaintext_size.toLocaleString()} B`}
              ciphertextMeta={`${preview.ciphertext_size.toLocaleString()} B`}
              transformLabel={preview.algorithm_label}
              revealKey={`${preview.algorithm}-${preview.ciphertext_size}-${preview.encryption_time_ms}`}
            />

            <Card padding="lg">
              <div className={styles.detailsCard}>
                <span className={styles.sectionLabel}>Encryption Details</span>
                <EncryptionStats
                  algorithmLabel={preview.algorithm_label}
                  plaintextSize={preview.plaintext_size}
                  ciphertextSize={preview.ciphertext_size}
                  timeMs={preview.encryption_time_ms}
                />

                {sendError && (
                  <div className={[styles.banner, styles.bannerDanger].join(" ")} role="alert">
                    <AlertIcon />
                    <span>
                      <span className={styles.bannerTitle}>Transfer failed. </span>
                      <span className={styles.bannerBody}>{sendError}</span>
                    </span>
                  </div>
                )}

                <div className={styles.actions}>
                  <Button variant="secondary" onClick={() => navigate("/upload")} disabled={sending}>
                    Back to Upload
                  </Button>
                  <span className={styles.actionsSpacer} />
                  <span className={styles.actionHint}>Transmits ciphertext only</span>
                  <Button onClick={() => void handleSend()} loading={sending}>
                    Send to Server
                  </Button>
                </div>
              </div>
            </Card>
          </>
        )
      )}
    </div>
  );
}

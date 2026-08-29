import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { PlaintextCiphertextPanel } from "../components/encryption/PlaintextCiphertextPanel";
import { formatBytes } from "../components/encryption/EncryptionStats";
import { StagePipeline } from "../components/transfer/StagePipeline";
import { ApiError, api } from "../lib/api";
import { MOCK_TRANSFER_DETAIL } from "../lib/mockData";
import { useFlow } from "../context/FlowContext";
import { formatAlgorithm } from "../lib/format";
import type { DecryptResult, TransferDetail, TransferStage } from "../types/api";
import styles from "./TransferMonitorPage.module.css";

/** True when the visitor has asked the OS to minimise motion. */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isOfflineError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === "NETWORK_ERROR" || error.code === "SERVER_UNAVAILABLE")
  );
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function AlertIcon() {
  return (
    <svg {...ICON_PROPS} className={styles.bannerIcon}>
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 5v3.5" />
      <path d="M8 11h.01" />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg {...ICON_PROPS} className={styles.integrityIcon}>
      <path d="M8 1.75l5 2v4c0 3-2.1 5.35-5 6.5-2.9-1.15-5-3.5-5-6.5v-4l5-2Z" />
      <path d="M5.75 7.75l1.5 1.5 3-3.25" />
    </svg>
  );
}

const STATUS_TONE = {
  COMPLETED: "success",
  RECEIVED: "accent",
  PENDING: "warning",
  FAILED: "danger",
} as const;

/**
 * PRD Screen 5 — Transfer Monitor.
 *
 * Renders the client -> server stage pipeline from the transfer's `stages`
 * array and exposes the receiver-side decrypt action that advances the flow
 * to DECRYPTING / COMPLETED.
 */
export function TransferMonitorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { reachStep } = useFlow();
  const handoff = (location.state ?? {}) as { transfer?: TransferDetail; key?: string };

  const [transfer, setTransfer] = useState<TransferDetail | null>(handoff.transfer ?? null);
  const [loading, setLoading] = useState(!handoff.transfer);
  const [usingSample, setUsingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [decrypting, setDecrypting] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [decrypted, setDecrypted] = useState<DecryptResult | null>(null);

  /** Stage overlay used only while a decrypt request is in flight. */
  const [pendingStage, setPendingStage] = useState<TransferStage | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // Captured into a local so the cleanup clears the array this effect saw,
    // not whatever `.current` happens to point at when unmount runs.
    const scheduled = timers.current;
    return () => {
      scheduled.forEach((t) => window.clearTimeout(t));
      scheduled.length = 0;
    };
  }, []);

  const load = useCallback(async (options?: { background?: boolean }) => {
    if (!id) return;
    if (!options?.background) setLoading(true);
    setError(null);
    setUsingSample(false);

    try {
      const data = (await api.transfers.get(id)) as TransferDetail;
      setTransfer(data);
    } catch (err) {
      // A failed background refresh must not clobber the real transfer we
      // already have from the create response — only degrade to the sample
      // fixture when there was nothing real to show in the first place.
      if (options?.background) {
        return;
      }
      if (isOfflineError(err) || (err instanceof ApiError && err.code === "TRANSFER_NOT_FOUND")) {
        // Rewind the fixture to the RECEIVED state so the pipeline demo starts
        // mid-flow and the Decrypt action is actually exercisable. The fixture
        // itself is shared and must not be mutated.
        setTransfer({
          ...MOCK_TRANSFER_DETAIL,
          status: "RECEIVED",
          decrypted_content: undefined,
          stages: MOCK_TRANSFER_DETAIL.stages.filter(
            (s) => s.stage !== "DECRYPTING" && s.stage !== "COMPLETED",
          ),
        });
        setUsingSample(true);
      } else {
        setError(err instanceof ApiError ? err.message : "This transfer could not be loaded.");
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (handoff.transfer) {
      // The create response (POST /api/transfers) omits ciphertext — it only
      // carries stages/status. Render it immediately so the pipeline appears
      // instantly, but still fetch the full GET /api/transfers/{id} detail
      // in the background to backfill ciphertext/ciphertext_preview.
      setLoading(false);
      void load({ background: true });
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function handleDecrypt() {
    if (!transfer) return;
    setDecrypting(true);
    setDecryptError(null);

    // Surface DECRYPTING as the live stage while the request is in flight.
    setPendingStage({ stage: "DECRYPTING", status: "active", at: new Date().toISOString() });

    if (usingSample) {
      // Offline demo: advance the pipeline locally. The dwell that makes the
      // DECRYPTING stage readable is skipped under reduced motion.
      const dwell = prefersReducedMotion() ? 0 : 420;
      const timer = window.setTimeout(() => {
        setDecrypted({
          transfer_id: MOCK_TRANSFER_DETAIL.transfer_id,
          status: "COMPLETED",
          plaintext: MOCK_TRANSFER_DETAIL.decrypted_content ?? "",
          plaintext_size: MOCK_TRANSFER_DETAIL.plaintext_size,
          decryption_time_ms: 1.44,
          integrity_verified: true,
          stages: MOCK_TRANSFER_DETAIL.stages,
        });
        setPendingStage(null);
        setDecrypting(false);
      }, dwell);
      timers.current.push(timer);
      return;
    }

    try {
      const result = (await api.transfers.decrypt(transfer.id, handoff.key)) as DecryptResult;
      setDecrypted(result);
      setPendingStage(null);
      reachStep("server-receive");
    } catch (err) {
      setDecryptError(
        err instanceof ApiError ? err.message : "The document could not be decrypted.",
      );
      setPendingStage(null);
    } finally {
      setDecrypting(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.page} aria-busy="true">
        <p className="sr-only" role="status">
          Loading transfer…
        </p>
        <div className={styles.skeletonBody} aria-hidden="true">
          <div className={styles.skeletonPanel} />
          <div className={styles.skeletonPanel} />
        </div>
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Transfer Monitor</h2>
        <div className={[styles.banner, styles.bannerDanger].join(" ")} role="alert">
          <AlertIcon />
          <span>
            <span className={styles.bannerTitle}>Transfer unavailable. </span>
            <span className={styles.bannerBody}>{error ?? "No transfer to display."}</span>
          </span>
        </div>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => navigate("/transfers")}>
            Back to Transfers
          </Button>
          <Button onClick={() => void load()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Merge the reported stages into one timeline. Later sources win, so the
  // newest known state is what renders.
  //
  // While a decrypt is in flight the overlay must be the furthest-along entry,
  // so any stage at or after DECRYPTING is dropped first. Without this the
  // sample transfer (whose fixture already reports all five stages as done)
  // would render the impossible pair "Decrypting: active / Completed: done".
  const DECRYPT_ONWARD = new Set(["DECRYPTING", "COMPLETED"]);
  const baseStages = pendingStage
    ? transfer.stages.filter((s) => !DECRYPT_ONWARD.has(s.stage))
    : transfer.stages;

  const stages: TransferStage[] = [
    ...baseStages,
    ...(decrypted?.stages ?? []),
    ...(decrypted
      ? ([
          { stage: "DECRYPTING", status: "done", at: null },
          { stage: "COMPLETED", status: "done", at: null },
        ] as TransferStage[])
      : []),
    ...(pendingStage ? [pendingStage] : []),
  ];

  const status = decrypted?.status ?? transfer.status;
  const failed = status === "FAILED";
  const plaintext = decrypted?.plaintext ?? transfer.decrypted_content ?? "";
  const canDecrypt = !decrypted && !transfer.decrypted_content && status !== "FAILED";
  const isClientToServer = transfer.direction === "CLIENT_TO_SERVER";

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>{transfer.transfer_id}</span>
          <h2 className={styles.title}>{transfer.filename}</h2>
        </div>
        <div className={styles.headerMeta}>
          <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>
            {status === "RECEIVED" ? "Awaiting decryption" : status.toLowerCase()}
          </Badge>
          <Badge tone="accent">{transfer.algorithm.toUpperCase()}</Badge>
          <Badge tone="neutral">{formatBytes(transfer.plaintext_size)}</Badge>
        </div>
      </header>

      {usingSample && (
        <div className={[styles.banner, styles.bannerWarning].join(" ")} role="status">
          <AlertIcon />
          <span>
            <span className={styles.bannerTitle}>Showing a sample transfer. </span>
            <span className={styles.bannerBody}>
              The backend is unreachable, so this pipeline is running on demo data.
            </span>
          </span>
        </div>
      )}

      <div className={styles.body}>
        <Card padding="lg">
          <h3 className={styles.panelTitle}>Secure Transfer</h3>
          <StagePipeline
            stages={stages}
            failed={failed}
            senderLabel={isClientToServer ? "Client" : "Server"}
            receiverLabel={isClientToServer ? "Server" : "Client"}
          >
            {/* encryption_time_ms is absent on some transfer sources (e.g. a
                fetch via GET rather than the create response) — never crash
                the page over a missing timing figure. */}
            {typeof transfer.encryption_time_ms === "number" && (
              <span className={styles.actionHint}>
                Encryption took{" "}
                <strong>{transfer.encryption_time_ms.toFixed(2)} ms</strong>
              </span>
            )}
            {decrypted && typeof decrypted.decryption_time_ms === "number" && (
              <span className={styles.actionHint}>
                Decryption took{" "}
                <strong>{decrypted.decryption_time_ms.toFixed(2)} ms</strong>
              </span>
            )}
          </StagePipeline>
        </Card>

        <Card padding="lg">
          <div className={styles.payloadCard}>
            <h3 className={styles.panelTitle}>Payload</h3>

            <PlaintextCiphertextPanel
              reversed
              plaintext={plaintext}
              ciphertext={transfer.ciphertext_preview || transfer.ciphertext}
              ciphertextMeta={`${transfer.encrypted_size.toLocaleString()} B`}
              plaintextMeta={
                plaintext ? `${(decrypted?.plaintext_size ?? transfer.plaintext_size).toLocaleString()} B` : undefined
              }
              transformLabel="Decrypt"
              revealKey={plaintext ? `plain-${plaintext.length}` : undefined}
              emptyCiphertextLabel="No ciphertext recorded for this transfer."
            />

            {decrypted && decrypted.integrity_verified !== null && (
              <span className={[styles.integrity, decrypted.integrity_verified ? styles.integrityOk : styles.integrityFailed].join(" ")}>
                <ShieldCheckIcon />
                {decrypted.integrity_verified
                  ? "Integrity verified — authentication tag matched"
                  : "Integrity check failed — authentication tag did not match"}
              </span>
            )}

            {decrypted && decrypted.integrity_verified === null && (
              <span className={[styles.integrity, styles.integrityNeutral].join(" ")}>
                Integrity check not available — {formatAlgorithm(transfer.algorithm)} provides no authentication tag
              </span>
            )}

            {decryptError && (
              <div className={[styles.banner, styles.bannerDanger].join(" ")} role="alert">
                <AlertIcon />
                <span>
                  <span className={styles.bannerTitle}>Decryption failed. </span>
                  <span className={styles.bannerBody}>{decryptError}</span>
                </span>
              </div>
            )}

            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => navigate("/transfers")}>
                Back to Transfers
              </Button>
              <span className={styles.actionsSpacer} />
              {canDecrypt ? (
                <Button onClick={() => void handleDecrypt()} loading={decrypting}>
                  Decrypt Document
                </Button>
              ) : (
                <span className={styles.actionHint}>Document recovered successfully</span>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

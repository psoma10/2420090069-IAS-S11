import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { MOCK_DOCUMENTS, MOCK_TRANSFER_DETAIL } from "../lib/mockData";
import { ApiError } from "../lib/api";
import type { DocumentDetail, TransferDetail, TransferSummary } from "../types/api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { CopyButton, EmptyState, OfflineBanner, OfflineIcon, VaultIcon } from "../components/data";
import { useListResource } from "../components/data/useListResource";
import {
  directionTone,
  documentStatusTone,
  formatAlgorithm,
  formatBytes,
  formatBytesExact,
  formatDirection,
  formatTimestamp,
  titleCaseStatus,
  toDateTimeAttr,
} from "../lib/format";
import styles from "./DocumentDetailPage.module.css";

/** Mock detail used only when the API is unreachable — see mockData.ts. */
const MOCK_DETAIL: DocumentDetail = {
  ...MOCK_DOCUMENTS[0],
  content: MOCK_TRANSFER_DETAIL.decrypted_content ?? "This is the original document.",
  preview: MOCK_TRANSFER_DETAIL.decrypted_content ?? "This is the original document.",
};

function FileGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M11.5 2H5.5A2 2 0 0 0 3.5 4v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V7L11.5 2Z" strokeLinejoin="round" />
      <path d="M11.5 2v5h5" strokeLinejoin="round" />
    </svg>
  );
}

function BackArrow() {
  return (
    <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M8.5 3 4.5 7l4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DetailSkeleton() {
  return (
    <div className={styles.page}>
      <span className={[styles.skelLine, styles.skelTitle].join(" ")} />
      <Card className={styles.metaGrid} padding="sm">
        {["a", "b", "c", "d"].map((key) => (
          <div className={styles.metaItem} key={key}>
            <span className={styles.skelLine} style={{ width: "50%" }} />
            <span className={styles.skelLine} style={{ width: "75%", height: 16 }} />
          </div>
        ))}
      </Card>
      <Card className={styles.panel} padding="sm">
        <div className={styles.panelHead}>
          <span className={styles.skelLine} style={{ width: 140 }} />
        </div>
        <div className={styles.skelBody}>
          {[92, 78, 86, 60].map((width, index) => (
            <span className={styles.skelLine} style={{ width: `${width}%` }} key={index} />
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * The document endpoint returns plaintext only — ciphertext lives on the
 * transfer that carried this document (API_CONTRACT §3.5). Look up the most
 * recent transfer for this document so PRD Screen 6 can show both blocks.
 * Failure here is non-fatal: the page still renders without the cipher panel.
 */
function useDocumentCiphertext(documentId: number, enabled: boolean) {
  const [state, setState] = useState<{ transfer: TransferDetail | null; loading: boolean }>({
    transfer: null,
    loading: enabled,
  });

  useEffect(() => {
    if (!enabled) {
      setState({ transfer: null, loading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true }));

    api.transfers
      .list({ limit: 200 })
      .then(async (data) => {
        const payload = data as { transfers: TransferSummary[] };
        const match = (payload.transfers ?? []).find((transfer) => transfer.document_id === documentId);
        if (!match) return null;
        return (await api.transfers.get(match.id)) as TransferDetail;
      })
      .then((transfer) => {
        if (!cancelled) setState({ transfer, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const offline = error instanceof ApiError && (error.code === "NETWORK_ERROR" || error.code === "SERVER_UNAVAILABLE");
        setState({ transfer: offline ? MOCK_TRANSFER_DETAIL : null, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [documentId, enabled]);

  return state;
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const documentId = Number(id);
  const validId = Number.isInteger(documentId) && documentId > 0;

  const fetcher = useCallback(
    () =>
      api.documents.get(documentId).then((data) => ({ rows: [data as DocumentDetail], total: 1 })),
    [documentId],
  );

  const { rows, loading, offlineMessage, error, reload } = useListResource<DocumentDetail>({
    fetcher,
    fallback: [MOCK_DETAIL],
    deps: [documentId],
  });

  const doc = rows[0];
  const { transfer, loading: cipherLoading } = useDocumentCiphertext(documentId, validId && Boolean(doc));

  const contentStats = useMemo(() => {
    if (!doc?.content) return null;
    const lines = doc.content.split("\n").length;
    const characters = doc.content.length;
    return `${characters.toLocaleString("en-US")} chars · ${lines.toLocaleString("en-US")} lines`;
  }, [doc?.content]);

  if (!validId) {
    return (
      <div className={styles.page}>
        <EmptyState
          variant="danger"
          icon={<VaultIcon />}
          title="Invalid document reference"
          description="That document id is not a number. Pick a document from your vault instead."
          action={
            <Link to="/documents">
              <Button variant="secondary">Back to documents</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (loading) return <DetailSkeleton />;

  if (error || !doc) {
    return (
      <div className={styles.page}>
        <EmptyState
          variant="danger"
          icon={<OfflineIcon />}
          title="Could not load this document"
          description={error ?? "The document could not be found, or it belongs to another account."}
          action={
            <div className={styles.actions}>
              <Button variant="secondary" onClick={reload}>
                Retry
              </Button>
              <Link to="/documents">
                <Button variant="ghost">Back to documents</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <Link to="/documents" className={styles.back}>
        <BackArrow />
        All documents
      </Link>

      <div className={styles.head}>
        <div className={styles.identity}>
          <span className={styles.fileIcon} aria-hidden="true">
            <FileGlyph />
          </span>
          <div className={styles.titleBlock}>
            <span className={styles.eyebrow}>
              {doc.direction === "CLIENT_TO_SERVER" ? "Document uploaded" : "Document received"}
            </span>
            <h2 className={styles.filename}>{doc.filename}</h2>
          </div>
        </div>
        <div className={styles.actions}>
          <a
            className={styles.downloadLink}
            href={api.documents.downloadUrl(doc.id)}
            download={doc.filename}
            rel="noopener"
          >
            <Button variant="secondary">Download</Button>
          </a>
        </div>
      </div>

      {offlineMessage && <OfflineBanner message={offlineMessage} />}

      <Card className={styles.metaGrid} padding="sm">
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Size</span>
          <span className={styles.metaValue}>{formatBytes(doc.size)}</span>
          <span className={styles.metaSub}>{formatBytesExact(doc.size)}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Algorithm</span>
          <span className={[styles.metaValue, styles.metaValueMono].join(" ")}>{formatAlgorithm(doc.algorithm)}</span>
          <span className={styles.metaSub}>{doc.algorithm === "aes" ? "Authenticated (EAX)" : "Educational cipher"}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Direction</span>
          <span className={styles.metaBadgeRow}>
            <Badge tone={directionTone(doc.direction)}>{formatDirection(doc.direction)}</Badge>
          </span>
          <span className={styles.metaSub}>Limit {doc.direction === "CLIENT_TO_SERVER" ? "10 KB" : "5 KB"}</span>
        </div>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Status</span>
          <span className={styles.metaBadgeRow}>
            <Badge tone={documentStatusTone(doc.status)} dot>
              {titleCaseStatus(doc.status)}
            </Badge>
          </span>
          <time className={styles.metaSub} dateTime={toDateTimeAttr(doc.created_at)}>
            {formatTimestamp(doc.created_at)}
          </time>
        </div>
      </Card>

      <div className={styles.panels}>
        {(cipherLoading || transfer) && (
          <Card className={styles.panel} padding="sm">
            <div className={styles.panelHead}>
              <span className={styles.panelTitle}>
                <span className={styles.panelMarker} aria-hidden="true" />
                Ciphertext
              </span>
              {transfer && (
                <>
                  <span className={styles.panelMeta}>
                    {formatAlgorithm(transfer.algorithm)} · {formatBytes(transfer.encrypted_size)}
                  </span>
                  <CopyButton
                    value={transfer.ciphertext ?? ""}
                    className={styles.copyButton}
                    copiedClassName={styles.copied}
                    label="Copy"
                  />
                </>
              )}
            </div>
            {cipherLoading ? (
              <div className={styles.skelBody}>
                {[96, 88, 94, 70].map((width, index) => (
                  <span className={styles.skelLine} style={{ width: `${width}%` }} key={index} />
                ))}
              </div>
            ) : (
              <pre className={[styles.codeBlock, styles.cipherBlock].join(" ")}>
                <code>{transfer?.ciphertext || transfer?.ciphertext_preview || "No ciphertext recorded."}</code>
              </pre>
            )}
          </Card>
        )}

        <Card className={styles.panel} padding="sm">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>
              <span className={[styles.panelMarker, styles.panelMarkerMuted].join(" ")} aria-hidden="true" />
              {transfer ? "Decrypted content" : "Plaintext content"}
            </span>
            <span className={styles.panelMeta}>
              {contentStats}
              {"  "}
            </span>
            <CopyButton
              value={doc.content ?? ""}
              className={styles.copyButton}
              copiedClassName={styles.copied}
              label="Copy"
            />
          </div>
          <pre className={[styles.codeBlock, styles.plainBlock].join(" ")}>
            <code>{doc.content || doc.preview || "This document is empty."}</code>
          </pre>
        </Card>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { SharedDocument } from "../types/api";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/data";
import { formatAlgorithm, formatBytes, formatTimestamp, toDateTimeAttr } from "../lib/format";
import styles from "./SharedDocumentPage.module.css";

type State =
  | { phase: "loading" }
  | { phase: "ready"; doc: SharedDocument }
  | { phase: "unavailable" };

function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" strokeLinejoin="round" />
      <path d="m9.2 12.2 2 2 3.6-3.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UnavailableMark() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3Z" strokeLinejoin="round" />
      <path d="M9.5 9.5 12 12l2.5 2.5M14.5 9.5 12 12l-2.5 2.5" strokeLinecap="round" />
    </svg>
  );
}

function Wordmark() {
  return (
    <div className={styles.wordmark}>
      <span className={styles.wordmarkGlyph} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="4" y="10" width="16" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      </span>
      <span className={styles.wordmarkText}>CyberVault</span>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.skelHead}>
        <span className={[styles.skelLine, styles.skelTitle].join(" ")} />
        <span className={styles.skelLine} style={{ width: 180 }} />
      </div>
      <div className={styles.skelBody}>
        {[94, 82, 88, 66, 78].map((width, index) => (
          <span className={styles.skelLine} style={{ width: `${width}%` }} key={index} />
        ))}
      </div>
    </div>
  );
}

/**
 * Public landing view for /share/:token — the only screen in the app that
 * renders for a signed-out stranger, so it carries its own header and framing
 * rather than the authenticated AppShell.
 *
 * Revoked, expired and never-existed tokens all return an identical 404 from
 * the backend (API_CONTRACT §3.9, deliberate anti-enumeration). This component
 * mirrors that: every failure renders one neutral "not available" state, so
 * the UI never becomes the oracle the API refuses to be. That includes network
 * errors — telling a visitor "the server is down" vs "the link is gone" would
 * leak the same distinction the backend works to hide.
 */
export function SharedDocumentPage() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ phase: "unavailable" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading" });

    api.shares
      .getPublic(token)
      .then((doc) => {
        if (!cancelled) setState({ phase: "ready", doc });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: "unavailable" });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Wordmark />
        <span className={styles.topbarNote}>Secure document share</span>
      </header>

      <main className={styles.main}>
        {state.phase === "loading" && <PageSkeleton />}

        {state.phase === "unavailable" && (
          <div className={[styles.card, styles.unavailable].join(" ")}>
            <span className={styles.unavailableIcon} aria-hidden="true">
              <UnavailableMark />
            </span>
            <h1 className={styles.unavailableTitle}>This link is not available</h1>
            <p className={styles.unavailableBody}>
              The link may have been withdrawn by its owner, or it may have reached its expiry date.
              If you still need this document, ask the person who shared it to send you a new link.
            </p>
          </div>
        )}

        {state.phase === "ready" && (
          <article className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.shieldIcon} aria-hidden="true">
                <ShieldMark />
              </span>
              <div className={styles.headText}>
                <p className={styles.sharedBy}>
                  <strong>{state.doc.shared_by}</strong> shared a document with you
                </p>
                <h1 className={styles.filename}>{state.doc.filename}</h1>
                {state.doc.label && <p className={styles.label}>{state.doc.label}</p>}
              </div>
            </div>

            <dl className={styles.meta}>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Shared</dt>
                <dd className={styles.metaValue}>
                  <time dateTime={toDateTimeAttr(state.doc.shared_at)}>
                    {formatTimestamp(state.doc.shared_at)}
                  </time>
                </dd>
              </div>
              <div className={styles.metaItem}>
                <dt className={styles.metaLabel}>Size</dt>
                <dd className={styles.metaValue}>{formatBytes(state.doc.size)}</dd>
              </div>
              {state.doc.algorithm && (
                <div className={styles.metaItem}>
                  <dt className={styles.metaLabel}>Encryption</dt>
                  <dd className={styles.metaValue}>
                    <Badge tone="accent">{formatAlgorithm(state.doc.algorithm)}</Badge>
                  </dd>
                </div>
              )}
              {state.doc.expires_at && (
                <div className={styles.metaItem}>
                  <dt className={styles.metaLabel}>Link expires</dt>
                  <dd className={styles.metaValue}>
                    <time dateTime={toDateTimeAttr(state.doc.expires_at)}>
                      {formatTimestamp(state.doc.expires_at)}
                    </time>
                  </dd>
                </div>
              )}
            </dl>

            <section className={styles.contentPanel} aria-label="Shared document content">
              <div className={styles.contentHead}>
                <span className={styles.contentTitle}>
                  <span className={styles.marker} aria-hidden="true" />
                  Document
                </span>
                <CopyButton
                  value={state.doc.content ?? ""}
                  className={styles.copyButton}
                  copiedClassName={styles.copied}
                  label="Copy"
                />
              </div>
              <pre className={styles.contentBlock}>
                <code>{state.doc.content || "This document is empty."}</code>
              </pre>
            </section>
          </article>
        )}
      </main>

      <footer className={styles.footer}>
        <p className={styles.footerNote}>
          Shared securely via CyberVault. Only people with this link can view this document.
        </p>
      </footer>
    </div>
  );
}

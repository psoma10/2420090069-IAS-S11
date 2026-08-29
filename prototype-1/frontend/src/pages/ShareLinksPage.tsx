import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import type { ShareLink, ShareLinkList } from "../types/api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Modal } from "../components/ui/Modal";
import { CopyButton, EmptyState, PageHeader, VaultIcon } from "../components/data";
import { shareUrlFor } from "../lib/share";
import { formatTimestamp, toDateTimeAttr } from "../lib/format";
import styles from "./ShareLinksPage.module.css";

function RowSkeleton() {
  return (
    <Card className={styles.row} padding="sm">
      <div className={styles.rowMain}>
        <span className={[styles.skelLine, styles.skelTitle].join(" ")} />
        <span className={styles.skelLine} style={{ width: "60%" }} />
      </div>
    </Card>
  );
}

/** Server's `active` flag is authoritative; expired/revoked are only for labelling. */
function statusFor(share: ShareLink): { tone: "success" | "neutral" | "warning"; text: string } {
  if (share.revoked) return { tone: "neutral", text: "Revoked" };
  if (share.expired) return { tone: "warning", text: "Expired" };
  return { tone: "success", text: "Active" };
}

/**
 * Owner-facing management of every public link this account has created.
 *
 * Shows revoked/expired links too rather than hiding them — the owner is the
 * one party entitled to know a link's history, and seeing "Revoked" is how
 * they confirm a withdrawal actually took effect.
 */
export function ShareLinksPage() {
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ShareLink | null>(null);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: ShareLinkList = await api.shares.listAll();
      setShares(data.shares ?? []);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "Your share links could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = async () => {
    if (!pendingRevoke) return;
    setRevoking(true);
    try {
      const updated = await api.shares.revoke(pendingRevoke.id);
      // Merge rather than refetch: the DELETE response omits `filename`, so
      // keep the row's existing join data and take only the status fields.
      setShares((current) =>
        current.map((share) =>
          share.id === updated.id
            ? { ...share, revoked: updated.revoked, active: updated.active, expired: updated.expired }
            : share,
        ),
      );
      setPendingRevoke(null);
    } catch {
      setError("That link could not be revoked. Please try again.");
    } finally {
      setRevoking(false);
    }
  };

  const activeCount = shares.filter((share) => share.active).length;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Sharing"
        title="Share links"
        subtitle={
          loading
            ? "Loading your public links…"
            : `${activeCount} active ${activeCount === 1 ? "link" : "links"} of ${shares.length} total.`
        }
      />

      {error && (
        <Card className={styles.errorCard} padding="sm">
          <p className={styles.errorText}>{error}</p>
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </Card>
      )}

      {loading ? (
        <div className={styles.list}>
          <RowSkeleton />
          <RowSkeleton />
          <RowSkeleton />
        </div>
      ) : shares.length === 0 && !error ? (
        <EmptyState
          icon={<VaultIcon />}
          title="No share links yet"
          description="Open a document and choose Share to create a public link that anyone can open without an account."
          action={
            <Link to="/documents">
              <Button variant="secondary">Browse documents</Button>
            </Link>
          }
        />
      ) : (
        <div className={styles.list}>
          {shares.map((share) => {
            const status = statusFor(share);
            const url = shareUrlFor(share.share_path);
            return (
              <Card key={share.id} className={styles.row} padding="sm" data-testid={`share-row-${share.id}`}>
                <div className={styles.rowMain}>
                  <div className={styles.rowHead}>
                    <span className={styles.filename}>{share.filename ?? "Document"}</span>
                    <Badge tone={status.tone} dot>
                      {status.text}
                    </Badge>
                    {share.label && <span className={styles.label}>{share.label}</span>}
                  </div>

                  <div className={styles.urlRow}>
                    <span className={styles.url}>{url}</span>
                    {share.active && (
                      <CopyButton
                        value={url}
                        className={styles.copyButton}
                        copiedClassName={styles.copied}
                        label="Copy"
                      />
                    )}
                  </div>

                  <div className={styles.metaRow}>
                    <span className={styles.meta}>
                      {share.view_count} {share.view_count === 1 ? "view" : "views"}
                    </span>
                    <span className={styles.metaDivider} aria-hidden="true">
                      ·
                    </span>
                    <span className={styles.meta}>
                      Created{" "}
                      <time dateTime={toDateTimeAttr(share.created_at)}>
                        {formatTimestamp(share.created_at)}
                      </time>
                    </span>
                    {share.expires_at && (
                      <>
                        <span className={styles.metaDivider} aria-hidden="true">
                          ·
                        </span>
                        <span className={styles.meta}>
                          {share.expired ? "Expired" : "Expires"}{" "}
                          <time dateTime={toDateTimeAttr(share.expires_at)}>
                            {formatTimestamp(share.expires_at)}
                          </time>
                        </span>
                      </>
                    )}
                    {share.last_viewed_at && (
                      <>
                        <span className={styles.metaDivider} aria-hidden="true">
                          ·
                        </span>
                        <span className={styles.meta}>
                          Last viewed{" "}
                          <time dateTime={toDateTimeAttr(share.last_viewed_at)}>
                            {formatTimestamp(share.last_viewed_at)}
                          </time>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className={styles.rowActions}>
                  <Link to={`/documents/${share.document_id}`} className={styles.docLink}>
                    View document
                  </Link>
                  {share.active && (
                    <Button variant="danger" size="sm" onClick={() => setPendingRevoke(share)}>
                      Revoke
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={pendingRevoke !== null}
        onClose={() => setPendingRevoke(null)}
        title="Revoke this link?"
        description={
          pendingRevoke
            ? `Anyone holding the link to ${pendingRevoke.filename ?? "this document"} will lose access immediately. This cannot be undone — you would need to create a new link.`
            : undefined
        }
        size="sm"
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingRevoke(null)} disabled={revoking}>
              Keep link
            </Button>
            <Button variant="danger" onClick={() => void handleRevoke()} loading={revoking}>
              Revoke link
            </Button>
          </>
        }
      />
    </div>
  );
}

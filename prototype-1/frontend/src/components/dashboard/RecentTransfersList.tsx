import { Link } from "react-router-dom";
import { Badge } from "../ui/Badge";
import { EmptyState } from "./EmptyState";
import { ChevronRightIcon, InboxIcon } from "./icons";
import { absoluteTime, algorithmLabel, formatBytes, relativeTime } from "./format";
import styles from "./RecentTransfersList.module.css";
import type { TransferStatus, TransferSummary } from "../../types/api";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

const STATUS_TONE: Record<TransferStatus, Tone> = {
  COMPLETED: "success",
  RECEIVED: "info",
  PENDING: "warning",
  FAILED: "danger",
};

const STATUS_LABEL: Record<TransferStatus, string> = {
  COMPLETED: "Completed",
  RECEIVED: "Received",
  PENDING: "Pending",
  FAILED: "Failed",
};

interface RecentTransfersListProps {
  transfers: TransferSummary[];
}

/** Dense transfer rows; each row is one link target to /transfers/:id. */
export function RecentTransfersList({ transfers }: RecentTransfersListProps) {
  if (transfers.length === 0) {
    return (
      <EmptyState
        icon={<InboxIcon />}
        title="No transfers yet"
        description="Secure a document to send your first encrypted transfer. It will show up here with its algorithm and timing."
        action={
          <Link to="/upload" className={styles.emptyLink}>
            Secure a document
          </Link>
        }
      />
    );
  }

  return (
    <ul className={styles.list}>
      {transfers.map((transfer) => (
        <li key={transfer.transfer_id}>
          <Link to={`/transfers/${transfer.transfer_id}`} className={styles.row}>
            <span className={styles.primary}>
              <span className={styles.filename}>{transfer.filename}</span>
              <span className={styles.meta}>
                <span className={styles.transferId}>{transfer.transfer_id}</span>
                <span aria-hidden="true">·</span>
                <span>{algorithmLabel(transfer.algorithm)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(transfer.plaintext_size)}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {transfer.direction === "CLIENT_TO_SERVER" ? "Client to server" : "Server to client"}
                </span>
              </span>
            </span>

            <span className={styles.trailing}>
              <Badge tone={STATUS_TONE[transfer.status]} dot>
                {STATUS_LABEL[transfer.status]}
              </Badge>
              <time className={styles.time} dateTime={transfer.timestamp} title={absoluteTime(transfer.timestamp)}>
                {relativeTime(transfer.timestamp)}
              </time>
              <ChevronRightIcon className={styles.chevron} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

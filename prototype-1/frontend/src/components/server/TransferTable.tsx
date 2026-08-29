import { Link } from "react-router-dom";
import { Badge } from "../ui/Badge";
import { Skeleton } from "./PageState";
import { algorithmLabel, formatBytes, formatClockSeconds } from "./format";
import { formatDirection, transferStatusTone } from "../../lib/format";
import type { TransferSummary } from "../../types/api";
import styles from "./TransferTable.module.css";

/**
 * Recent transfers, per PRD FR-08.
 *
 * A real <table> at desktop width (screen readers get row/column semantics and
 * the numbers align) that reflows into one card per transfer below 768px,
 * where a 6-column grid would otherwise force horizontal scrolling.
 */
export function TransferTable({
  transfers,
  loading,
}: {
  transfers: TransferSummary[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className={styles.skeletonList}>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width="34%" />
            <Skeleton width="14%" />
            <Skeleton width="14%" />
            <Skeleton width="20%" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className="sr-only">
          Most recent document transfers handled by the server
        </caption>
        <thead>
          <tr>
            <th scope="col">Document</th>
            <th scope="col">Algorithm</th>
            <th scope="col" className={styles.numeric}>Size</th>
            <th scope="col">Direction</th>
            <th scope="col" className={styles.numeric}>Time</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {transfers.map((transfer) => (
            <tr key={transfer.transfer_id} className={styles.row}>
              <td data-label="Document">
                <Link to={`/transfers/${transfer.transfer_id}`} className={styles.filename}>
                  {transfer.filename}
                </Link>
                <span className={styles.transferId}>{transfer.transfer_id}</span>
              </td>
              <td data-label="Algorithm">
                <span className={styles.algorithm}>{algorithmLabel(transfer.algorithm)}</span>
              </td>
              <td data-label="Size" className={styles.numeric}>
                {formatBytes(transfer.encrypted_size)}
              </td>
              <td data-label="Direction">
                <span className={styles.direction}>
                  {formatDirection(transfer.direction)}
                </span>
              </td>
              <td data-label="Time" className={styles.numeric}>
                <time dateTime={transfer.timestamp}>{formatClockSeconds(transfer.timestamp)}</time>
              </td>
              <td data-label="Status">
                <Badge tone={transferStatusTone(transfer.status)} dot>
                  {transfer.status}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

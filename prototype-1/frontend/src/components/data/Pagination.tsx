import { Button } from "../ui/Button";
import styles from "./Pagination.module.css";

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onOffsetChange: (offset: number) => void;
  /** Noun for the summary line, e.g. "documents". */
  noun: string;
}

/** Offset pager matching the API's limit/offset contract (§3.4, §3.5). */
export function Pagination({ total, limit, offset, onOffsetChange, noun }: PaginationProps) {
  if (total <= limit) return null;

  const page = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <nav className={styles.pagination} aria-label={`${noun} pagination`}>
      <p className={styles.summary}>
        Showing <strong>{from}–{to}</strong> of <strong>{total}</strong> {noun}
      </p>
      <div className={styles.controls}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          disabled={offset === 0}
        >
          Previous
        </Button>
        <span className={styles.pageLabel} aria-live="polite">
          Page {page} of {pageCount}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onOffsetChange(offset + limit)}
          disabled={to >= total}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

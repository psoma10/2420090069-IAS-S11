import { Link } from "react-router-dom";
import styles from "./TableCells.module.css";

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M9 1.5H4.5A1.5 1.5 0 0 0 3 3v10a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 13 13V5.5L9 1.5Z" />
      <path d="M9 1.5V5.5H13" />
    </svg>
  );
}

interface FileCellProps {
  filename: string;
  to: string;
}

/**
 * Filename cell. The <Link> is the real keyboard target for the row — the
 * row's onClick is only a pointer convenience, so keyboard users still get a
 * single focusable, announceable link per row.
 */
export function FileCell({ filename, to }: FileCellProps) {
  return (
    <Link className={styles.rowLink} to={to}>
      <span className={styles.fileCell}>
        <span className={styles.fileIcon} aria-hidden="true">
          <FileIcon />
        </span>
        <span className={styles.fileName} title={filename}>
          {filename}
        </span>
      </span>
    </Link>
  );
}

export function AlgoCell({ children }: { children: React.ReactNode }) {
  return <span className={styles.algoCell}>{children}</span>;
}

export function MutedCell({ children }: { children: React.ReactNode }) {
  return <span className={styles.mutedCell}>{children}</span>;
}

/** Trailing affordance signalling the row navigates somewhere. */
export function ChevronCell() {
  return (
    <span className={styles.chevronCell} aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5 10.5 8 6 12.5" />
      </svg>
    </span>
  );
}

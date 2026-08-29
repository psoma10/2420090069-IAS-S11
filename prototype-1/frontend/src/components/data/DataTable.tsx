import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./DataTable.module.css";

export interface Column<T> {
  /** Stable key, also used as the sort key. */
  key: string;
  header: string;
  /** Right-align numeric columns so digits stack; see PRD FR-11 size column. */
  align?: "left" | "right" | "center";
  /** Fixed width so column edges stay put across pages of data. */
  width?: string;
  sortable?: boolean;
  render: (row: T) => ReactNode;
  /** Width of the shimmer bar used for this column while loading. */
  skeletonWidth?: string;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: string;
  direction: SortDirection;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  /** Row click/enter target. Renders rows as interactive when provided. */
  onRowActivate?: (row: T) => void;
  caption: string;
  loading?: boolean;
  skeletonRows?: number;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  /** Minimum table width before the internal scroller kicks in. */
  minWidth?: string;
  emptyState?: ReactNode;
}

function SortIcon({ active, direction }: { active: boolean; direction: SortDirection }) {
  return (
    <svg
      className={[styles.sortIcon, active ? styles.sortIconActive : "", active && direction === "desc" ? styles.sortIconDesc : ""]
        .filter(Boolean)
        .join(" ")}
      viewBox="0 0 10 10"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M5 1 L9 6 H1 Z" fill="currentColor" />
    </svg>
  );
}

/**
 * Dense sortable table with an internal horizontal scroller.
 *
 * Mobile approach (applied identically to every table in the app): the table
 * keeps real column widths and scrolls inside its own container, so the page
 * never scrolls sideways. Edge fades appear only when content is clipped.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowActivate,
  caption,
  loading = false,
  skeletonRows = 6,
  sort,
  onSortChange,
  minWidth = "720px",
  emptyState,
}: DataTableProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setOverflow({
      start: el.scrollLeft > 1,
      end: maxScroll > 1 && el.scrollLeft < maxScroll - 1,
    });
  }, []);

  useLayoutEffect(measure, [measure, rows, loading, columns]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const handleSort = (key: string) => {
    if (!onSortChange) return;
    const nextDirection: SortDirection = sort?.key === key && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ key, direction: nextDirection });
  };

  const alignClass = (align: Column<T>["align"]) =>
    align === "right" ? styles.alignRight : align === "center" ? styles.alignCenter : undefined;

  if (!loading && rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={styles.wrap}>
      <div
        className={[styles.fade, styles.fadeStart, overflow.start ? styles.fadeVisible : ""].filter(Boolean).join(" ")}
        aria-hidden="true"
      />
      <div
        className={[styles.fade, styles.fadeEnd, overflow.end ? styles.fadeVisible : ""].filter(Boolean).join(" ")}
        aria-hidden="true"
      />
      <div className={styles.scroller} ref={scrollerRef} onScroll={measure} tabIndex={0} role="group" aria-label={caption}>
        <table className={styles.table} style={{ "--table-min-width": minWidth } as React.CSSProperties}>
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            {columns.map((column) => (
              <col key={column.key} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sort?.key === column.key;
                const sortable = column.sortable && Boolean(onSortChange);
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={alignClass(column.align)}
                    aria-sort={isSorted ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={[styles.sortButton, isSorted ? styles.sortButtonActive : ""].filter(Boolean).join(" ")}
                        onClick={() => handleSort(column.key)}
                      >
                        {column.header}
                        <SortIcon active={isSorted} direction={isSorted ? sort.direction : "asc"} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: skeletonRows }, (_, rowIndex) => (
                  <tr key={`skeleton-${rowIndex}`} className={styles.row}>
                    {columns.map((column) => (
                      <td key={column.key} className={alignClass(column.align)}>
                        <span
                          className={styles.skeletonBar}
                          style={{
                            width: column.skeletonWidth ?? "70%",
                            marginLeft: column.align === "right" ? "auto" : undefined,
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={rowKey(row)}
                    className={[styles.row, onRowActivate ? styles.rowInteractive : ""].filter(Boolean).join(" ")}
                    onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className={alignClass(column.align)}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      <p className={styles.scrollHint}>Swipe the table sideways to see all columns.</p>
    </div>
  );
}

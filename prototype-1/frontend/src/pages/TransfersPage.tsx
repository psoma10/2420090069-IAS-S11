import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { MOCK_TRANSFERS } from "../lib/mockData";
import type { TransferSummary } from "../types/api";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import {
  AlgoCell,
  ChevronCell,
  DataTable,
  EmptyState,
  FileCell,
  FilterSelect,
  OfflineBanner,
  OfflineIcon,
  PageHeader,
  Pagination,
  VaultIcon,
  type Column,
  type SortState,
} from "../components/data";
import { useListResource } from "../components/data/useListResource";
import {
  directionTone,
  formatAlgorithm,
  formatBytes,
  formatDirection,
  formatTimestamp,
  titleCaseStatus,
  toDateTimeAttr,
  transferStatusTone,
} from "../lib/format";
import shell from "../components/data/ListShell.module.css";
import styles from "./TransfersPage.module.css";

const PAGE_SIZE = 25;

const DIRECTION_OPTIONS = [
  { value: "all", label: "All directions" },
  { value: "CLIENT_TO_SERVER", label: "Client → Server" },
  { value: "SERVER_TO_CLIENT", label: "Server → Client" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "COMPLETED", label: "Completed" },
  { value: "RECEIVED", label: "Received" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
];

const COMPARATORS: Record<string, (a: TransferSummary, b: TransferSummary) => number> = {
  filename: (a, b) => a.filename.localeCompare(b.filename),
  direction: (a, b) => a.direction.localeCompare(b.direction),
  algorithm: (a, b) => formatAlgorithm(a.algorithm).localeCompare(formatAlgorithm(b.algorithm)),
  encrypted_size: (a, b) => a.encrypted_size - b.encrypted_size,
  status: (a, b) => a.status.localeCompare(b.status),
  timestamp: (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
};

export function TransfersPage() {
  const navigate = useNavigate();
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SortState>({ key: "timestamp", direction: "desc" });

  const fetcher = useCallback(
    () =>
      api.transfers
        .list({
          direction: direction === "all" ? undefined : direction,
          status: status === "all" ? undefined : status,
          limit: PAGE_SIZE,
          offset,
        })
        .then((data) => {
          const payload = data as { transfers: TransferSummary[]; total: number };
          return { rows: payload.transfers ?? [], total: payload.total ?? 0 };
        }),
    [direction, status, offset],
  );

  const { rows, total, loading, offlineMessage, error, reload } = useListResource<TransferSummary>({
    fetcher,
    fallback: MOCK_TRANSFERS,
    deps: [direction, status, offset],
  });

  const sortedRows = useMemo(() => {
    const comparator = COMPARATORS[sort.key];
    if (!comparator) return rows;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => comparator(a, b) * factor);
  }, [rows, sort]);

  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setOffset(0);
  };

  const isFiltered = direction !== "all" || status !== "all";

  // Column set is exactly PRD FR-11: File, Sender, Receiver, Direction,
  // Algorithm, Size, Timestamp, Status. Sender/Receiver share one cell so the
  // pair reads as a single "who → whom" fact rather than two orphan columns.
  const columns: Column<TransferSummary>[] = [
    {
      key: "filename",
      header: "File",
      sortable: true,
      width: "26%",
      skeletonWidth: "80%",
      render: (row) => <FileCell filename={row.filename} to={`/transfers/${row.id}`} />,
    },
    {
      key: "parties",
      header: "Sender → Receiver",
      width: "170px",
      skeletonWidth: "80%",
      render: (row) => (
        <span className={styles.parties}>
          <span className={styles.party}>{row.sender}</span>
          <span className={styles.arrow} aria-hidden="true">
            →
          </span>
          <span className={styles.party}>{row.receiver}</span>
        </span>
      ),
    },
    {
      key: "direction",
      header: "Direction",
      sortable: true,
      width: "160px",
      skeletonWidth: "85%",
      render: (row) => <Badge tone={directionTone(row.direction)}>{formatDirection(row.direction)}</Badge>,
    },
    {
      key: "algorithm",
      header: "Algorithm",
      sortable: true,
      width: "110px",
      skeletonWidth: "60%",
      render: (row) => <AlgoCell>{formatAlgorithm(row.algorithm)}</AlgoCell>,
    },
    {
      key: "encrypted_size",
      header: "Size",
      sortable: true,
      align: "right",
      width: "110px",
      skeletonWidth: "55%",
      render: (row) => (
        <>
          <span className={styles.sizeValue}>{formatBytes(row.encrypted_size)}</span>
          <span className={styles.sizeSub}>from {formatBytes(row.plaintext_size)}</span>
        </>
      ),
    },
    {
      key: "timestamp",
      header: "Timestamp",
      sortable: true,
      align: "right",
      width: "170px",
      skeletonWidth: "70%",
      render: (row) => (
        <time className={styles.timestamp} dateTime={toDateTimeAttr(row.timestamp)}>
          {formatTimestamp(row.timestamp)}
        </time>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      width: "130px",
      skeletonWidth: "70%",
      render: (row) => (
        <Badge tone={transferStatusTone(row.status)} dot>
          {titleCaseStatus(row.status)}
        </Badge>
      ),
    },
    {
      key: "chevron",
      header: "",
      width: "44px",
      skeletonWidth: "14px",
      render: () => <ChevronCell />,
    },
  ];

  const emptyState = isFiltered ? (
    <EmptyState
      icon={<VaultIcon />}
      title="No transfers match these filters"
      description="Nothing in your history matches this direction and status combination yet."
      action={
        <Button
          variant="secondary"
          onClick={() => {
            setDirection("all");
            setStatus("all");
            setOffset(0);
          }}
        >
          Clear filters
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={<VaultIcon />}
      title="No transfers yet"
      description="Once you encrypt a document and send it to the server, every hop — encrypt, transmit, receive, decrypt — is recorded here."
      action={
        <Link to="/upload">
          <Button>Start a secure transfer</Button>
        </Link>
      }
    />
  );

  return (
    <div className={shell.page}>
      <PageHeader
        eyebrow="History"
        title="Transfers"
        subtitle="A complete audit trail of every encrypted exchange between the client and the server."
        actions={
          <Link to="/upload">
            <Button>Start a secure transfer</Button>
          </Link>
        }
      />

      <Card className={shell.panel} padding="sm">
        <div className={shell.toolbar}>
          <div className={shell.filters}>
            <FilterSelect
              label="Direction"
              value={direction}
              options={DIRECTION_OPTIONS}
              onChange={changeFilter(setDirection)}
            />
            <FilterSelect label="Status" value={status} options={STATUS_OPTIONS} onChange={changeFilter(setStatus)} />
          </div>
          {!loading && !error && (
            <p className={shell.resultCount}>
              <strong>{total}</strong> {total === 1 ? "transfer" : "transfers"}
            </p>
          )}
        </div>

        {offlineMessage && <OfflineBanner message={offlineMessage} />}

        {error ? (
          <EmptyState
            variant="danger"
            icon={<OfflineIcon />}
            title="Could not load transfer history"
            description={error}
            action={
              <Button variant="secondary" onClick={reload}>
                Retry
              </Button>
            }
          />
        ) : (
          <>
            <DataTable
              caption="Transfer history"
              columns={columns}
              rows={sortedRows}
              rowKey={(row) => row.transfer_id}
              loading={loading}
              sort={sort}
              onSortChange={setSort}
              minWidth="1040px"
              onRowActivate={(row) => navigate(`/transfers/${row.id}`)}
              emptyState={emptyState}
            />
            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} noun="transfers" />
          </>
        )}
      </Card>
    </div>
  );
}

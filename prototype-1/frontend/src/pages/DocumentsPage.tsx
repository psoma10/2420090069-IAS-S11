import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { MOCK_DOCUMENTS } from "../lib/mockData";
import type { DocumentSummary } from "../types/api";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
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
  documentStatusTone,
  formatAlgorithm,
  formatBytes,
  formatDirection,
  formatTimestamp,
  titleCaseStatus,
  toDateTimeAttr,
} from "../lib/format";
import shell from "../components/data/ListShell.module.css";
import styles from "./DocumentsPage.module.css";

const PAGE_SIZE = 25;

const DIRECTION_OPTIONS = [
  { value: "all", label: "All directions" },
  { value: "CLIENT_TO_SERVER", label: "Client → Server" },
  { value: "SERVER_TO_CLIENT", label: "Server → Client" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "UPLOADED", label: "Uploaded" },
  { value: "ENCRYPTED", label: "Encrypted" },
  { value: "TRANSFERRED", label: "Transferred" },
];

/** Sort comparators keyed by column. Sorting is applied to the current page. */
const COMPARATORS: Record<string, (a: DocumentSummary, b: DocumentSummary) => number> = {
  filename: (a, b) => a.filename.localeCompare(b.filename),
  size: (a, b) => a.size - b.size,
  algorithm: (a, b) => formatAlgorithm(a.algorithm).localeCompare(formatAlgorithm(b.algorithm)),
  direction: (a, b) => a.direction.localeCompare(b.direction),
  status: (a, b) => a.status.localeCompare(b.status),
  created_at: (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
};

export function DocumentsPage() {
  const navigate = useNavigate();
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SortState>({ key: "created_at", direction: "desc" });

  const fetcher = useCallback(
    () =>
      api.documents
        .list({
          direction: direction === "all" ? undefined : direction,
          status: status === "all" ? undefined : status,
          limit: PAGE_SIZE,
          offset,
        })
        .then((data) => {
          const payload = data as { documents: DocumentSummary[]; total: number };
          return { rows: payload.documents ?? [], total: payload.total ?? 0 };
        }),
    [direction, status, offset],
  );

  const { rows, total, loading, offlineMessage, error, reload } = useListResource<DocumentSummary>({
    fetcher,
    fallback: MOCK_DOCUMENTS,
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

  const columns: Column<DocumentSummary>[] = [
    {
      key: "filename",
      header: "File",
      sortable: true,
      width: "auto",
      skeletonWidth: "78%",
      render: (row) => <FileCell filename={row.filename} to={`/documents/${row.id}`} />,
    },
    {
      key: "size",
      header: "Size",
      sortable: true,
      align: "right",
      width: "100px",
      skeletonWidth: "50%",
      render: (row) => <span className={styles.sizeValue}>{formatBytes(row.size)}</span>,
    },
    {
      key: "algorithm",
      header: "Algorithm",
      sortable: true,
      width: "120px",
      skeletonWidth: "60%",
      render: (row) => <AlgoCell>{formatAlgorithm(row.algorithm)}</AlgoCell>,
    },
    {
      key: "direction",
      header: "Direction",
      sortable: true,
      width: "160px",
      skeletonWidth: "80%",
      render: (row) => <Badge tone={directionTone(row.direction)}>{formatDirection(row.direction)}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      width: "130px",
      skeletonWidth: "70%",
      render: (row) => (
        <Badge tone={documentStatusTone(row.status)} dot>
          {titleCaseStatus(row.status)}
        </Badge>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      align: "right",
      width: "170px",
      skeletonWidth: "70%",
      render: (row) => (
        <time className={styles.timestamp} dateTime={toDateTimeAttr(row.created_at)}>
          {formatTimestamp(row.created_at)}
        </time>
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
      title="No documents match these filters"
      description="Try clearing the direction or status filter to see the rest of your vault."
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
      title="Your vault is empty"
      description="Upload a human-readable .txt file to encrypt it and send it securely to the server. Client uploads are capped at 10 KB."
      action={
        <Link to="/upload">
          <Button>Secure a document</Button>
        </Link>
      }
    />
  );

  return (
    <div className={shell.page}>
      <PageHeader
        eyebrow="Vault"
        title="Documents"
        subtitle="Every file you have uploaded, with the algorithm it was secured with and where it is headed."
        actions={
          <Link to="/upload">
            <Button>Secure a document</Button>
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
              <strong>{total}</strong> {total === 1 ? "document" : "documents"}
            </p>
          )}
        </div>

        {offlineMessage && <OfflineBanner message={offlineMessage} />}

        {error ? (
          <EmptyState
            variant="danger"
            icon={<OfflineIcon />}
            title="Could not load your documents"
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
              caption="Uploaded documents"
              columns={columns}
              rows={sortedRows}
              rowKey={(row) => row.id}
              loading={loading}
              sort={sort}
              onSortChange={setSort}
              minWidth="820px"
              onRowActivate={(row) => navigate(`/documents/${row.id}`)}
              emptyState={emptyState}
            />
            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onOffsetChange={setOffset} noun="documents" />
          </>
        )}
      </Card>
    </div>
  );
}

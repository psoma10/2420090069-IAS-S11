import { useCallback } from "react";
import { api } from "../lib/api";
import { MOCK_ALGORITHMS } from "../lib/mockData";
import type { Algorithm, AlgorithmType } from "../types/api";
import { Badge } from "../components/ui/Badge";
import { Card } from "../components/ui/Card";
import { DataTable, OfflineBanner, PageHeader, type Column } from "../components/data";
import { useListResource } from "../components/data/useListResource";
import type { Tone } from "../lib/format";
import styles from "./AlgorithmsPage.module.css";

/** PRD §16 category wording, keyed off the contract's `type` field. */
const CATEGORY_LABEL: Record<AlgorithmType, string> = {
  classical: "Classical",
  educational: "Educational",
  modern: "Modern",
};

const CATEGORY_TONE: Record<AlgorithmType, Tone> = {
  classical: "info",
  educational: "warning",
  modern: "accent",
};

/** PRD §16 comparison table — "Category" column, verbatim intent. */
const CIPHER_CATEGORY: Record<string, string> = {
  caesar: "Substitution cipher",
  playfair: "Digraph substitution",
  sdes: "Symmetric block cipher",
  aes: "Symmetric block cipher",
};

/** PRD §16 "Primary Purpose" column. AES is the one secure-transfer choice. */
function primaryPurpose(id: string): { label: string; secure: boolean } {
  return id === "aes"
    ? { label: "Secure document transfer", secure: true }
    : { label: "Educational", secure: false };
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M9 1.5 15 4v5c0 3.5-2.5 6.6-6 7.5-3.5-.9-6-4-6-7.5V4l6-2.5Z" strokeLinejoin="round" />
      <path d="M6.25 8.75 8.25 10.75 12 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CardSkeleton() {
  return (
    <Card className={styles.skelCard}>
      <span className={styles.skelLine} style={{ width: "45%", height: 18 }} />
      <span className={styles.skelLine} style={{ width: "92%" }} />
      <span className={styles.skelLine} style={{ width: "78%" }} />
      <span className={styles.skelLine} style={{ width: "60%" }} />
    </Card>
  );
}

export function AlgorithmsPage() {
  const fetcher = useCallback(
    () => api.algorithms.list().then((data) => {
      const list = (data as Algorithm[]) ?? [];
      return { rows: list, total: list.length };
    }),
    [],
  );

  const { rows, loading, offlineMessage } = useListResource<Algorithm>({
    fetcher,
    fallback: MOCK_ALGORITHMS,
    deps: [],
  });

  // Non-network failures also land on the static list: this page is a reference
  // table, so an empty screen would be strictly worse than the known-good set.
  const algorithms = rows.length > 0 ? rows : MOCK_ALGORITHMS;

  const columns: Column<Algorithm>[] = [
    {
      key: "name",
      header: "Algorithm",
      width: "170px",
      skeletonWidth: "70%",
      render: (row) => <span className={styles.algoNameCell}>{row.name}</span>,
    },
    {
      key: "category",
      header: "Category",
      width: "200px",
      skeletonWidth: "80%",
      render: (row) => CIPHER_CATEGORY[row.id] ?? CATEGORY_LABEL[row.type],
    },
    {
      key: "type",
      header: "Type",
      width: "140px",
      skeletonWidth: "60%",
      render: (row) => <Badge tone={CATEGORY_TONE[row.type]}>{CATEGORY_LABEL[row.type]}</Badge>,
    },
    {
      key: "purpose",
      header: "Primary purpose",
      width: "220px",
      skeletonWidth: "85%",
      render: (row) => {
        const purpose = primaryPurpose(row.id);
        return (
          <span className={purpose.secure ? styles.purposeSecure : styles.purposeEducational}>{purpose.label}</span>
        );
      },
    },
    {
      key: "key_format",
      header: "Key format",
      skeletonWidth: "90%",
      render: (row) => <span className={styles.keyFormatCell}>{row.key_format}</span>,
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Cryptography"
        title="Algorithms"
        subtitle="The four ciphers CyberVault implements, how they differ, and which one to use for a real transfer."
      />

      {offlineMessage && <OfflineBanner message={offlineMessage} />}

      <div className={styles.notice}>
        <span className={styles.noticeIcon} aria-hidden="true">
          <ShieldIcon />
        </span>
        <div className={styles.noticeBody}>
          <p className={styles.noticeTitle}>AES is the preferred algorithm for document transfer</p>
          <p className={styles.noticeText}>
            Caesar, Playfair, and SDES are included to satisfy and demonstrate the academic cryptography requirements —
            they are teaching ciphers and offer no meaningful confidentiality. AES is the preferred modern algorithm
            among the four for the document-transfer demonstration, and the only one here that also provides an
            integrity check.
          </p>
        </div>
      </div>

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Available ciphers</h2>
          <p className={styles.sectionHint}>Each card lists the key the algorithm expects before it will encrypt.</p>
        </div>
        <div className={styles.grid}>
          {loading
            ? [0, 1, 2, 3].map((key) => <CardSkeleton key={key} />)
            : algorithms.map((algorithm) => {
                const purpose = primaryPurpose(algorithm.id);
                return (
                  <Card
                    key={algorithm.id}
                    className={[styles.algoCard, purpose.secure ? styles.recommended : ""].filter(Boolean).join(" ")}
                  >
                    <div className={styles.cardHead}>
                      <h3 className={styles.algoName}>{algorithm.name}</h3>
                      <Badge tone={CATEGORY_TONE[algorithm.type]}>{CATEGORY_LABEL[algorithm.type]}</Badge>
                    </div>
                    <p className={styles.algoDescription}>{algorithm.description}</p>
                    <div className={styles.specs}>
                      <div className={styles.spec}>
                        <span className={styles.specLabel}>Key format</span>
                        <span className={styles.specValue}>{algorithm.key_format}</span>
                      </div>
                      {algorithm.key_sizes.length > 0 && (
                        <div className={styles.spec}>
                          <span className={styles.specLabel}>Key sizes</span>
                          <span className={styles.keySizes}>
                            {algorithm.key_sizes.map((size) => (
                              <span className={styles.keySize} key={size}>
                                {size}-bit
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      <div className={styles.spec}>
                        <span className={styles.specLabel}>Primary purpose</span>
                        <span
                          className={[
                            styles.specValue,
                            purpose.secure ? styles.purposeSecure : styles.purposeEducational,
                          ].join(" ")}
                        >
                          {purpose.label}
                        </span>
                      </div>
                    </div>
                  </Card>
                );
              })}
        </div>
      </section>

      <section className={styles.section}>
        <div>
          <h2 className={styles.sectionTitle}>Side-by-side comparison</h2>
          <p className={styles.sectionHint}>The same four ciphers, compared on category and intended use.</p>
        </div>
        <Card className={styles.tablePanel} padding="sm">
          <DataTable
            caption="Algorithm comparison"
            columns={columns}
            rows={algorithms}
            rowKey={(row) => row.id}
            loading={loading}
            skeletonRows={4}
            minWidth="900px"
          />
        </Card>
      </section>
    </div>
  );
}

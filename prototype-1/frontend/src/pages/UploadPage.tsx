import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlgorithmSelector } from "../components/upload/AlgorithmSelector";
import { FileDropzone } from "../components/upload/FileDropzone";
import { KeyInput, validateKey } from "../components/upload/KeyInput";
import { formatSize, limitFor, readTextFile, validateFile, type Rejection } from "../components/upload/fileValidation";
import { Button } from "../components/ui/Button";
import { api, ApiError } from "../lib/api";
import { describeError, isOfflineCode } from "../lib/errorMessages";
import { MOCK_ALGORITHMS } from "../lib/mockData";
import type { Algorithm, AlgorithmId, Direction, DocumentSummary } from "../types/api";
import styles from "./UploadPage.module.css";

/**
 * Upload lifecycle. Explicit states rather than a pile of booleans, so
 * impossible combinations (uploading + rejected, say) cannot be represented.
 */
type Phase = "idle" | "validating" | "ready" | "uploading" | "success" | "error";

const DIRECTION: Direction = "CLIENT_TO_SERVER";
const DEFAULT_AES_SIZE = 256;

interface SubmitError {
  title: string;
  text: string;
  offline: boolean;
}

/**
 * PRD Screen 3 — FR-03 upload, FR-04 algorithm choice, FR-05 key management.
 *
 * Everything the server would reject is checked here first (type, size,
 * UTF-8 decodability, key format), so the common failures surface instantly
 * and next to the control that caused them.
 */
export function UploadPage() {
  const navigate = useNavigate();

  const [algorithms, setAlgorithms] = useState<Algorithm[]>([]);
  const [algorithmsLoading, setAlgorithmsLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");

  const [algorithmId, setAlgorithmId] = useState<AlgorithmId | null>(null);
  const [keySize, setKeySize] = useState(DEFAULT_AES_SIZE);
  const [key, setKey] = useState("");
  const [keyError, setKeyError] = useState<string | undefined>();
  const [keyGenerated, setKeyGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [submitError, setSubmitError] = useState<SubmitError | null>(null);
  const [uploaded, setUploaded] = useState<DocumentSummary | null>(null);
  const [attempted, setAttempted] = useState(false);

  const limit = limitFor(DIRECTION);
  const algorithm = useMemo(
    () => algorithms.find((a) => a.id === algorithmId) ?? null,
    [algorithms, algorithmId],
  );

  // FR-04: populate the selector from the API, falling back to the bundled
  // list only when the server is unreachable — never masking real errors.
  useEffect(() => {
    let cancelled = false;

    api.algorithms
      .list()
      .then((data) => {
        if (cancelled) return;
        const list = data as Algorithm[];
        setAlgorithms(list);
        setAlgorithmId((current) => current ?? (list.some((a) => a.id === "aes") ? "aes" : list[0]?.id ?? null));
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && isOfflineCode(err.code)) {
          setAlgorithms(MOCK_ALGORITHMS);
          setUsingFallback(true);
          setAlgorithmId((current) => current ?? "aes");
        } else {
          setSubmitError({
            title: "Algorithms unavailable",
            text: describeError(err),
            offline: false,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setAlgorithmsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Runs the full client-side gate: type/size, then a UTF-8 decode. */
  const handleSelect = useCallback(
    async (selected: File | null) => {
      setSubmitError(null);
      setUploaded(null);
      setPlaintext(null);

      if (!selected) {
        setFile(null);
        setRejection(null);
        setPhase("idle");
        return;
      }

      setFile(selected);

      const shapeProblem = validateFile(selected, DIRECTION);
      if (shapeProblem) {
        setRejection(shapeProblem);
        setPhase("error");
        return;
      }

      setRejection(null);
      setPhase("validating");

      const result = await readTextFile(selected);
      if ("rejection" in result) {
        setRejection(result.rejection);
        setPhase("error");
        return;
      }

      setPlaintext(result.text);
      setPhase("ready");
    },
    [],
  );

  function handleAlgorithmChange(id: AlgorithmId) {
    setAlgorithmId(id);
    // A key is only meaningful for the algorithm it was made for.
    setKey("");
    setKeyError(undefined);
    setKeyGenerated(false);
    setSubmitError(null);
  }

  function handleKeySizeChange(size: number) {
    setKeySize(size);
    setKey("");
    setKeyError(undefined);
    setKeyGenerated(false);
  }

  function handleKeyChange(next: string) {
    setKey(next);
    setKeyGenerated(false);
    // Only re-validate live once the user has already seen an error.
    if (keyError || attempted) setKeyError(validateKey(algorithm, next, keySize));
  }

  async function handleGenerate() {
    if (!algorithm) return;
    setGenerating(true);
    setKeyError(undefined);
    setSubmitError(null);
    try {
      const data = (await api.algorithms.generateKey(
        algorithm.id,
        algorithm.key_sizes.length ? keySize : undefined,
      )) as { key: string; key_size?: number };
      setKey(data.key);
      setKeyGenerated(true);
      if (data.key_size) setKeySize(data.key_size);
    } catch (err) {
      setSubmitError({
        title: err instanceof ApiError && isOfflineCode(err.code) ? "Can't reach the server" : "Key generation failed",
        text:
          err instanceof ApiError && isOfflineCode(err.code)
            ? "The CyberVault backend is not responding, so a key could not be generated. Enter one manually or start the server and retry."
            : describeError(err),
        offline: err instanceof ApiError && isOfflineCode(err.code),
      });
    } finally {
      setGenerating(false);
    }
  }

  const fileReady = phase === "ready" || phase === "uploading" || phase === "success";
  const canSubmit = fileReady && Boolean(algorithm) && Boolean(key.trim()) && phase !== "uploading";

  async function handleSubmit() {
    setAttempted(true);
    setSubmitError(null);

    if (!file || !fileReady) return;

    const keyProblem = validateKey(algorithm, key, keySize);
    setKeyError(keyProblem);
    if (keyProblem || !algorithm) return;

    setPhase("uploading");
    const form = new FormData();
    form.append("file", file);
    form.append("direction", DIRECTION);
    form.append("algorithm", algorithm.id);

    try {
      const document = (await api.documents.upload(form)) as DocumentSummary;
      setUploaded(document);
      setPhase("success");
    } catch (err) {
      setPhase("ready");
      if (err instanceof ApiError && isOfflineCode(err.code)) {
        setSubmitError({
          title: "Can't reach the server",
          text: "The document was not uploaded because the CyberVault backend is not responding. Confirm it is running on port 5000, then retry.",
          offline: true,
        });
      } else if (
        err instanceof ApiError &&
        (err.code === "FILE_TOO_LARGE" || err.code === "INVALID_FILE_TYPE" || err.code === "EMPTY_FILE")
      ) {
        // Server disagreed with our pre-check — show it on the file, not the form.
        setRejection({ code: err.code, title: "Upload failed", message: describeError(err) });
        setPhase("error");
      } else {
        setSubmitError({ title: "Upload failed", text: describeError(err), offline: false });
      }
    }
  }

  /** Hands the uploaded document to PRD Screen 4. */
  function goToPreview() {
    navigate("/upload/preview", {
      state: {
        documentId: uploaded?.id,
        filename: uploaded?.filename,
        size: uploaded?.size,
        algorithm: algorithm?.id,
        keySize: algorithm?.key_sizes.length ? keySize : undefined,
        key,
        plaintext,
      },
    });
  }

  function reset() {
    setFile(null);
    setRejection(null);
    setPlaintext(null);
    setUploaded(null);
    setSubmitError(null);
    setKey("");
    setKeyError(undefined);
    setKeyGenerated(false);
    setAttempted(false);
    setPhase("idle");
  }

  const stepTwoActive = fileReady;
  const keyComplete = Boolean(key.trim()) && !keyError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Step 1 of the secure transfer</p>
        <h1 className={styles.title}>Secure document upload</h1>
        <p className={styles.subtitle}>
          Choose a plain-text document, pick a cipher, and supply the key it will be encrypted with. Nothing is
          transmitted until you send it from the encryption preview.
        </p>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          {/* ---------------- Step 1: document ---------------- */}
          <section className={styles.step} aria-labelledby="step-file">
            <div className={styles.stepHead}>
              <span
                className={[styles.stepIndex, fileReady ? styles.stepIndexDone : styles.stepIndexActive].join(" ")}
                aria-hidden="true"
              >
                {fileReady ? "✓" : "1"}
              </span>
              <h2 className={styles.stepTitle} id="step-file">
                Select document
              </h2>
              <span className={styles.stepMeta}>.TXT &middot; MAX {formatSize(limit)}</span>
            </div>

            <FileDropzone
              file={file}
              rejection={rejection}
              limit={limit}
              disabled={phase === "uploading"}
              onSelect={handleSelect}
            />

            {phase === "validating" && (
              <p className={styles.validating} role="status">
                <span className={styles.spinner} aria-hidden="true" />
                Checking file type, size and readability…
              </p>
            )}

            {phase === "error" && rejection && (
              <div className={[styles.alert].join(" ")} role="alert">
                <span className={styles.alertIcon} aria-hidden="true">
                  !
                </span>
                <span className={styles.alertBody}>
                  <span className={styles.alertTitle}>{rejection.title}</span>
                  <span className={styles.alertText}>{rejection.message}</span>
                  <span className={styles.alertActions}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleSelect(null)}>
                      Choose another file
                    </Button>
                  </span>
                </span>
              </div>
            )}

            {plaintext && phase !== "error" && (
              <div className={styles.preview}>
                <span className={styles.previewLabel}>Plaintext preview</span>
                <pre className={styles.previewBox}>{plaintext.slice(0, 600)}
                  {plaintext.length > 600 ? "\n…" : ""}</pre>
              </div>
            )}
          </section>

          {/* ---------------- Step 2: algorithm ---------------- */}
          <section
            className={[styles.step, stepTwoActive ? "" : styles.stepLocked].filter(Boolean).join(" ")}
            aria-labelledby="step-algorithm"
          >
            <div className={styles.stepHead}>
              <span
                className={[styles.stepIndex, algorithmId && stepTwoActive ? styles.stepIndexDone : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {algorithmId && stepTwoActive ? "✓" : "2"}
              </span>
              <h2 className={styles.stepTitle} id="step-algorithm">
                Choose algorithm
              </h2>
            </div>

            <AlgorithmSelector
              algorithms={algorithms}
              value={algorithmId}
              loading={algorithmsLoading}
              disabled={!stepTwoActive || phase === "uploading"}
              usingFallback={usingFallback}
              onChange={handleAlgorithmChange}
            />
          </section>

          {/* ---------------- Step 3: key ---------------- */}
          <section
            className={[styles.step, stepTwoActive ? "" : styles.stepLocked].filter(Boolean).join(" ")}
            aria-labelledby="step-key"
          >
            <div className={styles.stepHead}>
              <span
                className={[styles.stepIndex, keyComplete && stepTwoActive ? styles.stepIndexDone : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden="true"
              >
                {keyComplete && stepTwoActive ? "✓" : "3"}
              </span>
              <h2 className={styles.stepTitle} id="step-key">
                Provide encryption key
              </h2>
            </div>

            <KeyInput
              algorithm={algorithm}
              value={key}
              keySize={keySize}
              error={keyError}
              generating={generating}
              disabled={!stepTwoActive || phase === "uploading"}
              wasGenerated={keyGenerated}
              onChange={handleKeyChange}
              onKeySizeChange={handleKeySizeChange}
              onGenerate={handleGenerate}
            />
          </section>

          {/* ---------------- Submit / result ---------------- */}
          {submitError && (
            <div
              className={[styles.alert, submitError.offline ? styles.alertWarning : ""].filter(Boolean).join(" ")}
              role="alert"
            >
              <span className={styles.alertIcon} aria-hidden="true">
                !
              </span>
              <span className={styles.alertBody}>
                <span className={styles.alertTitle}>{submitError.title}</span>
                <span className={styles.alertText}>{submitError.text}</span>
              </span>
            </div>
          )}

          {phase === "success" && uploaded ? (
            <section className={styles.success} aria-live="polite">
              <p className={styles.successBadge}>
                <span aria-hidden="true">✓</span> Upload complete
              </p>
              <h2 className={styles.successTitle}>{uploaded.filename} is ready for encryption</h2>
              <div className={styles.successFacts}>
                <span>{formatSize(uploaded.size)}</span>
                <span>{algorithm?.name.toUpperCase()}</span>
                <span>{uploaded.status}</span>
              </div>
              <div className={styles.successActions}>
                <Button type="button" onClick={goToPreview}>
                  Continue to encryption preview
                </Button>
                <Button type="button" variant="ghost" onClick={reset}>
                  Upload another document
                </Button>
              </div>
            </section>
          ) : (
            <div className={styles.submitBar}>
              <Button
                type="button"
                size="lg"
                onClick={handleSubmit}
                loading={phase === "uploading"}
                disabled={!canSubmit}
              >
                {phase === "uploading" ? "Uploading" : "Upload & continue"}
              </Button>
              <p className={styles.submitNote}>
                {!fileReady
                  ? "Select a valid .txt document to continue."
                  : !key.trim()
                    ? "Enter or generate a key to continue."
                    : "The document is uploaded first, then encrypted on the next screen."}
              </p>
            </div>
          )}
        </div>

        {/* ---------------- Summary rail ---------------- */}
        <aside className={styles.aside} aria-label="Upload readiness">
          <p className={styles.asideTitle}>Readiness</p>

          <ul className={styles.checklist}>
            <li className={[styles.check, fileReady ? styles.checkDone : ""].filter(Boolean).join(" ")}>
              <span className={styles.checkBox} aria-hidden="true">
                ✓
              </span>
              <span>
                Document
                <span className={styles.checkValue}>{file ? file.name : "None selected"}</span>
              </span>
            </li>
            <li
              className={[styles.check, algorithmId && stepTwoActive ? styles.checkDone : ""].filter(Boolean).join(" ")}
            >
              <span className={styles.checkBox} aria-hidden="true">
                ✓
              </span>
              <span>
                Algorithm
                <span className={styles.checkValue}>
                  {algorithm
                    ? algorithm.key_sizes.length
                      ? `${algorithm.name} · ${keySize}-bit`
                      : algorithm.name
                    : "Not chosen"}
                </span>
              </span>
            </li>
            <li
              className={[styles.check, keyComplete && stepTwoActive ? styles.checkDone : ""].filter(Boolean).join(" ")}
            >
              <span className={styles.checkBox} aria-hidden="true">
                ✓
              </span>
              <span>
                Key
                <span className={styles.checkValue}>
                  {key.trim() ? `${key.trim().length} characters` : "Not provided"}
                </span>
              </span>
            </li>
          </ul>

          <div className={styles.asideDivider} />

          <div className={styles.limits}>
            <span className={styles.limitRow}>
              <span>Direction</span>
              <span className={styles.limitValue}>Client → Server</span>
            </span>
            <span className={styles.limitRow}>
              <span>Max size</span>
              <span className={styles.limitValue}>{formatSize(limit)}</span>
            </span>
            <span className={styles.limitRow}>
              <span>Accepted</span>
              <span className={styles.limitValue}>.txt</span>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

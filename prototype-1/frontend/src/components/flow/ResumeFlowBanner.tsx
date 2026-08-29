import { Link, useLocation } from "react-router-dom";
import { useFlow, type FlowStepId } from "../../context/FlowContext";
import styles from "./ResumeFlowBanner.module.css";

/**
 * "Continue where you left off" affordance for the PRD section 20 demo.
 *
 * The journey spans six routes, but the sidebar offers eight unrelated
 * destinations. A presenter who detours to /algorithms or /documents
 * mid-demo has no way back into the flow other than remembering which
 * screen came next. This banner removes that recall burden by computing
 * the next step from flow state and linking straight to it.
 *
 * Renders nothing when no run is in progress, when the run is finished,
 * or when the user is already on the target route — so it never nags.
 */

interface NextStep {
  to: string;
  label: string;
  cta: string;
}

function nextStepFor(
  furthest: FlowStepId,
  transferId: number | null,
  returnTransferId: number | null,
): NextStep | null {
  switch (furthest) {
    case "upload":
      return { to: "/upload", label: "Choose an algorithm and key", cta: "Continue" };
    case "configure":
      return { to: "/upload/preview", label: "Review plaintext and ciphertext", cta: "View encryption" };
    case "encrypt":
      return { to: "/upload/preview", label: "Ready to transmit to the server", cta: "Send to server" };
    case "send":
      return transferId
        ? { to: `/transfers/${transferId}`, label: "Watch the server receive and decrypt", cta: "Open monitor" }
        : null;
    case "server-receive":
      return { to: "/server", label: "Server can now send a document back", cta: "Open server" };
    case "server-send":
      return returnTransferId
        ? { to: `/transfers/${returnTransferId}`, label: "Decrypt the document from the server", cta: "Decrypt" }
        : null;
    case "client-receive":
      return { to: "/transfers", label: "Review the full transfer history", cta: "View history" };
    default:
      return null;
  }
}

export function ResumeFlowBanner() {
  const { isActive, furthestStep, documentName, transferId, returnTransferId, resetFlow } = useFlow();
  const { pathname } = useLocation();

  if (!isActive) return null;

  const next = nextStepFor(furthestStep, transferId, returnTransferId);
  if (!next) return null;

  // Already there — the page itself is the affordance.
  if (pathname === next.to) return null;

  return (
    <div className={styles.banner} role="status">
      <span className={styles.body}>
        <span className={styles.title}>Transfer in progress</span>
        <span className={styles.detail}>
          {documentName && <span className={styles.file}>{documentName}</span>}
          {documentName ? " — " : ""}
          {next.label}
        </span>
      </span>
      <span className={styles.actions}>
        <button type="button" className={styles.dismiss} onClick={resetFlow}>
          Start over
        </button>
        <Link to={next.to} className={styles.cta}>
          {next.cta}
          <span className={styles.arrow} aria-hidden="true">
            &rarr;
          </span>
        </Link>
      </span>
    </div>
  );
}

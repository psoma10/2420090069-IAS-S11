import { Link } from "react-router-dom";
import { FLOW_STEP_ORDER, useFlow, type FlowStepId } from "../../context/FlowContext";
import styles from "./FlowStepper.module.css";

/**
 * Renders the PRD section 20 demonstration journey as a seven-stage rail.
 *
 * Purpose is orientation, not navigation: during a live demo the presenter
 * (and the examiner) can see which of the ten PRD steps has been completed
 * and what comes next. Completed stages are links so a presenter can jump
 * back to re-show a screen; upcoming stages are inert text, because letting
 * someone click "Client decrypts" before a transfer exists produces a dead
 * end — exactly the failure this component is meant to prevent.
 */

interface StepDef {
  id: FlowStepId;
  label: string;
  /** Route for this stage, or null when it depends on runtime ids. */
  path: string | null;
}

const STEPS: StepDef[] = [
  { id: "upload", label: "Upload", path: "/upload" },
  { id: "configure", label: "Algorithm & key", path: "/upload" },
  { id: "encrypt", label: "Encrypt", path: "/upload/preview" },
  { id: "send", label: "Send", path: "/upload/preview" },
  { id: "server-receive", label: "Server decrypts", path: null },
  { id: "server-send", label: "Server replies", path: "/server" },
  { id: "client-receive", label: "Client decrypts", path: null },
];

interface FlowStepperProps {
  /** The stage the current screen represents. Highlighted as "you are here". */
  current: FlowStepId;
}

export function FlowStepper({ current }: FlowStepperProps) {
  const { documentName, furthestStep, transferId, returnTransferId } = useFlow();

  const currentIndex = FLOW_STEP_ORDER.indexOf(current);
  const furthestIndex = FLOW_STEP_ORDER.indexOf(furthestStep);

  // Stages that resolve to a transfer route only once that transfer exists.
  function resolvePath(step: StepDef): string | null {
    if (step.id === "server-receive") return transferId ? `/transfers/${transferId}` : null;
    if (step.id === "client-receive") return returnTransferId ? `/transfers/${returnTransferId}` : null;
    return step.path;
  }

  return (
    <nav className={styles.wrap} aria-label="Secure transfer progress">
      <div className={styles.head}>
        <h2 className={styles.title}>Transfer progress</h2>
        {documentName && (
          <span className={styles.doc} title={documentName}>
            {documentName}
          </span>
        )}
      </div>

      <ol className={styles.list}>
        {STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isDone = index < currentIndex || (index <= furthestIndex && !isCurrent);
          const path = resolvePath(step);
          const linkable = isDone && path !== null;

          const stateClass = isCurrent ? styles.current : isDone ? styles.done : "";
          const content = (
            <>
              <span className={styles.marker} aria-hidden="true">
                {isDone ? "✓" : index + 1}
              </span>
              <span className={styles.label}>{step.label}</span>
            </>
          );

          return (
            <li key={step.id} className={[styles.step, stateClass].filter(Boolean).join(" ")}>
              {linkable ? (
                <Link to={path} className={styles.node} aria-current={isCurrent ? "step" : undefined}>
                  {content}
                </Link>
              ) : (
                <span className={styles.node} aria-current={isCurrent ? "step" : undefined}>
                  {content}
                </span>
              )}
              {index < STEPS.length - 1 && (
                <span
                  className={[styles.connector, index < currentIndex ? styles.connectorDone : ""]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

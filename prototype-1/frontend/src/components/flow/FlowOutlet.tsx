import { Outlet, useLocation } from "react-router-dom";
import { ResumeFlowBanner } from "./ResumeFlowBanner";
import { FlowStepper } from "./FlowStepper";
import { useFlow, type FlowStepId } from "../../context/FlowContext";
import styles from "./FlowOutlet.module.css";

/**
 * Layout route that pins the flow chrome above every authenticated page.
 *
 * Mounted in App.tsx between <AppShell /> and the page routes so this chrome
 * lives inside the shell's <main>, above whatever page is rendered. Kept
 * separate from AppShell because the shell is owned by the navigation work;
 * this keeps the two concerns independent and avoids edit collisions.
 *
 * Deriving the step from the route (rather than each page passing it down)
 * means the stepper appears on the journey screens without any page needing
 * to opt in — pages stay owned by their respective authors.
 */

/** Routes that are part of the PRD section 20 journey, and which step each is.
 *
 * The transfer id is parsed from the pathname rather than read via
 * useParams(): this is a pathless layout route sitting *above*
 * /transfers/:id, so the param has not been matched at this depth yet. */
function stepForRoute(pathname: string, transferId: number | null): FlowStepId | null {
  if (pathname === "/upload") return "upload";
  if (pathname === "/upload/preview") return "encrypt";
  const transferMatch = /^\/transfers\/([^/]+)$/.exec(pathname);
  if (transferMatch) {
    // The outbound transfer is the server-receive step; anything else is the
    // return leg the client decrypts.
    const routeId = transferMatch[1];
    return transferId !== null && String(transferId) === routeId ? "server-receive" : "client-receive";
  }
  if (pathname === "/server") return "server-send";
  return null;
}

export function FlowOutlet() {
  const { pathname } = useLocation();
  const { isActive, transferId } = useFlow();

  const step = stepForRoute(pathname, transferId);

  // The stepper is orientation for an in-progress run. Showing it on a
  // pristine /upload with nothing started would be noise, so it appears
  // only once a run is underway — except on /upload itself, where it
  // usefully previews the journey the user is about to begin.
  const showStepper = step !== null && (isActive || pathname === "/upload");

  return (
    <div className={styles.wrap}>
      <ResumeFlowBanner />
      {showStepper && <FlowStepper current={step} />}
      <Outlet />
    </div>
  );
}

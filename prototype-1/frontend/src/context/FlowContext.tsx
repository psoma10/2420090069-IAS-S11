import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import type { AlgorithmId, Direction } from "../types/api";

/**
 * Tracks the user's position in the PRD section 20 demonstration journey
 * (Upload -> Encrypt -> Send -> Server decrypt -> Server reply -> Client decrypt).
 *
 * The journey spans six routes. Without shared state each page would be a
 * dead end: /upload/preview cannot know which document was uploaded, and
 * nothing can offer "continue where you left off" after a detour to
 * /documents or /algorithms. This context is that connective tissue.
 *
 * Deliberately NOT a data cache — it stores ids and labels only. Pages
 * still fetch their own payloads from the API. Persisted to sessionStorage
 * so a mid-demo page refresh (a real risk during a live viva) does not
 * silently reset the flow.
 */

export type FlowStepId =
  | "upload"
  | "configure"
  | "encrypt"
  | "send"
  | "server-receive"
  | "server-send"
  | "client-receive";

export interface FlowState {
  /** Document chosen/uploaded by the client (PRD step 3). */
  documentId: number | null;
  documentName: string | null;
  documentSize: number | null;
  /** Algorithm + key size chosen (PRD step 4). Key itself is never stored. */
  algorithm: AlgorithmId | null;
  keySize: number | null;
  /** Outbound client -> server transfer (PRD steps 6-7). */
  transferId: number | null;
  transferDirection: Direction | null;
  /** Return server -> client transfer (PRD steps 8-9). */
  returnTransferId: number | null;
  /** Furthest step reached, so the stepper can show completed history. */
  furthestStep: FlowStepId;
}

const EMPTY: FlowState = {
  documentId: null,
  documentName: null,
  documentSize: null,
  algorithm: null,
  keySize: null,
  transferId: null,
  transferDirection: null,
  returnTransferId: null,
  furthestStep: "upload",
};

export const FLOW_STEP_ORDER: FlowStepId[] = [
  "upload",
  "configure",
  "encrypt",
  "send",
  "server-receive",
  "server-send",
  "client-receive",
];

function rank(step: FlowStepId): number {
  return FLOW_STEP_ORDER.indexOf(step);
}

interface FlowContextValue extends FlowState {
  /** Merge a partial update; `furthestStep` only ever moves forward. */
  updateFlow: (patch: Partial<FlowState>) => void;
  /** Mark a step reached without changing any other field. */
  reachStep: (step: FlowStepId) => void;
  /** Clear everything — "start a new transfer". */
  resetFlow: () => void;
  /** True once a document is selected, i.e. a demo run is underway. */
  isActive: boolean;
}

const FlowContext = createContext<FlowContextValue | null>(null);

const STORAGE_KEY = "cybervault.flow";

function readStored(): FlowState {
  if (typeof sessionStorage === "undefined") return EMPTY;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<FlowState>;
    // Spread over EMPTY so a stale shape from an older build cannot
    // introduce undefined fields that pages would then read.
    return { ...EMPTY, ...parsed };
  } catch {
    return EMPTY;
  }
}

export function FlowProvider({ children }: { children: ReactNode }) {
  const [stored, setState] = useState<FlowState>(readStored);
  const { status } = useAuth();

  // Flow state is per-user. Derived during render rather than reset in an
  // effect so there is never a frame where a signed-out (or newly signed-in)
  // user can see the previous user's filename and transfer ids.
  const state = status === "anonymous" ? EMPTY : stored;

  useEffect(() => {
    // Only mirror a real session's state. While anonymous the key is cleared
    // instead, so logging in as someone else cannot resume a foreign run.
    try {
      if (status === "anonymous") sessionStorage.removeItem(STORAGE_KEY);
      else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private-mode / quota failures must not break the flow.
    }
  }, [state, status]);

  const updateFlow = useCallback((patch: Partial<FlowState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      // furthestStep is monotonic: revisiting /upload must not erase the
      // fact that the user already reached "send".
      if (patch.furthestStep && rank(patch.furthestStep) < rank(prev.furthestStep)) {
        next.furthestStep = prev.furthestStep;
      }
      return next;
    });
  }, []);

  const reachStep = useCallback(
    (step: FlowStepId) => {
      updateFlow({ furthestStep: step });
    },
    [updateFlow],
  );

  const resetFlow = useCallback(() => {
    setState(EMPTY);
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      updateFlow,
      reachStep,
      resetFlow,
      isActive: state.documentId !== null,
    }),
    [state, updateFlow, reachStep, resetFlow],
  );

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>;
}

export function useFlow(): FlowContextValue {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow must be used within FlowProvider");
  return ctx;
}

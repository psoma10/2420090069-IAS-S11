import { useCallback, useEffect, useRef, useState } from "react";

type Politeness = "polite" | "assertive";

/**
 * Screen-reader announcements for state changes that have no visible
 * focus move — the single biggest a11y gap in a status-driven app like
 * CyberVault (encrypting, transferring, decrypted, transfer failed).
 *
 * A sighted user sees a progress bar advance or a badge flip to SUCCESS.
 * A screen-reader user is told nothing unless that change lands in a live
 * region. This hook gives you one.
 *
 * USAGE — render the region once per page, then announce on change:
 *
 *   const { announce, liveRegionProps } = useAnnounce();
 *
 *   async function handleEncrypt() {
 *     announce("Encrypting document with AES-256");
 *     const result = await api.encrypt(...);
 *     announce(`Encryption complete. ${result.bytes} bytes of ciphertext produced.`);
 *   }
 *
 *   return (
 *     <>
 *       <div {...liveRegionProps} />
 *       ...
 *     </>
 *   );
 *
 * The spread element must be rendered on the FIRST paint and must stay
 * mounted. Assistive tech only reports mutations inside a live region it
 * was already observing, so a region that appears at the same moment as
 * its message is usually missed entirely.
 *
 * Use "assertive" only for errors that interrupt the user's task (transfer
 * failed, key rejected). Everything else should be "polite" so it queues
 * behind whatever the user is currently reading.
 */
export function useAnnounce(politeness: Politeness = "polite") {
  const [message, setMessage] = useState("");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((text: string) => {
    if (resetTimer.current) clearTimeout(resetTimer.current);

    // Clearing first guarantees a re-announcement when the same string is
    // sent twice in a row (e.g. two consecutive "Transfer failed" attempts).
    // Without this, the DOM text is unchanged and nothing is spoken.
    setMessage("");
    resetTimer.current = setTimeout(() => setMessage(text), 60);
  }, []);

  useEffect(() => {
    return () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const liveRegionProps = {
    className: "sr-only",
    role: politeness === "assertive" ? ("alert" as const) : ("status" as const),
    "aria-live": politeness,
    "aria-atomic": true,
    children: message,
  };

  return { announce, message, liveRegionProps };
}

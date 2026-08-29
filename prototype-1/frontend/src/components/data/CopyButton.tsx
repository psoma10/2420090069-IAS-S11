import { useEffect, useState } from "react";

interface CopyButtonProps {
  value: string;
  className: string;
  copiedClassName: string;
  label?: string;
}

/**
 * Copy-to-clipboard control for ciphertext/plaintext panels. Falls back
 * silently when the Clipboard API is unavailable (non-secure origins).
 */
export function CopyButton({ value, className, copiedClassName, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      className={[className, copied ? copiedClassName : ""].filter(Boolean).join(" ")}
      onClick={() => void handleCopy()}
    >
      {copied ? (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M2 6.5 4.5 9 10 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          <rect x="4" y="4" width="7" height="7" rx="1.5" />
          <path d="M8 1.5H2.5A1 1 0 0 0 1.5 2.5V8" />
        </svg>
      )}
      {copied ? "Copied" : label}
    </button>
  );
}

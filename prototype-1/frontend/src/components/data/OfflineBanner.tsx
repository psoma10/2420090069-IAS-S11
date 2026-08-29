import styles from "./ListShell.module.css";

/** Inline notice shown when a list rendered from mock data after a network failure. */
export function OfflineBanner({ message }: { message: string }) {
  return (
    <p className={styles.banner} role="status">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M8 1.5 15 14H1L8 1.5Z" strokeLinejoin="round" />
        <path d="M8 6v3.5" strokeLinecap="round" />
        <circle cx="8" cy="11.75" r="0.75" fill="currentColor" stroke="none" />
      </svg>
      {message}
    </p>
  );
}

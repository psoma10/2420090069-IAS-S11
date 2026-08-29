/**
 * Builds the absolute, shareable URL from the server-provided `share_path`.
 *
 * The backend deliberately returns a path rather than a full URL — it has no
 * reliable knowledge of the public origin the frontend is served from. Joining
 * happens here, at the one place that does know.
 */
export function shareUrlFor(sharePath: string): string {
  if (typeof window === "undefined") return sharePath;
  return `${window.location.origin}${sharePath}`;
}

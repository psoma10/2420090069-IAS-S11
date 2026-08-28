import type { ElementType, ReactNode } from "react";

interface VisuallyHiddenProps {
  children: ReactNode;
  /**
   * Element to render. Use "span" inside phrasing content (default),
   * "div" when the hidden text sits between block elements.
   */
  as?: ElementType;
}

/**
 * Renders text that is invisible on screen but read by screen readers.
 *
 * Use this instead of hand-rolling `.sr-only` classes in page CSS modules.
 * The underlying `.sr-only` utility lives in src/styles/base.css, so this
 * component and the raw class stay visually identical.
 *
 * WHEN TO USE (common cases in CyberVault):
 *
 * 1. Icon-only buttons — give the control a real accessible name:
 *      <button onClick={copy}>
 *        <CopyIcon aria-hidden="true" />
 *        <VisuallyHidden>Copy ciphertext to clipboard</VisuallyHidden>
 *      </button>
 *
 * 2. Extending a terse visible label with context a sighted user gets
 *    from layout but a screen-reader user does not:
 *      <th>Size<VisuallyHidden> in kilobytes</VisuallyHidden></th>
 *
 * 3. Table/section headings that are visually implied by design:
 *      <h2><VisuallyHidden>Recent transfers</VisuallyHidden></h2>
 *
 * DO NOT use it to hide text that sighted users also need, and do not
 * wrap interactive elements in it — a focusable element inside a
 * visually-hidden container becomes a keyboard trap with no visible focus.
 * For skip links (which must appear on focus) use the `.skip-link` class.
 */
export function VisuallyHidden({ children, as: Tag = "span" }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}

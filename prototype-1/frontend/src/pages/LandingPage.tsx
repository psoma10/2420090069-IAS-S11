import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { api } from "../lib/api";
import type { Algorithm, ServerStatus } from "../types/api";
import styles from "./LandingPage.module.css";

/**
 * Public front door (rendered at "/" for signed-out visitors only — App.tsx
 * sends authenticated sessions straight to /dashboard).
 *
 * Renders standalone, outside AppShell, so it carries its own header and
 * footer. Tone is deliberately honest: CyberVault is an academic security
 * demonstration, so this page explains the mechanism rather than selling an
 * enterprise product. No fabricated customers, metrics, or testimonials.
 */

/* ---------------------------------------------------------------- icons -- */

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 8h11M9.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="4" y="8.5" width="12" height="8" rx="2" />
      <path d="M6.75 8.5V6a3.25 3.25 0 0 1 6.5 0v2.5" strokeLinecap="round" />
    </svg>
  );
}

function TransmitIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 10h15M13 5.5l4.5 4.5L13 14.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 5.5v9" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function VerifyIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M10 2.5 16.5 5v5c0 3.7-2.7 7-6.5 7.9C6.2 17 3.5 13.7 3.5 10V5L10 2.5Z" strokeLinejoin="round" />
      <path d="M7.25 9.9 9.4 12l3.9-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ------------------------------------------------------------- content --- */

interface Step {
  id: string;
  label: string;
  title: string;
  body: string;
  icon: () => React.JSX.Element;
}

/** PRD §2 pipeline, translated from the ASCII diagram into three real stages. */
const STEPS: Step[] = [
  {
    id: "encrypt",
    label: "01",
    title: "Encrypt",
    body:
      "Upload a .txt document and choose a cipher. You supply a key or generate one, then see the plaintext and the resulting ciphertext side by side before anything leaves the client.",
    icon: LockIcon,
  },
  {
    id: "transfer",
    label: "02",
    title: "Transfer",
    body:
      "Only the ciphertext crosses the wire. The server stores and forwards the encrypted payload with its metadata — algorithm, key format, size, and timestamp — never the original text.",
    icon: TransmitIcon,
  },
  {
    id: "verify",
    label: "03",
    title: "Verify",
    body:
      "The receiving end decrypts with the matching key and the recovered document is compared against the original. Every transfer is logged, so a wrong key fails visibly rather than silently.",
    icon: VerifyIcon,
  },
];

interface AlgoCard {
  id: string;
  name: string;
  category: string;
  tone: "info" | "warning" | "accent";
  typeLabel: string;
  body: string;
  keyFormat: string;
  recommended: boolean;
}

/**
 * Mirrors AlgorithmsPage's framing (PRD §16): AES is the one algorithm meant
 * for real transfers; the other three are comparative/educational. Static so
 * the page renders fully with the backend cold — the live fetch below only
 * upgrades the header count, it is never required for content.
 */
const ALGORITHMS: AlgoCard[] = [
  {
    id: "caesar",
    name: "Caesar Cipher",
    category: "Substitution cipher",
    tone: "info",
    typeLabel: "Classical",
    body: "Shifts each character by a fixed amount. Trivially broken by frequency analysis, and useful precisely because it is.",
    keyFormat: "Integer shift 0–25",
    recommended: false,
  },
  {
    id: "playfair",
    name: "Playfair Cipher",
    category: "Digraph substitution",
    tone: "info",
    typeLabel: "Classical",
    body: "Encrypts letter pairs through a 5×5 key square, showing how digraph substitution resists naive letter counting.",
    keyFormat: "Alphabetic keyword",
    recommended: false,
  },
  {
    id: "sdes",
    name: "SDES",
    category: "Symmetric block cipher",
    tone: "warning",
    typeLabel: "Educational",
    body: "A deliberately small DES: the same permutation and key-schedule structure at a scale you can trace by hand.",
    keyFormat: "10-bit binary string",
    recommended: false,
  },
  {
    id: "aes",
    name: "AES",
    category: "Symmetric block cipher",
    tone: "accent",
    typeLabel: "Modern",
    body: "Authenticated EAX mode via PyCryptodome. The default for any transfer where confidentiality actually matters.",
    keyFormat: "Hex key — 128, 192 or 256-bit",
    recommended: true,
  },
];

/* ---------------------------------------------------------------- page --- */

export function LandingPage() {
  // Both endpoints are public. Failure is silent and total: if the backend is
  // cold the page simply renders without live numbers, never an error state.
  const [algorithmCount, setAlgorithmCount] = useState<number | null>(null);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    api.algorithms
      .list()
      .then((data) => {
        if (cancelled) return;
        const list = data as Algorithm[];
        if (Array.isArray(list) && list.length > 0) setAlgorithmCount(list.length);
      })
      .catch(() => undefined);

    api.server
      .status()
      .then((data) => {
        if (cancelled) return;
        setServerOnline((data as ServerStatus).status === "online");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link to="/" className={styles.brand} aria-label="CyberVault home">
            <span className={styles.brandMark} aria-hidden="true" />
            CyberVault
          </Link>

          <nav className={styles.headerNav} aria-label="Account">
            <Link to="/login" className={styles.navLink}>
              Log in
            </Link>
            <Link to="/register" className={styles.navCta}>
              Create account
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className={styles.main}>
        {/* ------------------------------------------------------- hero -- */}
        <section className={styles.hero}>
          <div className={styles.heroTexture} aria-hidden="true" />
          <div className={styles.heroGrid} aria-hidden="true" />

          <div className={styles.heroInner}>
            <div className={styles.heroCopy}>
              <p className={styles.eyebrow}>Encrypt. Transfer. Verify.</p>

              <h1 className={styles.heroTitle}>
                A document never leaves this client
                <br className={styles.titleBreak} /> as plaintext.
              </h1>

              <p className={styles.heroLead}>
                CyberVault is a client–server document exchange built to make symmetric encryption
                visible. Upload a text file, pick a cipher, and watch the plaintext become ciphertext,
                cross the network, and come back out the other side — every step on screen.
              </p>

              <div className={styles.heroActions}>
                <Link to="/register" className={styles.primaryCta}>
                  Create an account
                  <span className={styles.ctaIcon} aria-hidden="true">
                    <ArrowIcon />
                  </span>
                </Link>
                <Link to="/login" className={styles.secondaryCta}>
                  Log in
                </Link>
              </div>

              <dl className={styles.heroMeta}>
                <div className={styles.metaItem}>
                  <dt className={styles.metaLabel}>Algorithms</dt>
                  <dd className={styles.metaValue}>{algorithmCount ?? 4}</dd>
                </div>
                <div className={styles.metaItem}>
                  <dt className={styles.metaLabel}>Transfer cipher</dt>
                  <dd className={styles.metaValue}>AES</dd>
                </div>
                {serverOnline !== null && (
                  <div className={styles.metaItem}>
                    <dt className={styles.metaLabel}>Server</dt>
                    <dd className={styles.metaValue}>
                      <span
                        className={serverOnline ? styles.statusDotOnline : styles.statusDotOffline}
                        aria-hidden="true"
                      />
                      {serverOnline ? "Online" : "Offline"}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Ciphertext specimen — the product's actual output, not an
                abstract illustration. Decorative, so hidden from AT. */}
            <div className={styles.specimen} aria-hidden="true">
              <div className={styles.specimenBar}>
                <span className={styles.specimenDots}>
                  <i />
                  <i />
                  <i />
                </span>
                <span className={styles.specimenTitle}>encryption preview</span>
              </div>

              <div className={styles.specimenBody}>
                <div className={styles.specimenBlock}>
                  <span className={styles.specimenLabel}>Plaintext</span>
                  <pre className={styles.specimenText}>
{`Quarterly audit summary.
Access restricted to holders
of the transfer key.`}
                  </pre>
                </div>

                <div className={styles.specimenDivider}>
                  <span className={styles.specimenAlgo}>AES-256 · EAX</span>
                </div>

                <div className={styles.specimenBlock}>
                  <span className={styles.specimenLabel}>Ciphertext</span>
                  <pre className={styles.specimenCipher}>
{`9f2c41ab7e05d3661c8be40a2f97
55d0e1a6b38c74f2091dae6c5b83
27fc10b9d4e8a35726ff0c9184ad`}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ how it works -- */}
        <section className={styles.section} aria-labelledby="how-heading">
          <div className={styles.sectionInner}>
            <header className={styles.sectionHead}>
              <p className={styles.sectionEyebrow}>How it works</p>
              <h2 id="how-heading" className={styles.sectionTitle}>
                Three stages, all of them inspectable
              </h2>
              <p className={styles.sectionLead}>
                The encryption layer sits between the document and the channel. Nothing about it is
                hidden — that is the point of the project.
              </p>
            </header>

            <ol className={styles.steps}>
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.id} className={styles.step} style={{ "--i": index } as React.CSSProperties}>
                    <div className={styles.stepHead}>
                      <span className={styles.stepIcon} aria-hidden="true">
                        <Icon />
                      </span>
                      <span className={styles.stepNum}>{step.label}</span>
                    </div>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepBody}>{step.body}</p>
                    {index < STEPS.length - 1 && (
                      <span className={styles.stepConnector} aria-hidden="true">
                        <ArrowIcon />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>

            <p className={styles.pipeline} aria-hidden="true">
              <span className={styles.pipeNode}>document.txt</span>
              <span className={styles.pipeArrow}>→</span>
              <span className={styles.pipeNode}>cipher + key</span>
              <span className={styles.pipeArrow}>→</span>
              <span className={styles.pipeNodeActive}>ciphertext</span>
              <span className={styles.pipeArrow}>→</span>
              <span className={styles.pipeNode}>server</span>
              <span className={styles.pipeArrow}>→</span>
              <span className={styles.pipeNode}>decrypt</span>
              <span className={styles.pipeArrow}>→</span>
              <span className={styles.pipeNode}>document.txt</span>
            </p>
          </div>
        </section>

        {/* -------------------------------------------------- algorithms -- */}
        <section className={styles.section} aria-labelledby="algos-heading">
          <div className={styles.sectionInner}>
            <header className={styles.sectionHead}>
              <p className={styles.sectionEyebrow}>Algorithms</p>
              <h2 id="algos-heading" className={styles.sectionTitle}>
                Four ciphers, one of them for real work
              </h2>
              <p className={styles.sectionLead}>
                Caesar, Playfair and SDES are included for comparison — they make the mechanics of
                substitution and block encryption legible. AES is the one to use when the contents
                actually need protecting.
              </p>
            </header>

            <div className={styles.algoGrid}>
              {ALGORITHMS.map((algo) => (
                <article
                  key={algo.id}
                  className={algo.recommended ? styles.algoCardFeatured : styles.algoCard}
                >
                  <div className={styles.algoTop}>
                    <h3 className={styles.algoName}>{algo.name}</h3>
                    <Badge tone={algo.tone}>{algo.typeLabel}</Badge>
                  </div>

                  <p className={styles.algoCategory}>{algo.category}</p>
                  <p className={styles.algoBody}>{algo.body}</p>

                  <div className={styles.algoFoot}>
                    <span className={styles.algoKey}>{algo.keyFormat}</span>
                    {algo.recommended && (
                      <span className={styles.algoFlag}>
                        <VerifyIcon />
                        Recommended for transfers
                      </span>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------- final cta -- */}
        <section className={styles.closing} aria-labelledby="cta-heading">
          <div className={styles.closingInner}>
            <h2 id="cta-heading" className={styles.closingTitle}>
              Run a transfer end to end
            </h2>
            <p className={styles.closingLead}>
              Create an account to upload a document, encrypt it, send it to the server, and decrypt
              it back. Every transfer stays scoped to your own account.
            </p>
            <div className={styles.closingActions}>
              <Link to="/register" className={styles.primaryCta}>
                Create an account
                <span className={styles.ctaIcon} aria-hidden="true">
                  <ArrowIcon />
                </span>
              </Link>
              <Link to="/login" className={styles.secondaryCta}>
                I already have one
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span className={styles.footerBrand}>
            <span className={styles.brandMark} aria-hidden="true" />
            CyberVault
          </span>
          <p className={styles.footerNote}>
            An academic prototype demonstrating symmetric encryption over a client–server channel.
            Not intended for production use.
          </p>
        </div>
      </footer>
    </div>
  );
}

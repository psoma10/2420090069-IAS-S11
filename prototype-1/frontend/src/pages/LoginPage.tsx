import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, type Location } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";
import { describeError, isOfflineCode } from "../lib/errorMessages";
import styles from "./AuthLayout.module.css";

interface FieldErrors {
  email?: string;
  password?: string;
}

interface ServerError {
  title: string;
  text: string;
  offline: boolean;
}

/** Minimal shape check only — the server is the real authority on validity. */
function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!email.includes("@")) errors.email = "Email address must contain an @.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

/**
 * PRD Screen 1 / FR-01. Delegates the actual request to useAuth().login —
 * this component owns presentation and error surfacing only.
 */
export function LoginPage() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // RequireAuth stashes the blocked destination here on redirect.
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? "/dashboard";

  // Covers both a successful submit and landing here with a live session.
  useEffect(() => {
    if (status === "authenticated") navigate(from, { replace: true });
  }, [status, from, navigate]);

  // Re-validate on change only after a first submit attempt, so errors
  // appear on submit and then clear as the user fixes them.
  function update(field: "email" | "password", value: string) {
    if (field === "email") setEmail(value);
    else setPassword(value);
    if (!submitted) return;
    const next = validate(field === "email" ? value : email, field === "password" ? value : password);
    setErrors(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);

    const nextErrors = validate(email, password);
    setErrors(nextErrors);
    if (nextErrors.email) {
      emailRef.current?.focus();
      return;
    }
    if (nextErrors.password) {
      passwordRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_CREDENTIALS") {
        // Deliberately generic: never reveal whether the email exists.
        setServerError({
          title: "Sign-in failed",
          text: "That email and password combination was not recognised. Check both and try again.",
          offline: false,
        });
        passwordRef.current?.focus();
      } else if (err instanceof ApiError && isOfflineCode(err.code)) {
        setServerError({
          title: "Can't reach the server",
          text: "The CyberVault backend is not responding. Confirm it is running on port 5000, then retry.",
          offline: true,
        });
      } else {
        setServerError({ title: "Sign-in failed", text: describeError(err), offline: false });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <aside className={styles.rail}>
        <div className={styles.railGlow} aria-hidden="true" />
        <div className={styles.railGrid} aria-hidden="true" />

        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          CYBERVAULT
        </div>

        <div className={styles.railBody}>
          <p className={styles.railTagline}>Encrypt. Transfer. Verify.</p>
          <h1 className={styles.railTitle}>Secure document exchange, end to end.</h1>
          <p className={styles.railCopy}>
            Every document is encrypted on the client before it touches the network. Choose your cipher, hold your key,
            and watch the transformation happen.
          </p>
          <div className={styles.pipeline} aria-hidden="true">
            <span className={styles.pipelineStep}>PLAINTEXT</span>
            <span className={styles.pipelinePair}>
              <span className={styles.pipelineArrow}>&rarr;</span>
              <span className={styles.pipelineStep}>ENCRYPT</span>
            </span>
            <span className={styles.pipelinePair}>
              <span className={styles.pipelineArrow}>&rarr;</span>
              <span className={styles.pipelineStep}>CIPHERTEXT</span>
            </span>
            <span className={styles.pipelinePair}>
              <span className={styles.pipelineArrow}>&rarr;</span>
              <span className={styles.pipelineStep}>SERVER</span>
            </span>
          </div>
        </div>

        <p className={styles.railFooter}>Caesar &middot; Playfair &middot; SDES &middot; AES-256</p>
      </aside>

      <main className={styles.pane}>
        <div className={styles.card}>
          <header className={styles.header}>
            <h2 className={styles.title}>Sign in to your vault</h2>
            <p className={styles.subtitle}>Authenticate to upload, encrypt, and transfer documents.</p>
          </header>

          {serverError && (
            <div
              className={[styles.banner, serverError.offline ? styles.bannerOffline : ""].filter(Boolean).join(" ")}
              role="alert"
            >
              <span className={styles.bannerIcon} aria-hidden="true">
                !
              </span>
              <span className={styles.bannerBody}>
                <span className={styles.bannerTitle}>{serverError.title}</span>
                <span className={styles.bannerText}>{serverError.text}</span>
              </span>
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <Input
              ref={emailRef}
              label="Email"
              type="email"
              name="email"
              value={email}
              autoComplete="email"
              autoFocus
              disabled={submitting}
              error={errors.email}
              onChange={(e) => update("email", e.target.value)}
            />

            <div className={styles.passwordRow}>
              <Input
                ref={passwordRef}
                label="Password"
                type={revealed ? "text" : "password"}
                name="password"
                value={password}
                autoComplete="current-password"
                disabled={submitting}
                error={errors.password}
                onChange={(e) => update("password", e.target.value)}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setRevealed((v) => !v)}
                disabled={submitting}
                aria-pressed={revealed}
                aria-label={revealed ? "Hide password" : "Show password"}
              >
                {revealed ? "HIDE" : "SHOW"}
              </button>
            </div>

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              {submitting ? "Authenticating" : "Secure Login"}
            </Button>
          </form>

          <p className={styles.footer}>
            No account yet?{" "}
            <Link to="/register" className={styles.link}>
              Create one
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

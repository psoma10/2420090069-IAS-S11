import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/api";
import { describeError, isOfflineCode } from "../lib/errorMessages";
import styles from "./AuthLayout.module.css";

type Field = "name" | "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

interface ServerError {
  title: string;
  text: string;
  offline: boolean;
}

const MIN_PASSWORD = 8;
const MAX_NAME = 80;

/**
 * Mirrors API_CONTRACT.md 3.1 register rules exactly: name 1-80 chars,
 * email must contain "@", password >= 8 chars. Runs before submit so the
 * user never round-trips to learn something we already knew.
 */
function validate(values: Record<Field, string>): FieldErrors {
  const errors: FieldErrors = {};
  const name = values.name.trim();

  if (!name) errors.name = "Enter your name.";
  else if (name.length > MAX_NAME) errors.name = `Name must be ${MAX_NAME} characters or fewer (currently ${name.length}).`;

  const email = values.email.trim();
  if (!email) errors.email = "Enter your email address.";
  else if (!email.includes("@")) errors.email = "Email address must contain an @.";

  if (!values.password) errors.password = "Choose a password.";
  else if (values.password.length < MIN_PASSWORD) {
    const short = MIN_PASSWORD - values.password.length;
    errors.password = `Password must be at least ${MIN_PASSWORD} characters — ${short} more to go.`;
  }

  return errors;
}

/** Purely advisory feedback; the hard rule is the >= 8 char check above. */
function strengthOf(password: string): { score: 0 | 1 | 2 | 3; label: string } {
  if (!password) return { score: 0, label: "Minimum 8 characters." };
  if (password.length < MIN_PASSWORD) return { score: 1, label: "Too short — keep going." };
  const varied = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (password.length >= 12 && varied >= 3) return { score: 3, label: "Strong password." };
  return { score: 2, label: "Acceptable — longer and more varied is stronger." };
}

const SEGMENT_CLASS = ["", styles.meterSegmentWeak, styles.meterSegmentFair, styles.meterSegmentStrong] as const;

/** FR-01 registration. Registration also logs the user in (contract 3.1). */
export function RegisterPage() {
  const { register, status } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<Field, string>>({ name: "", email: "", password: "" });
  const [revealed, setRevealed] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const refs: Record<Field, React.RefObject<HTMLInputElement | null>> = {
    name: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
  };

  useEffect(() => {
    if (status === "authenticated") navigate("/dashboard", { replace: true });
  }, [status, navigate]);

  function update(field: Field, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    if (submitted) setErrors(validate(next));
    // A fresh edit invalidates a stale EMAIL_TAKEN banner.
    if (serverError) setServerError(null);
  }

  // Validate the field the user just left, even before first submit —
  // catches "password too short" at the moment attention moves on.
  function handleBlur(field: Field) {
    const fieldError = validate(values)[field];
    setErrors((prev) => ({ ...prev, [field]: fieldError }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);

    const nextErrors = validate(values);
    setErrors(nextErrors);

    const firstBad = (["name", "email", "password"] as const).find((f) => nextErrors[f]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      await register(values.name.trim(), values.email.trim(), values.password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        // Field-level, not just a banner — the problem is one specific input.
        setErrors((prev) => ({ ...prev, email: "An account already uses this email address." }));
        setServerError({
          title: "Email already registered",
          text: "Sign in instead, or register with a different email address.",
          offline: false,
        });
        refs.email.current?.focus();
      } else if (err instanceof ApiError && isOfflineCode(err.code)) {
        setServerError({
          title: "Can't reach the server",
          text: "The CyberVault backend is not responding. Confirm it is running on port 5000, then retry.",
          offline: true,
        });
      } else {
        setServerError({ title: "Registration failed", text: describeError(err), offline: false });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const strength = strengthOf(values.password);

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
          <h1 className={styles.railTitle}>Create your vault account.</h1>
          <p className={styles.railCopy}>
            Your password is stored only as a hash. Encryption keys stay with you — CyberVault never writes them to its
            application logs.
          </p>
          <div className={styles.pipeline} aria-hidden="true">
            <span className={styles.pipelineStep}>REGISTER</span>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <span className={styles.pipelineStep}>UPLOAD</span>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <span className={styles.pipelineStep}>ENCRYPT</span>
            <span className={styles.pipelineArrow}>&rarr;</span>
            <span className={styles.pipelineStep}>TRANSFER</span>
          </div>
        </div>

        <p className={styles.railFooter}>Caesar &middot; Playfair &middot; SDES &middot; AES-256</p>
      </aside>

      <main className={styles.pane}>
        <div className={styles.card}>
          <header className={styles.header}>
            <h2 className={styles.title}>Create an account</h2>
            <p className={styles.subtitle}>Takes a moment. You&rsquo;ll be signed in immediately after.</p>
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
              ref={refs.name}
              label="Name"
              name="name"
              value={values.name}
              autoComplete="name"
              autoFocus
              maxLength={MAX_NAME}
              disabled={submitting}
              error={errors.name}
              onChange={(e) => update("name", e.target.value)}
              onBlur={() => handleBlur("name")}
            />

            <Input
              ref={refs.email}
              label="Email"
              type="email"
              name="email"
              value={values.email}
              autoComplete="email"
              disabled={submitting}
              error={errors.email}
              onChange={(e) => update("email", e.target.value)}
              onBlur={() => handleBlur("email")}
            />

            <div>
              <div className={styles.passwordRow}>
                <Input
                  ref={refs.password}
                  label="Password"
                  type={revealed ? "text" : "password"}
                  name="password"
                  value={values.password}
                  autoComplete="new-password"
                  disabled={submitting}
                  error={errors.password}
                  hint={errors.password ? undefined : "At least 8 characters."}
                  onChange={(e) => update("password", e.target.value)}
                  onBlur={() => handleBlur("password")}
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

              <div className={styles.meter}>
                <div className={styles.meterTrack} aria-hidden="true">
                  {[1, 2, 3].map((segment) => (
                    <span
                      key={segment}
                      className={[styles.meterSegment, strength.score >= segment ? SEGMENT_CLASS[strength.score] : ""]
                        .filter(Boolean)
                        .join(" ")}
                    />
                  ))}
                </div>
                <p className={styles.meterLabel} aria-live="polite">
                  {strength.label}
                </p>
              </div>
            </div>

            <Button type="submit" size="lg" fullWidth loading={submitting}>
              {submitting ? "Creating account" : "Create Account"}
            </Button>
          </form>

          <p className={styles.footer}>
            Already registered?{" "}
            <Link to="/login" className={styles.link}>
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { LogIn } from "lucide-react";

import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../types/user.types";
import { isValidEmail } from "../../utils/validators";
import Button from "../common/Button";
import Input from "../common/Input";

export interface LoginFormProps {
  role: UserRole;
  /** Called with the role of the account that actually signed in */
  onSuccess: (role: UserRole) => void;
}

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Messages are deliberately generic where the cause could reveal whether an
 * account exists. The backend should return the same error code for "no such
 * user", "wrong password" and "wrong role for this account".
 */
const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS:
    "Incorrect email, password or role. Check your details and try again.",
  ACCOUNT_PENDING:
    "Your account is awaiting verification. Contact your administrator.",
  ACCOUNT_SUSPENDED:
    "This account has been suspended. Contact your administrator.",
  TOO_MANY_ATTEMPTS:
    "Too many sign-in attempts. Wait a few minutes before trying again.",
  NETWORK: "Could not reach AETIS. Check your connection and try again.",
};

const FALLBACK_MESSAGE = "Could not sign you in. Please try again.";

function getErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";
  return ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE;
}

function LoginForm({ role, onSuccess }: LoginFormProps) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // A server error belongs to the role that was selected when it happened
  useEffect(() => {
    setFormError(null);
  }, [role]);

  const handleEmailChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setFieldErrors((prev) => ({ ...prev, email: undefined }));
    setFormError(null);
  };

  const handlePasswordChange = (e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setFieldErrors((prev) => ({ ...prev, password: undefined }));
    setFormError(null);
  };

  const updateCapsLock = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsLock(e.getModifierState("CapsLock"));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const trimmedEmail = email.trim();
    const errors: FieldErrors = {};

    if (!isValidEmail(trimmedEmail)) {
      errors.email = "Enter the email address on your account.";
    }
    if (password.length === 0) {
      errors.password = "Enter your password.";
    }

    setFieldErrors(errors);
    if (errors.email) {
      emailRef.current?.focus();
      return;
    }
    if (errors.password) {
      passwordRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const user = await login({
        email: trimmedEmail.toLowerCase(),
        password,
        role,
      });
      // The page navigates away, so there is nothing left to reset here
      onSuccess(user.role);
    } catch (err) {
      setFormError(getErrorMessage(err));
      setPassword("");
      setShowPassword(false);
      setIsSubmitting(false);
      passwordRef.current?.focus();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {formError && (
        <div
          role="alert"
          className="rounded-[var(--radius-md)] border border-[var(--color-clay-200)] bg-[var(--color-clay-50)] px-4 py-3 text-sm text-[var(--color-clay-700)]"
        >
          {formError}
        </div>
      )}

      <Input
        ref={emailRef}
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={handleEmailChange}
        error={fieldErrors.email}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        disabled={isSubmitting}
        required
      />

      <div>
        <Input
          ref={passwordRef}
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={handlePasswordChange}
          onKeyUp={updateCapsLock}
          onKeyDown={updateCapsLock}
          onBlur={() => setCapsLock(false)}
          error={fieldErrors.password}
          autoComplete="current-password"
          disabled={isSubmitting}
          required
        />

        {capsLock && (
          <p role="status" className="mt-1.5 text-xs font-medium text-[var(--feedback-warning)]">
            Caps Lock is on.
          </p>
        )}

        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
            disabled={isSubmitting}
            className="h-3.5 w-3.5 accent-[var(--color-teal-600)]"
          />
          Show password
        </label>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isSubmitting}
        leftIcon={<LogIn size={18} aria-hidden />}
      >
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}

export default LoginForm;
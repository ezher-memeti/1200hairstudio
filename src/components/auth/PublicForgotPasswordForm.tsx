"use client";

import { useEffect, useState } from "react";
import {
  AUTH_GENERIC_FORGOT_PASSWORD_RESPONSE,
  AUTH_RATE_LIMIT_RESPONSE,
  isRateLimitError,
  isValidEmail,
} from "@/lib/auth/shared";
import { getResetPasswordRedirectUrl } from "@/lib/auth/url";
import { createClient } from "@/lib/supabase/client";

const RESEND_COOLDOWN_SECONDS = 30;

export default function PublicForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  useEffect(() => {
    if (!cooldownUntil) {
      setSecondsRemaining(0);
      return;
    }

    const updateRemaining = () => {
      const remaining = Math.max(
        0,
        Math.ceil((cooldownUntil - Date.now()) / 1000),
      );
      setSecondsRemaining(remaining);

      if (remaining === 0) {
        setCooldownUntil(null);
      }
    };

    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      {
        redirectTo: getResetPasswordRedirectUrl(),
      },
    );

    if (resetError && isRateLimitError(resetError)) {
      setError(AUTH_RATE_LIMIT_RESPONSE);
      setIsSubmitting(false);
      return;
    }

    setMessage(AUTH_GENERIC_FORGOT_PASSWORD_RESPONSE);
    setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    setIsSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8"
    >
      <div className="space-y-2">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Password Reset
        </p>
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          Forgot Password
        </h1>
      </div>

      <label className="block space-y-3">
        <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          autoComplete="email"
          className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
        />
      </label>

      {message ? (
        <p className="font-primary text-sm text-foreground-secondary">
          {message}
        </p>
      ) : null}
      {error ? <p className="font-primary text-sm text-error">{error}</p> : null}

      <div className="flex flex-col gap-4">
        <button
          type="submit"
          disabled={isSubmitting || secondsRemaining > 0}
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
        >
          {isSubmitting
            ? "Sending..."
            : secondsRemaining > 0
              ? `Try Again In ${secondsRemaining}s`
              : "Send Reset Link"}
        </button>

        <a
          href="/login"
          className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
        >
          Back to login →
        </a>
      </div>
    </form>
  );
}

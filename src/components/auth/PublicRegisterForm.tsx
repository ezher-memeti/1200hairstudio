"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE,
  AUTH_RATE_LIMIT_RESPONSE,
  isRateLimitError,
  isValidEmail,
  validatePassword,
} from "@/lib/auth/shared";
import { createClient } from "@/lib/supabase/client";

function mapRegisterError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("already registered") ||
    normalized.includes("already been registered") ||
    normalized.includes("user already registered")
  ) {
    return AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE;
  }

  return "Unable to create your account right now.";
}

export default function PublicRegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setInfo("");

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          phone,
        },
      },
    });

    if (signUpError) {
      setError(
        isRateLimitError(signUpError)
          ? AUTH_RATE_LIMIT_RESPONSE
          : mapRegisterError(signUpError.message),
      );
      setIsSubmitting(false);
      return;
    }

    const hasSession = Boolean(data.session);

    if (hasSession) {
      router.push("/account");
      router.refresh();
      return;
    }

    setInfo(
      "Check your email to confirm your account, then sign in to access your profile.",
    );
    setIsSubmitting(false);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-xl space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8"
    >
      <div className="space-y-2">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Register
        </p>
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          Create Your Account
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block space-y-3 sm:col-span-2">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            Full Name
          </span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            autoComplete="name"
            className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
          />
        </label>

        <label className="block space-y-3 sm:col-span-2">
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

        <label className="block space-y-3 sm:col-span-2">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            Phone
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            autoComplete="tel"
            className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
          />
        </label>

        <label className="block space-y-3">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
            className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
          />
        </label>

        <label className="block space-y-3">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            Confirm Password
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
            className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
          />
        </label>
      </div>

      {error ? <p className="font-primary text-sm text-error">{error}</p> : null}
      {info ? (
        <p className="font-primary text-sm text-foreground-secondary">{info}</p>
      ) : null}
      {error === AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE ? (
        <div className="flex flex-col gap-2">
          <a
            href="/login"
            className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
          >
            Go to login →
          </a>
          <a
            href="/forgot-password"
            className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
          >
            Reset your password →
          </a>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
        >
          {isSubmitting ? "Creating Account..." : "Register"}
        </button>

        <a
          href="/login"
          className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
        >
          Already have an account? Sign in →
        </a>
      </div>
    </form>
  );
}

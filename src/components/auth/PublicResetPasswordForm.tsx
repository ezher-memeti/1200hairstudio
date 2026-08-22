"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUTH_RATE_LIMIT_RESPONSE,
  isRateLimitError,
  validatePassword,
} from "@/lib/auth/shared";
import { createClient } from "@/lib/supabase/client";

export default function PublicResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<
    "checking" | "ready" | "invalid" | "submitting"
  >("checking");

  useEffect(() => {
    const supabase = createClient();
    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const queryParams = new URLSearchParams(window.location.search);
    const recoveryType =
      hashParams.get("type") === "recovery" ||
      queryParams.get("type") === "recovery";

    let isMounted = true;

    async function resolveRecoveryState() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (recoveryType && session) {
        setStatus("ready");
        return;
      }

      setStatus("invalid");
    }

    resolveRecoveryState();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" && session) {
        setStatus("ready");
        return;
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(
        isRateLimitError(updateError)
          ? AUTH_RATE_LIMIT_RESPONSE
          : "Unable to reset your password. The link may have expired.",
      );
      setStatus("ready");
      return;
    }

    await supabase.auth.signOut();
    router.push("/login?reset=success");
    router.refresh();
  }

  if (status === "checking") {
    return (
      <div className="w-full max-w-md space-y-4 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Password Reset
        </p>
        <p className="font-primary text-sm text-foreground-secondary">
          Verifying your reset link...
        </p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="w-full max-w-md space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8">
        <div className="space-y-2">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            Password Reset
          </p>
          <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            Invalid Or Expired Link
          </h1>
        </div>
        <p className="font-primary text-sm leading-7 text-foreground-secondary">
          This password reset link is no longer valid. Request a new reset email to continue.
        </p>
        <a
          href="/forgot-password"
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
        >
          Request New Link
        </a>
      </div>
    );
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
          Set New Password
        </h1>
      </div>

      <div className="space-y-5">
        <label className="block space-y-3">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            New Password
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
            Confirm New Password
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

      <p className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-muted">
        Use at least 8 characters.
      </p>

      {error ? <p className="font-primary text-sm text-error">{error}</p> : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
      >
        {status === "submitting" ? "Updating..." : "Update Password"}
      </button>
    </form>
  );
}

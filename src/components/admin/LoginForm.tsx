"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AUTH_GENERIC_INVALID_CREDENTIALS,
  AUTH_RATE_LIMIT_RESPONSE,
  isRateLimitError,
  isValidEmail,
} from "@/lib/auth/shared";
import { createClient } from "@/lib/supabase/client";
import BrandLogo from "@/components/brand/BrandLogo";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setError("");

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setError(
        isRateLimitError(signInError)
          ? AUTH_RATE_LIMIT_RESPONSE
          : AUTH_GENERIC_INVALID_CREDENTIALS,
      );
      setIsSubmitting(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle();

    router.push(profile?.role === "admin" ? "/admin" : "/account");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8"
    >
      <div className="space-y-2">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          Admin Login
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <BrandLogo className="h-7 w-36 sm:h-8 sm:w-44" priority />
          <h1 className="font-display text-2xl font-semibold uppercase leading-none tracking-[-0.04em] text-foreground sm:text-3xl">
            Admin
          </h1>
        </div>
      </div>

      <div className="space-y-5">
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

        <label className="block space-y-3">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            Password
          </span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            className="w-full border-0 border-b border-border bg-transparent pb-3 font-primary text-base text-foreground outline-none transition-colors placeholder:text-foreground-muted focus:border-foreground-secondary"
          />
        </label>
      </div>

      {error ? (
        <p className="font-primary text-sm text-error">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 items-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
        >
          {isSubmitting ? "Signing In..." : "Sign In"}
        </button>

        <a
          href="/forgot-password"
          className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
        >
          Forgot password?
        </a>
      </div>
    </form>
  );
}

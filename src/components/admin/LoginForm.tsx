"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
    setIsSubmitting(true);

    const supabase = createClient();
    const { error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      setError("Invalid email or password");
      setIsSubmitting(false);
      return;
    }

    router.push("/admin");
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
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          1200 Admin
        </h1>
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

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex min-h-12 items-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
      >
        {isSubmitting ? "Signing In..." : "Sign In"}
      </button>
    </form>
  );
}

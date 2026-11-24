"use client";
import { Link as LocaleLink } from "@/i18n/navigation";

import { localizedPath } from "@/i18n/config";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { restoreAccountLocale } from "@/i18n/preferences";
import { useState } from "react";
import {
  AUTH_GENERIC_INVALID_CREDENTIALS,
  AUTH_RATE_LIMIT_RESPONSE,
  isRateLimitError,
  isValidEmail,
} from "@/lib/auth/shared";
import { createClient } from "@/lib/supabase/client";

type PublicLoginFormProps = {
  initialMessage?: string;
};

export default function PublicLoginForm({
  initialMessage = "",
}: PublicLoginFormProps) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState(initialMessage);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    const { error: signInError } = await supabase.auth.signInWithPassword({
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

    const locale = await restoreAccountLocale();
    window.location.assign(localizedPath(profile?.role === "admin" ? "/admin" : "/account", locale));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8"
    >
      <div className="space-y-2">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          {ui("mc9f78b569267")}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          {ui("m1c9089485a36")}</h1>
      </div>

      <div className="space-y-5">
        <label className="block space-y-3">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            {ui("m84add5b29527")}</span>
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
            {ui("m8be3c943b160")}</span>
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

      {message ? (
        <p className="font-primary text-sm text-foreground-secondary">
          {uiText(message)}
        </p>
      ) : null}
      {error ? (
        <p className="font-primary text-sm text-error">{uiText(error)}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
        >
          {uiText(isSubmitting ? "Signing In..." : "Sign In")}
        </button>

        <LocaleLink
          href="/forgot-password"
          className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
        >
          {ui("m4c29f7f03358")}</LocaleLink>

        <LocaleLink
          href="/register"
          className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
        >
          {ui("m1625840b19c5")}</LocaleLink>
      </div>
    </form>
  );
}

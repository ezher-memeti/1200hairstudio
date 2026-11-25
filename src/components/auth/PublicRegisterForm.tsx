"use client";
import { Link as LocaleLink } from "@/i18n/navigation";

import { useUiText } from "@/i18n/use-ui-text";

import { useLocale, useTranslations } from "next-intl";


import { useRouter } from "@/i18n/navigation";
import { Link } from "@/i18n/navigation";
import { useState } from "react";
import {
  AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE,
  AUTH_RATE_LIMIT_RESPONSE,
  normalizeAuthEmail,
  isValidEmail,
  validatePassword,
} from "@/lib/auth/shared";
import { submitAuthForm } from "@/lib/auth/form-client";

export default function PublicRegisterForm() {
  const uiText = useUiText();

  const locale = useLocale();
  const ui = useTranslations("ui");

  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [marketingEmailConsent, setMarketingEmailConsent] = useState(false);
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

    try {
      const result = await submitAuthForm("register", {
        email: normalizeAuthEmail(email), password, locale, fullName, phone, marketingEmailConsent,
      });
      if (!result.success) {
        setError(result.code === "account_exists" ? AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE : result.code === "rate_limited" ? AUTH_RATE_LIMIT_RESPONSE : "Unable to create your account right now.");
        return;
      }
      if (result.hasSession) { router.push("/account");router.refresh();return; }
      setInfo("Check your email to confirm your account, then sign in to access your profile.");
    } catch { setError("Unable to create your account right now."); }
    finally { setIsSubmitting(false); }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-xl space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8"
    >
      <div className="space-y-2">
        <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
          {ui("md672995a1465")}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          {ui("mc586a432ecf9")}</h1>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <label className="block space-y-3 sm:col-span-2">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            {ui("m64346b483c0a")}</span>
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

        <label className="block space-y-3 sm:col-span-2">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            {ui("m77064d526523")}</span>
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
            {ui("m8be3c943b160")}</span>
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
            {ui("mc2d404cb7bad")}</span>
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

      {error ? <p role="alert" className="font-primary text-sm text-error">{uiText(error)}</p> : null}
      {info ? (
        <p className="font-primary text-sm text-foreground-secondary">{uiText(info)}</p>
      ) : null}
      {error === AUTH_GENERIC_SIGNUP_EXISTS_RESPONSE ? (
        <div className="flex flex-col gap-2">
          <LocaleLink
            href="/login"
            className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
          >
            {ui("m2f33c3111bd6")}</LocaleLink>
          <LocaleLink
            href="/forgot-password"
            className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
          >
            {ui("m201cb71be006")}</LocaleLink>
        </div>
      ) : null}

      <div className="space-y-3 border-t border-border pt-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={marketingEmailConsent}
            onChange={(event) => setMarketingEmailConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="font-primary text-xs leading-5 text-foreground-muted sm:text-sm">
            {ui("mf9c4a06a9b98")}</span>
        </label>
        <p className="pl-7 font-primary text-[11px] leading-5 text-foreground-muted">
          {ui("m87b4afd90edc")}{" "}
          <Link href="/privacy" className="underline underline-offset-4 transition-colors hover:text-foreground">
            {ui("m9db108ba6b7f")}</Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
        >
          {uiText(isSubmitting ? "Creating Account..." : "Create Account")}
        </button>

        <LocaleLink
          href="/login"
          className="font-primary text-xs uppercase tracking-[0.18em] text-foreground-secondary transition-colors hover:text-foreground"
        >
          {ui("m69eec2d91465")}</LocaleLink>
      </div>
    </form>
  );
}

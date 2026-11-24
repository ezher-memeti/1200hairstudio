"use client";
import { Link as LocaleLink } from "@/i18n/navigation";

import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  AUTH_RATE_LIMIT_RESPONSE,
  isRateLimitError,
  validatePassword,
} from "@/lib/auth/shared";
import { createClient } from "@/lib/supabase/client";
import { cleanRecoveryUrl, observePasswordRecovery } from "@/lib/auth/recovery";

export default function PublicResetPasswordForm() {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<
    "checking" | "ready" | "invalid" | "submitting"
  >("checking");

  useEffect(() => {
    const supabase = createClient();
    const url = new URL(window.location.href);
    return observePasswordRecovery(supabase.auth, url, setStatus, () => {
      window.history.replaceState(window.history.state, "", cleanRecoveryUrl(url));
    });
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
          {ui("m79167df1dd0b")}</p>
        <p className="font-primary text-sm text-foreground-secondary">
          {ui("m9139acbe09ab")}</p>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="w-full max-w-md space-y-6 border border-border bg-surface px-5 py-6 sm:px-7 sm:py-8">
        <div className="space-y-2">
          <p className="font-primary text-xs uppercase tracking-[0.34em] text-foreground-secondary">
            {ui("m79167df1dd0b")}</p>
          <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
            {ui("m5a40d0546d2d")}</h1>
        </div>
        <p className="font-primary text-sm leading-7 text-foreground-secondary">
          {ui("m7d1e596bfc26")}</p>
        <LocaleLink
          href="/forgot-password"
          className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover"
        >
          {ui("m7e33bf6bb1fb")}</LocaleLink>
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
          {ui("m79167df1dd0b")}</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold uppercase leading-[0.95] tracking-[-0.04em] text-foreground">
          {ui("m208bb0d762ab")}</h1>
      </div>

      <div className="space-y-5">
        <label className="block space-y-3">
          <span className="font-primary text-xs uppercase tracking-[0.24em] text-foreground-secondary">
            {ui("m4894cb39ee41")}</span>
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
            {ui("m68dcd71ce6ba")}</span>
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
        {ui("md76968a1ecc0")}</p>

      {error ? <p className="font-primary text-sm text-error">{uiText(error)}</p> : null}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex min-h-12 items-center justify-center border border-border bg-accent px-5 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-surface disabled:text-foreground-muted"
      >
        {uiText(status === "submitting" ? "Updating..." : "Update Password")}
      </button>
    </form>
  );
}

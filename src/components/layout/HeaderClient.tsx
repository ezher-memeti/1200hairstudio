"use client";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { Link } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import LanguageSwitcher from "./LanguageSwitcher";
import BrandLogo from "@/components/brand/BrandLogo";
import { getHomepageHeaderAuthState } from "@/app/actions/homepage-user-state";

const navigationLinks = [
  { label: "Services", href: "/#services" },
  { label: "The Barber", href: "/#barber" },
  { label: "Work", href: "/#work" },
  { label: "Visit", href: "/#visit" },
];

type HeaderClientProps = {
  announcementBar?: ReactNode;
  authLink: {
    label: "LOGIN" | "MY PROFILE" | "ADMIN DASHBOARD";
    href: "/login" | "/account" | "/admin";
  };
};

export default function HeaderClient({
  authLink: initialAuthLink,
  announcementBar,
}: HeaderClientProps) {
  const uiText = useUiText();

  const ui = useTranslations("ui");

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [authLink, setAuthLink] = useState(initialAuthLink);

  useEffect(() => {
    let isActive = true;
    void getHomepageHeaderAuthState()
      .then((nextAuthLink) => {
        if (isActive) setAuthLink(nextAuthLink);
      })
      .catch(() => undefined);
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="page-container flex items-center justify-between gap-3 py-4">
        <Link
          href="/#top"
          className="inline-flex min-h-11 shrink-0 items-center"
          aria-label={ui("m1d331708b8d6")}
        >
          <BrandLogo className="h-5 w-[6.75rem] sm:h-6 sm:w-32" priority />
        </Link>

        <nav
          className="hidden min-w-0 items-center gap-4 whitespace-nowrap font-primary xl:flex 2xl:gap-6"
          aria-label={ui("ma9a96ec01949")}
        >
          {navigationLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-xs uppercase tracking-[0.12em] text-foreground-secondary transition-colors hover:text-foreground xl:text-xs 2xl:text-sm"
            >
              {uiText(link.label)}
            </Link>
          ))}
          <Link
            href={authLink.href}
            className="text-right text-xs uppercase tracking-[0.12em] text-foreground-muted transition-colors hover:text-foreground xl:text-xs 2xl:text-sm"
          >
            {uiText(authLink.label)}
          </Link>
        </nav>

        <div className="hidden shrink-0 items-center gap-3 xl:flex">
          <Link
            href="/#booking" data-analytics="booking_cta"
            className="inline-flex items-center border border-border bg-surface px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-surface-elevated xl:text-xs 2xl:text-sm"
          >
            {ui("m27a1279cfe35")}</Link>
        </div>

        <LanguageSwitcher />

        <button
          type="button"
          className="inline-flex size-11 items-center justify-center border border-border bg-surface font-primary text-foreground xl:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
          aria-label={ui("m1ec0b00d7e4a")}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <span className="sr-only">{ui("m1ec0b00d7e4a")}</span>
          <span className="flex h-4 w-5 flex-col justify-between">
            <span className="block h-px w-full bg-current" />
            <span className="block h-px w-full bg-current" />
            <span className="block h-px w-full bg-current" />
          </span>
        </button>
      </div>

      {announcementBar}

      {isMenuOpen ? (
        <div
          id="mobile-navigation"
          className="border-t border-border xl:hidden"
        >
          <nav
            className="page-container flex flex-col gap-1 py-4 font-primary"
            aria-label={ui("mb1d702459399")}
          >
            {navigationLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-sm px-2 py-3 text-sm uppercase tracking-[0.12em] text-foreground-secondary hover:bg-surface hover:text-foreground"
                onClick={() => setIsMenuOpen(false)}
              >
                {uiText(link.label)}
              </Link>
            ))}
            <Link
              href={authLink.href}
              className="rounded-sm px-2 py-3 text-sm uppercase tracking-[0.12em] text-foreground-muted hover:bg-surface hover:text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              {uiText(authLink.label)}
            </Link>
            <Link
              href="/#booking" data-analytics="booking_cta"
              className="mt-2 inline-flex items-center justify-center border border-border bg-accent px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background hover:bg-accent-hover"
              onClick={() => setIsMenuOpen(false)}
            >
              {ui("m27a1279cfe35")}</Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

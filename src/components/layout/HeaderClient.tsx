"use client";

import { useState } from "react";

const navigationLinks = [
  { label: "Services", href: "/#services" },
  { label: "The Barber", href: "/#barber" },
  { label: "Work", href: "/#work" },
  { label: "Visit", href: "/#visit" },
];

type HeaderClientProps = {
  authLink: {
    label: "LOGIN" | "MY PROFILE" | "ADMIN DASHBOARD";
    href: "/login" | "/account" | "/admin";
  };
};

export default function HeaderClient({
  authLink,
}: HeaderClientProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="page-container flex items-center justify-between py-4">
        <a
          href="/#top"
          className="font-display text-base font-semibold uppercase tracking-[0.28em] text-foreground sm:text-lg"
        >
          1200
        </a>

        <nav
          className="hidden items-center gap-5 font-primary md:flex lg:gap-8"
          aria-label="Primary"
        >
          {navigationLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-xs uppercase tracking-[0.2em] text-foreground-secondary transition-colors hover:text-foreground lg:text-sm"
            >
              {link.label}
            </a>
          ))}
          <a
            href={authLink.href}
            className="text-xs uppercase tracking-[0.2em] text-foreground-muted transition-colors hover:text-foreground lg:text-sm"
          >
            {authLink.label}
          </a>
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href="/#booking"
            className="inline-flex items-center border border-border bg-surface px-4 py-2 font-primary text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-surface-elevated lg:text-sm"
          >
            Book Now
          </a>
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center border border-border bg-surface p-2 font-primary text-foreground md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
          aria-label="Toggle navigation"
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <span className="sr-only">Toggle navigation</span>
          <span className="flex h-4 w-5 flex-col justify-between">
            <span className="block h-px w-full bg-current" />
            <span className="block h-px w-full bg-current" />
            <span className="block h-px w-full bg-current" />
          </span>
        </button>
      </div>

      {isMenuOpen ? (
        <div
          id="mobile-navigation"
          className="border-t border-border md:hidden"
        >
          <nav
            className="page-container flex flex-col gap-1 py-4 font-primary"
            aria-label="Mobile"
          >
            {navigationLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-sm px-2 py-3 text-sm uppercase tracking-[0.2em] text-foreground-secondary hover:bg-surface hover:text-foreground"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <a
              href={authLink.href}
              className="rounded-sm px-2 py-3 text-sm uppercase tracking-[0.2em] text-foreground-muted hover:bg-surface hover:text-foreground"
              onClick={() => setIsMenuOpen(false)}
            >
              {authLink.label}
            </a>
            <a
              href="/#booking"
              className="mt-2 inline-flex items-center justify-center border border-border bg-accent px-4 py-3 font-primary text-sm uppercase tracking-[0.18em] text-background hover:bg-accent-hover"
              onClick={() => setIsMenuOpen(false)}
            >
              Book Now
            </a>
          </nav>
        </div>
      ) : null}
    </header>
  );
}

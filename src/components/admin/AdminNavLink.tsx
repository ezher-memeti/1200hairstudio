"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";

function NavigationStatus() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <>
      <LoaderCircle aria-hidden="true" className="pointer-events-none absolute right-1 top-1/2 size-3 -translate-y-1/2 animate-spin text-accent motion-reduce:animate-none" />
      <span role="status" className="sr-only">Opening page…</span>
    </>
  );
}

export default function AdminNavLink({ children, className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`relative ${className ?? ""}`}>
      {children}
      <NavigationStatus />
    </Link>
  );
}

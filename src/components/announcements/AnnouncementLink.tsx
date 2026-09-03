import type { ReactNode } from "react";

export default function AnnouncementLink({ href, children, className }: { href: string; children: ReactNode; className: string }) {
  const external = /^https?:\/\//i.test(href);
  return <a href={href} className={className} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{children}</a>;
}


import { useTranslations } from "next-intl";
export default function EmailHistoryLoading() {
  const ui = useTranslations("ui");

  return <section className="space-y-7" aria-label={ui("mb5bc3c4a843b")}><div className="space-y-3"><div className="h-3 w-40 animate-pulse bg-border"/><div className="h-12 w-72 max-w-full animate-pulse bg-border"/><div className="h-4 w-full max-w-xl animate-pulse bg-border"/></div><div className="h-12 animate-pulse border-b border-border"/><div className="h-28 animate-pulse border border-border bg-surface"/><div className="space-y-px border border-border bg-border">{Array.from({length:6},(_,index)=><div key={index} className="h-20 animate-pulse bg-surface"/>)}</div></section>;
}

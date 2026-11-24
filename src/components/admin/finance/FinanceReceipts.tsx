"use client";
import { useFinanceFormatters } from "./use-finance-formatters";
import { useUiText } from "@/i18n/use-ui-text";

import { useTranslations } from "next-intl";


import { Download, Eye, Mail, Printer } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { resendAdminReceipt } from "@/app/actions/finance";
import type { ReceiptRecord } from "@/lib/receipts/types";
import { displayDate, formatMoney } from "./shared";

export default function FinanceReceipts({ receipts }: { receipts: ReceiptRecord[] }) {
  const { formatMoney, displayDate } = useFinanceFormatters();

  const uiText = useUiText();

  const ui = useTranslations("ui");

  const router = useRouter(); const [emailingId, setEmailingId] = useState<string | null>(null); const [feedback, setFeedback] = useState(""); const [pending, startTransition] = useTransition();
  function email(id: string) { setEmailingId(id); setFeedback(""); startTransition(async () => { const result = await resendAdminReceipt(id); setFeedback(result.error ?? "Receipt emailed to the customer."); setEmailingId(null); if (!result.error) router.refresh(); }); }
  return <div className="space-y-6"><div><h2 className="font-admin-display text-3xl uppercase text-foreground">{ui("md6dadec06672")}</h2><p className="mt-2 text-sm text-foreground-muted">{ui("m4406942378a5")}</p>{feedback?<p className="mt-3 text-sm text-accent">{uiText(feedback)}</p>:null}</div><article className="overflow-hidden border border-border bg-surface"><div className="flex items-end justify-between border-b border-border p-5"><span className="text-sm text-foreground-muted">{receipts.length} {" "}{ui("m7c4f7733e690")}</span></div><div className="grid gap-3 p-4 md:hidden">{receipts.map((receipt)=><article key={receipt.id} className="border border-border bg-background/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[0.16em] text-accent">{uiText("Receipt")} {receipt.receipt_number}</p><p className="mt-2 text-foreground">{receipt.customer_name ?? uiText("Customer")}</p><p className="mt-1 text-xs text-foreground-muted">{receipt.service_name} · {displayDate(receipt.issued_at)}</p></div><strong className="whitespace-nowrap">{formatMoney(receipt.total)}</strong></div><p className="mt-3 text-xs text-foreground-secondary">{uiText(receipt.payment_method ? receipt.payment_method.replaceAll("_", " ") : "No payment required")} · {uiText(receipt.emailed_at ? "Emailed" : "Not emailed")}</p><ReceiptActions receipt={receipt} emailing={pending && emailingId===receipt.id} onEmail={email}/></article>)}{!receipts.length?<p className="p-8 text-center text-sm text-foreground-muted">{ui("m0b8ffff49493")}</p>:null}</div><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] text-left"><thead className="text-[10px] uppercase tracking-[0.16em] text-foreground-muted"><tr>{["Receipt","Issued","Customer","Service","Total","Payment","Email","Actions"].map((head)=><th key={head} className="px-4 py-3 font-normal">{uiText(head)}</th>)}</tr></thead><tbody>{receipts.map((receipt)=><tr key={receipt.id} className="border-t border-border/70 text-sm text-foreground-secondary"><td className="px-4 py-4 text-accent">{ui("m8f67087d3aac")}{" "}{receipt.receipt_number}</td><td className="px-4 py-4">{displayDate(receipt.issued_at)}</td><td className="px-4 py-4 text-foreground">{receipt.customer_name ?? uiText("Customer")}</td><td className="px-4 py-4">{receipt.service_name}</td><td className="px-4 py-4 text-foreground">{formatMoney(receipt.total)}</td><td className="px-4 py-4 uppercase">{uiText(receipt.payment_method?.replaceAll("_", " ") ?? uiText("Not required"))}</td><td className="px-4 py-4">{receipt.emailed_at?<span className="text-emerald-300">{ui("m35f49dcfbfb2")}</span>:<span className="text-foreground-muted">{ui("m587c501eb406")}</span>}</td><td className="px-4 py-4"><ReceiptActions receipt={receipt} emailing={pending && emailingId===receipt.id} onEmail={email}/></td></tr>)}</tbody></table>{!receipts.length?<p className="p-10 text-center text-sm text-foreground-muted">{ui("m0b8ffff49493")}</p>:null}</div></article></div>;
}

function ReceiptActions({ receipt, emailing, onEmail }: { receipt: ReceiptRecord; emailing: boolean; onEmail: (id: string) => void }) {
  const uiText = useUiText();

  const ui = useTranslations("ui");
 const url=`/api/admin/receipts/${receipt.id}`; const cls="inline-flex min-h-11 items-center gap-1.5 border border-border px-3 text-[9px] uppercase tracking-[0.12em] text-foreground-secondary hover:text-accent"; return <div className="mt-4 flex flex-wrap gap-2 md:mt-0"><a href={url} target="_blank" rel="noreferrer" className={cls}><Eye size={13}/>{ui("m69bd4ef9fbd0")}</a><a href={`${url}?format=print`} target="_blank" rel="noreferrer" className={cls}><Printer size={13}/>{ui("m5b221e9c2a45")}</a><a href={`${url}?format=pdf`} className={cls}><Download size={13}/>PDF</a><button type="button" disabled={emailing} onClick={()=>onEmail(receipt.id)} className={`${cls} disabled:opacity-40`}><Mail size={13}/>{uiText(emailing?"Sending":receipt.emailed_at?"Resend":"Email")}</button></div>; }

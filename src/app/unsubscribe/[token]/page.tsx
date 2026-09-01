import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { verifyMarketingUnsubscribeToken } from "@/lib/email/marketing/unsubscribe-token";

export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params }: { params: { token: string } }) {
  const customerId = verifyMarketingUnsubscribeToken(params.token);
  let success = false;

  if (customerId) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("customers")
      .update({
        marketing_email_consent: false,
        marketing_email_unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", customerId)
      .select("id")
      .maybeSingle();
    success = !error && Boolean(data);
  }

  return <main className="flex min-h-screen items-center bg-background px-5 py-16"><section className="mx-auto w-full max-w-2xl border border-border bg-surface p-6 text-center sm:p-10"><p className="font-primary text-xs uppercase tracking-[0.34em] text-accent">1200 Hairstudio</p><h1 className="mt-5 font-display text-4xl uppercase tracking-[-0.04em] text-foreground sm:text-5xl">{success ? "Unsubscribed" : "Link Not Valid"}</h1><p className="mx-auto mt-5 max-w-xl font-primary text-sm leading-7 text-foreground-secondary sm:text-base">{success ? "You have been unsubscribed from marketing emails from 1200 Hairstudio. You will still receive important emails related to your appointments." : "This unsubscribe link is invalid or has expired. No email preferences were changed."}</p><Link href="/" className="mt-8 inline-flex min-h-12 items-center justify-center bg-accent px-6 font-primary text-xs uppercase tracking-[0.18em] text-background">Return to Website</Link></section></main>;
}

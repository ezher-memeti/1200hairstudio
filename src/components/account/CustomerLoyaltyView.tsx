"use client";

import { Scissors } from "lucide-react";
import type { CustomerLoyaltyReward, CustomerLoyaltySummary } from "@/lib/loyalty/customer-summary";

export function formatLoyaltyReward(reward: Pick<CustomerLoyaltyReward, "rewardType" | "rewardValue">) {
  if (reward.rewardType === "fixed_discount") return `CHF ${Number(reward.rewardValue ?? 0).toFixed(2)} OFF`;
  if (reward.rewardType === "percentage") return `${Number(reward.rewardValue ?? 0)}% OFF`;
  return "FREE SERVICE";
}

const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
const configuredReward = (summary: CustomerLoyaltySummary) => formatLoyaltyReward({ rewardType: summary.configuredRewardType, rewardValue: summary.configuredRewardValue });

function MilestoneTrack({ completed, total }: { completed: number; total: number }) {
  return <div aria-label={`${completed} of ${total} loyalty visits completed`} className="mt-6 grid grid-cols-5 gap-y-6 sm:grid-cols-[repeat(auto-fit,minmax(54px,1fr))]">
    {Array.from({ length: total }, (_, index) => {
      const earned = index < completed;
      return <div key={index} className="relative flex min-w-0 flex-col items-center gap-2">
        <Scissors aria-hidden="true" strokeWidth={1.35} className={`size-5 transition-[color,transform,opacity] duration-700 motion-reduce:transition-none ${earned ? "scale-100 text-accent opacity-100" : "scale-90 text-foreground-muted opacity-45"}`} />
        <div className="relative flex w-full items-center">
          {index > 0 ? <span className={`h-px flex-1 transition-colors duration-700 motion-reduce:transition-none ${earned ? "bg-accent/70" : "bg-border"}`} /> : <span className="flex-1" />}
          <span className={`size-2.5 shrink-0 border transition-[background-color,border-color,transform] duration-700 motion-reduce:transition-none ${earned ? "scale-110 border-accent bg-accent" : "border-foreground-muted/50 bg-background"}`} />
          {index < total - 1 ? <span className={`h-px flex-1 transition-colors duration-700 motion-reduce:transition-none ${index + 1 < completed ? "bg-accent/70" : "bg-border"}`} /> : <span className="flex-1" />}
        </div>
      </div>;
    })}
  </div>;
}

function RewardAction({ reward }: { reward: CustomerLoyaltyReward }) {
  return <div className="border-l-2 border-accent pl-5 sm:pl-7"><p className="text-[10px] uppercase tracking-[.24em] text-accent">Reward Unlocked</p><p className="mt-3 max-w-md font-display text-4xl uppercase leading-[.9] tracking-[-.04em] sm:text-5xl">{formatLoyaltyReward(reward)}</p><p className="mt-3 text-sm text-foreground-secondary">Your reward is ready for your next session.</p><a href="/#booking" className="mt-5 inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.18em] text-accent">Book with Reward →</a></div>;
}

export function LoyaltyOverview({ summary, onView }: { summary: CustomerLoyaltySummary; onView: () => void }) {
  if (!summary.isEnabled && !summary.rewards.length && !summary.visits.length) return null;
  const available = summary.isEnabled ? summary.rewards.find((reward) => reward.status === "available") : undefined;
  return <section className="border-y border-border py-7 sm:py-9">
    <div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-[.28em] text-accent">Loyalty</p><h2 className="mt-2 font-display text-2xl uppercase sm:text-3xl">Your 1200 Reward</h2></div>{available ? <span className="border border-accent/40 px-2.5 py-1 text-[9px] uppercase tracking-[.16em] text-accent">Reward Ready</span> : null}</div>
    <div className="mt-7">{available ? <RewardAction reward={available} /> : summary.eligibleVisitsInCurrentCycle === 0 ? <div><h3 className="font-display text-3xl uppercase tracking-[-.04em]">Your First Cut Starts Here</h3><p className="mt-3 max-w-lg text-sm leading-6 text-foreground-secondary">Complete your first eligible visit to begin your progress toward {configuredReward(summary)}.</p><a href="/#booking" className="mt-4 inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.18em] text-accent">Book a Session →</a></div> : <div><MilestoneTrack completed={summary.eligibleVisitsInCurrentCycle} total={summary.visitsRequired} /><div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-display text-3xl uppercase">{summary.eligibleVisitsInCurrentCycle} / {summary.visitsRequired} Completed</p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-foreground-muted">{summary.visitsRemaining} more {summary.visitsRemaining === 1 ? "visit" : "visits"} to unlock</p></div><div className="sm:text-right"><p className="text-[9px] uppercase tracking-[.2em] text-foreground-muted">Next Reward</p><p className="mt-1 font-display text-xl uppercase text-accent">{configuredReward(summary)}</p></div></div></div>}</div>
    <button type="button" onClick={onView} className="mt-6 min-h-11 text-[10px] uppercase tracking-[.18em] text-foreground-secondary transition-colors hover:text-accent">View Loyalty →</button>
  </section>;
}

export default function CustomerLoyaltyView({ summary }: { summary: CustomerLoyaltySummary }) {
  const available = summary.isEnabled ? summary.rewards.find((reward) => reward.status === "available") : undefined;
  return <section className="min-w-0">
    <div className="grid gap-8 border-y border-border py-7 md:grid-cols-[minmax(0,1.35fr)_minmax(220px,.65fr)] md:items-end md:py-9"><div><p className="text-[10px] uppercase tracking-[.28em] text-foreground-muted">Your Progress</p><p className="mt-3 font-display text-4xl uppercase tracking-[-.05em] sm:text-5xl">{summary.eligibleVisitsInCurrentCycle} / {summary.visitsRequired}</p><MilestoneTrack completed={summary.eligibleVisitsInCurrentCycle} total={summary.visitsRequired} /><p className="mt-5 text-[10px] uppercase tracking-[.18em] text-foreground-muted">{summary.visitsRemaining ? `${summary.visitsRemaining} more ${summary.visitsRemaining === 1 ? "visit" : "visits"} to unlock` : "Reward threshold reached"}</p></div><div className="border-t border-border pt-5 md:border-l md:border-t-0 md:pl-7 md:pt-0"><p className="text-[10px] uppercase tracking-[.22em] text-foreground-muted">{available ? "Available Reward" : "Next Reward"}</p><p className="mt-3 font-display text-3xl uppercase leading-none text-accent">{available ? formatLoyaltyReward(available) : configuredReward(summary)}</p>{available ? <a href="/#booking" className="mt-5 inline-flex min-h-11 items-center text-[10px] uppercase tracking-[.18em] text-accent">Book with Reward →</a> : null}</div></div>
    <div className="mt-10 grid gap-10 lg:grid-cols-2">
      <section><div className="flex items-end justify-between gap-4"><h3 className="text-[10px] uppercase tracking-[.24em] text-foreground-muted">Visit History</h3><span className="text-[9px] uppercase tracking-[.16em] text-foreground-muted">{summary.visits.filter((visit) => visit.isEligible).length} eligible</span></div><div className="mt-3 divide-y divide-border border-y border-border">{summary.visits.map((visit, index) => <div key={visit.id} className="grid grid-cols-[28px_24px_minmax(0,1fr)_auto] items-center gap-3 py-4"><span className="text-[10px] text-foreground-muted">{String(summary.visits.length - index).padStart(2, "0")}</span><Scissors aria-hidden="true" strokeWidth={1.4} className={`size-4 ${visit.isEligible ? "text-accent" : "text-foreground-muted"}`} /><div className="min-w-0"><p className="text-xs uppercase text-foreground">{formatDate(visit.appointmentStartAt ?? visit.createdAt)}</p><p className="mt-1 break-words text-sm text-foreground-secondary">{visit.serviceName ?? "Appointment"}</p></div><span className={`text-right text-[9px] uppercase tracking-[.12em] ${visit.isEligible ? "text-accent" : "text-foreground-muted"}`}>{visit.isEligible ? "+1 Visit" : "Excluded"}</span></div>)}{!summary.visits.length ? <div className="py-8"><p className="font-display text-2xl uppercase">Your journey starts here.</p><p className="mt-2 text-sm text-foreground-muted">Eligible completed visits will appear here.</p></div> : null}</div></section>
      <section><h3 className="text-[10px] uppercase tracking-[.24em] text-foreground-muted">Reward History</h3><div className="mt-3 divide-y divide-border border-y border-border">{summary.rewards.map((reward) => <div key={reward.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-display text-2xl uppercase">{formatLoyaltyReward(reward)}</p><p className="mt-1 text-xs text-foreground-muted">{reward.status === "redeemed" && reward.redeemedAt ? `Redeemed ${formatDate(reward.redeemedAt)}` : `Earned ${formatDate(reward.earnedAt)}`}</p>{reward.expiresAt && reward.status === "available" ? <p className="mt-1 text-xs text-foreground-muted">Expires {formatDate(reward.expiresAt)}</p> : null}</div><span className={`w-fit border px-2.5 py-1 text-[9px] uppercase tracking-[.14em] ${reward.status === "available" ? "border-accent/40 text-accent" : "border-border text-foreground-muted"}`}>{reward.status}</span></div>)}{!summary.rewards.length ? <div className="py-8"><p className="font-display text-2xl uppercase">No rewards earned yet.</p><p className="mt-2 text-sm text-foreground-muted">Your earned and redeemed rewards will remain visible here.</p></div> : null}</div></section>
    </div>
  </section>;
}

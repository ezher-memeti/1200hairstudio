"use server";

import { revalidatePath } from "next/cache";
import { requireAdminUser } from "@/lib/auth/customer";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";
import { getRegisterSessionDetail } from "@/lib/register/server";
import type { RegisterSessionRecord } from "@/lib/register/types";

function parseMoney(value: string, options: { allowZero: boolean }) {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || (options.allowZero ? amount < 0 : amount <= 0)) return null;
  return Math.round(amount * 100) / 100;
}

function revalidateRegister() {
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/register");
}

export async function openRegister(input: { openingCash: string; note?: string }) {
  try {
    const { supabase, user } = await requireAdminUser();
    const openingCash = parseMoney(input.openingCash, { allowZero: true });
    if (openingCash === null) return { error: "Opening cash must be zero or more with no more than two decimal places." };
    const { data: existing, error: lookupError } = await supabase
      .from("register_sessions")
      .select("id")
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (lookupError) return { error: "The register status could not be verified." };
    if (existing) return { error: "A register is already open." };
    const { error } = await supabase.from("register_sessions").insert({
      opened_at: new Date().toISOString(),
      opened_by: user.id,
      opening_cash: openingCash,
      status: "open",
      opening_note: input.note?.trim() || null,
    });
    if (error) {
      if (error.code === "23505" || /unique|already.*open/i.test(error.message)) {
        return { error: "A register is already open." };
      }
      console.error("REGISTER OPEN ERROR", error);
      return { error: "The register could not be opened." };
    }
    revalidateRegister();
    return { error: null };
  } catch (error) {
    console.error("REGISTER OPEN ACTION ERROR", error);
    return { error: "The register could not be opened." };
  }
}

export async function recordRegisterMovement(input: {
  sessionId: string;
  type: "deposit" | "withdrawal";
  amount: string;
  note?: string;
}) {
  try {
    const { supabase, user } = await requireAdminUser();
    if (input.type !== "deposit" && input.type !== "withdrawal") return { error: "Invalid register movement." };
    const amount = parseMoney(input.amount, { allowZero: false });
    if (amount === null) return { error: "Amount must be greater than zero with no more than two decimal places." };
    const { data: session, error: sessionError } = await supabase
      .from("register_sessions")
      .select("id,status")
      .eq("id", input.sessionId)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError || !session) return { error: "This register is no longer open." };
    const { error } = await supabase.from("register_movements").insert({
      register_session_id: session.id,
      type: input.type,
      amount,
      note: input.note?.trim() || null,
      created_by: user.id,
    });
    if (error) {
      console.error("REGISTER MOVEMENT ERROR", error);
      return { error: "The register movement could not be recorded." };
    }
    revalidateRegister();
    return { error: null };
  } catch (error) {
    console.error("REGISTER MOVEMENT ACTION ERROR", error);
    return { error: "The register movement could not be recorded." };
  }
}

export async function closeRegister(input: {
  sessionId: string;
  actualCash: string;
  note?: string;
}) {
  try {
    const { supabase, user } = await requireAdminUser();
    const actualCash = parseMoney(input.actualCash, { allowZero: true });
    if (actualCash === null) return { error: "Actual cash must be zero or more with no more than two decimal places." };
    const { data, error: sessionError } = await supabase
      .from("register_sessions")
      .select("*")
      .eq("id", input.sessionId)
      .eq("status", "open")
      .maybeSingle();
    if (sessionError || !data) return { error: "This register is no longer open." };
    const financeSettings = await getFinanceSettings();
    const detail = await getRegisterSessionDetail(
      data as RegisterSessionRecord,
      financeSettings.enabledPaymentMethods,
      supabase,
    );
    const expectedCash = detail.breakdown.calculatedExpectedCash;
    const difference = (Math.round(actualCash * 100) - Math.round(expectedCash * 100)) / 100;
    const closingNote = input.note?.trim() || null;
    if (difference !== 0 && !closingNote) {
      return { error: "Enter a discrepancy reason before closing this register." };
    }
    const closedAt = new Date().toISOString();
    const { data: closed, error } = await supabase
      .from("register_sessions")
      .update({
        expected_cash: expectedCash,
        actual_cash: actualCash,
        difference,
        closed_at: closedAt,
        closed_by: user.id,
        status: "closed",
        closing_note: closingNote,
      })
      .eq("id", input.sessionId)
      .eq("status", "open")
      .select("id")
      .maybeSingle();
    if (error || !closed) {
      console.error("REGISTER CLOSE ERROR", error);
      return { error: "The register was already closed or could not be reconciled." };
    }
    revalidateRegister();
    return { error: null, expectedCash, actualCash, difference };
  } catch (error) {
    console.error("REGISTER CLOSE ACTION ERROR", error);
    return { error: "The register could not be closed." };
  }
}

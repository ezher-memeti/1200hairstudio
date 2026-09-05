"use server";

import { calculateFinanceComparison, type ComparisonRange } from "@/lib/finance/comparison";
import { getAdminFinanceData } from "@/lib/finance/queries";

export async function getFinanceOverviewComparison(input: { range: ComparisonRange; customStart?: string; customEnd?: string }) {
  try {
    const data = await getAdminFinanceData();
    return { data: calculateFinanceComparison({ ...input, transactions: data.transactions, appointments: data.appointments }), error: null };
  } catch (error) {
    console.error("FINANCE OVERVIEW COMPARISON ERROR", error);
    return { data: null, error: "Finance comparison data could not be loaded." };
  }
}

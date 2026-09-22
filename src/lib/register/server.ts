import "server-only";

import { requireAdminUser } from "@/lib/auth/customer";
import { getFinanceSettings } from "@/lib/admin/runtime-settings";
import type { PaymentMethodSetting } from "@/lib/admin/settings";
import type {
  RegisterActivityItem,
  RegisterBreakdown,
  RegisterMovementRecord,
  RegisterPageData,
  RegisterPaymentRecord,
  RegisterSessionDetail,
  RegisterSessionRecord,
} from "@/lib/register/types";

const money = (value: unknown) => Math.round((Number(value) || 0) * 100) / 100;
const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);

function adminLabel(userId: string | null) {
  return userId ? `Admin · ${userId.slice(0, 8)}` : null;
}

export function calculateRegisterBreakdown(
  session: RegisterSessionRecord,
  movements: RegisterMovementRecord[],
  payments: RegisterPaymentRecord[],
  enabledPaymentMethods: PaymentMethodSetting[],
): RegisterBreakdown {
  const validPayments = payments.filter((payment) => payment.status === "completed");
  const sumTransactions = (type: "payment" | "refund", method: PaymentMethodSetting) =>
    validPayments
      .filter((payment) => payment.transaction_type === type && payment.payment_method === method)
      .reduce((sum, payment) => sum + cents(payment.amount), 0) / 100;
  const deposits =
    movements
      .filter((movement) => movement.type === "deposit")
      .reduce((sum, movement) => sum + cents(movement.amount), 0) / 100;
  const withdrawals =
    movements
      .filter((movement) => movement.type === "withdrawal")
      .reduce((sum, movement) => sum + cents(movement.amount), 0) / 100;
  const sumTips = (method: PaymentMethodSetting) => validPayments
    .filter((payment) => payment.transaction_type === "payment" && payment.payment_method === method)
    .reduce((sum, payment) => sum + cents(payment.tip_amount), 0) / 100;
  const cashTips = sumTips("cash");
  const cashPayments = money(sumTransactions("payment", "cash") - cashTips);
  const cashRefunds = sumTransactions("refund", "cash");
  const openingCash = money(session.opening_cash);
  const calculatedExpectedCash = (
    cents(openingCash) + cents(cashPayments) + cents(cashTips) + cents(deposits) - cents(withdrawals) - cents(cashRefunds)
  ) / 100;

  return {
    openingCash,
    cashPayments,
    cashTips,
    cashRefunds,
    deposits,
    withdrawals,
    calculatedExpectedCash,
    paymentMethods: enabledPaymentMethods.map((method) => ({
      method,
      payments: money(sumTransactions("payment", method) - sumTips(method)),
      tips: sumTips(method),
      refunds: sumTransactions("refund", method),
    })),
  };
}

function buildActivity(
  session: RegisterSessionRecord,
  movements: RegisterMovementRecord[],
  payments: RegisterPaymentRecord[],
  serviceNames: Map<string, string>,
  appointmentServices: Map<string, string>,
  appointments: Map<string, { customerId: string | null; customerName: string | null; startAt: string | null }>,
) {
  const activity: RegisterActivityItem[] = [
    {
      id: `opened-${session.id}`,
      at: session.opened_at,
      kind: "opened",
      title: "Register opened",
      description: session.opening_note,
      amount: money(session.opening_cash),
      paymentMethod: "cash",
      adminLabel: adminLabel(session.opened_by),
      appointmentId: null,
      appointmentAt: null,
      customerId: null,
      customerName: null,
      expectedCash: null,
      actualCash: null,
      difference: null,
    },
  ];

  payments
    .filter((payment) => payment.status === "completed")
    .forEach((payment) => {
      const serviceId = appointmentServices.get(payment.appointment_id);
      const appointment = appointments.get(payment.appointment_id);
      activity.push({
        id: `payment-${payment.id}`,
        at: payment.paid_at,
        kind: payment.transaction_type,
        title:
          serviceNames.get(serviceId ?? "") ??
          (payment.transaction_type === "refund" ? "Refund" : "Appointment payment"),
        description: payment.notes,
        amount: payment.transaction_type === "refund" ? -money(payment.amount) : money(payment.amount),
        paymentMethod: payment.payment_method,
        adminLabel: null,
        appointmentId: payment.appointment_id,
        appointmentAt: appointment?.startAt ?? null,
        customerId: appointment?.customerId ?? null,
        customerName: appointment?.customerName ?? null,
        expectedCash: null,
        actualCash: null,
        difference: null,
      });
    });

  movements.forEach((movement) => {
    activity.push({
      id: `movement-${movement.id}`,
      at: movement.created_at,
      kind: movement.type,
      title: movement.type === "deposit" ? "Deposit" : "Withdrawal",
      description: movement.note,
      amount: movement.type === "deposit" ? money(movement.amount) : -money(movement.amount),
      paymentMethod: "cash",
      adminLabel: adminLabel(movement.created_by),
      appointmentId: null,
      appointmentAt: null,
      customerId: null,
      customerName: null,
      expectedCash: null,
      actualCash: null,
      difference: null,
    });
  });

  if (session.closed_at) {
    activity.push({
      id: `closed-${session.id}`,
      at: session.closed_at,
      kind: "closed",
      title: "Register closed",
      description: session.closing_note,
      amount: session.actual_cash == null ? null : money(session.actual_cash),
      paymentMethod: "cash",
      adminLabel: adminLabel(session.closed_by),
      appointmentId: null,
      appointmentAt: null,
      customerId: null,
      customerName: null,
      expectedCash: session.expected_cash == null ? null : money(session.expected_cash),
      actualCash: session.actual_cash == null ? null : money(session.actual_cash),
      difference: session.difference == null ? null : money(session.difference),
    });
  }

  return activity.sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime());
}

export async function getRegisterSessionDetail(
  session: RegisterSessionRecord,
  enabledPaymentMethods: PaymentMethodSetting[],
  supabase: Awaited<ReturnType<typeof requireAdminUser>>["supabase"],
): Promise<RegisterSessionDetail> {
  const [movementResult, paymentResult] =
    await Promise.all([
      supabase
        .from("register_movements")
        .select("id,register_session_id,type,amount,note,created_by,created_at")
        .eq("register_session_id", session.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("payments")
        .select("id,register_session_id,appointment_id,transaction_type,amount,tip_amount,payment_method,status,paid_at,notes")
        .eq("register_session_id", session.id)
        .order("paid_at", { ascending: true }),
    ]);

  if (movementResult.error) console.error("REGISTER MOVEMENT ERROR:", movementResult.error);
  if (paymentResult.error) console.error("REGISTER PAYMENT ERROR:", paymentResult.error);

  let paymentRows = paymentResult.data;
  let paymentError = paymentResult.error;
  if (paymentError?.code === "42703" && /payments\.tip_amount|tip_amount/i.test(paymentError.message)) {
    const legacyPaymentResult = await supabase
      .from("payments")
      .select("id,register_session_id,appointment_id,transaction_type,amount,payment_method,status,paid_at,notes")
      .eq("register_session_id", session.id)
      .order("paid_at", { ascending: true });
    if (legacyPaymentResult.error) console.error("REGISTER PAYMENT LEGACY FALLBACK ERROR:", legacyPaymentResult.error);
    paymentError = legacyPaymentResult.error;
    paymentRows = legacyPaymentResult.data?.map((payment) => ({ ...payment, tip_amount: 0 })) ?? null;
  }

  if (movementResult.error || paymentError) {
    const error = movementResult.error ?? paymentError;
    throw new Error(`Unable to load register activity${process.env.NODE_ENV === "development" && error ? ` (${error.code}: ${error.message})` : "."}`);
  }
  const movements = (movementResult.data ?? []) as RegisterMovementRecord[];
  const payments = (paymentRows ?? []) as RegisterPaymentRecord[];
  const appointmentIds = [...new Set(payments.map((payment) => payment.appointment_id))];
  const { data: appointmentRows, error: appointmentError } = appointmentIds.length
    ? await supabase.from("appointments").select("id,service_id,customer_id,customer_name,guest_name,start_at").in("id", appointmentIds)
    : { data: [], error: null };
  if (appointmentError) throw new Error("Unable to load register appointments.");
  const appointmentServices = new Map(
    (appointmentRows ?? []).map((appointment) => [appointment.id, appointment.service_id]),
  );
  const appointments = new Map(
    (appointmentRows ?? []).map((appointment) => [appointment.id, {
      customerId: appointment.customer_id ?? null,
      customerName: appointment.customer_name ?? appointment.guest_name ?? null,
      startAt: appointment.start_at ?? null,
    }]),
  );
  const serviceIds = [...new Set((appointmentRows ?? []).map((appointment) => appointment.service_id))];
  const { data: serviceRows, error: serviceError } = serviceIds.length
    ? await supabase.from("services").select("id,name").in("id", serviceIds)
    : { data: [], error: null };
  if (serviceError) throw new Error("Unable to load register services.");
  const serviceNames = new Map((serviceRows ?? []).map((service) => [service.id, service.name]));
  const breakdown = calculateRegisterBreakdown(session, movements, payments, enabledPaymentMethods);
  const normalizedSession = {
    ...session,
    opening_cash: money(session.opening_cash),
    expected_cash: session.expected_cash == null ? null : money(session.expected_cash),
    actual_cash: session.actual_cash == null ? null : money(session.actual_cash),
    difference: session.difference == null ? null : money(session.difference),
  };

  return {
    session: normalizedSession,
    openedByLabel: adminLabel(session.opened_by) ?? "Admin",
    closedByLabel: adminLabel(session.closed_by),
    breakdown,
    expectedCash:
      session.status === "closed" && session.expected_cash != null
        ? money(session.expected_cash)
        : breakdown.calculatedExpectedCash,
    activity: buildActivity(session, movements, payments, serviceNames, appointmentServices, appointments),
  };
}

export async function getRegisterPageData(): Promise<RegisterPageData> {
  const [{ supabase }, financeSettings] = await Promise.all([
    requireAdminUser(),
    getFinanceSettings(),
  ]);
  const { data, error } = await supabase
    .from("register_sessions")
    .select("*")
    .order("opened_at", { ascending: false });
  if (error) throw new Error("Unable to load register sessions.");
  const sessions = (data ?? []) as RegisterSessionRecord[];
  const openSession = sessions.find((session) => session.status === "open") ?? null;
  const closedSessions = sessions.filter((session) => session.status === "closed");
  const current = openSession
    ? await getRegisterSessionDetail(openSession, financeSettings.enabledPaymentMethods, supabase)
    : null;
  const history = await Promise.all(
    closedSessions.map((session) =>
      getRegisterSessionDetail(session, financeSettings.enabledPaymentMethods, supabase),
    ),
  );

  return { current, history, enabledPaymentMethods: financeSettings.enabledPaymentMethods };
}

export async function getClosedRegisterDetail(sessionId: string) {
  const [{ supabase }, financeSettings] = await Promise.all([
    requireAdminUser(),
    getFinanceSettings(),
  ]);
  const { data, error } = await supabase
    .from("register_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("status", "closed")
    .maybeSingle();
  if (error || !data) return null;
  return getRegisterSessionDetail(
    data as RegisterSessionRecord,
    financeSettings.enabledPaymentMethods,
    supabase,
  );
}

export async function getCurrentRegisterDetail() {
  const [{ supabase }, financeSettings] = await Promise.all([
    requireAdminUser(),
    getFinanceSettings(),
  ]);
  const { data, error } = await supabase
    .from("register_sessions")
    .select("*")
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return getRegisterSessionDetail(data as RegisterSessionRecord, financeSettings.enabledPaymentMethods, supabase);
}

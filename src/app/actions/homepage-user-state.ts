"use server";

import { getCurrentUserRole, type UserRole } from "@/lib/auth/customer";
import { createClient } from "@/lib/supabase/server";
import { getActiveServices } from "@/lib/public/services";
import { getEffectiveServicePrice } from "@/lib/promotions/server";
import { formatZurichDate, formatZurichTimeRange } from "@/lib/appointments/availability";
import {
  getBookingManagementUrl,
  getGuestBookingToken,
  isActiveManagedAppointment,
  resolveManagedAppointment,
} from "@/lib/appointments/management";
import type { PersistedBookingConfirmation } from "@/components/home/BookingSectionClient";

type CustomerProfile = {
  fullName: string;
  email: string;
  phone: string;
};

type ActiveRegisteredAppointment = {
  id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: "confirmed";
  booking_reference: string | null;
  final_price: number | null;
};

export type BookingServicePriceOverride = {
  serviceId: string;
  finalPrice: number;
  discountAmount: number;
  discountType: "percentage" | "fixed" | null;
  discountValue: number | null;
  promotionId: string | null;
  promotionName: string | null;
};

export type HomepageBookingUserState = {
  authRole: UserRole;
  customerProfile: CustomerProfile | null;
  persistedConfirmation: PersistedBookingConfirmation | null;
  shouldClearGuestBookingCookie: boolean;
  loyaltyReward: { id: string; rewardType: string; rewardValue: number | null } | null;
  servicePriceOverrides: BookingServicePriceOverride[];
};

const anonymousBookingState: HomepageBookingUserState = {
  authRole: null,
  customerProfile: null,
  persistedConfirmation: null,
  shouldClearGuestBookingCookie: false,
  loyaltyReward: null,
  servicePriceOverrides: [],
};

export async function getHomepageHeaderAuthState() {
  const { role, user } = await getCurrentUserRole();

  if (!user) return { label: "LOGIN" as const, href: "/login" as const };
  if (role === "admin") return { label: "ADMIN DASHBOARD" as const, href: "/admin" as const };
  return { label: "MY PROFILE" as const, href: "/account" as const };
}

export async function getHomepageBookingUserState(): Promise<HomepageBookingUserState> {
  try {
    const [{ role, user }, services] = await Promise.all([
      getCurrentUserRole(),
      getActiveServices(),
    ]);
    const supabase = await createClient();
    let customerProfile: CustomerProfile | null = null;
    let customerId: string | null = null;
    let registeredAppointment: ActiveRegisteredAppointment | null = null;
    let loyaltyReward: HomepageBookingUserState["loyaltyReward"] = null;

    if (role === "customer" && user) {
      const customerResponse = await supabase.rpc("get_my_customer");
      const customer = Array.isArray(customerResponse.data)
        ? customerResponse.data[0]
        : customerResponse.data;

      if (customer) {
        customerId = customer.id;
        customerProfile = {
          fullName: customer.full_name,
          email: customer.email,
          phone: customer.phone,
        };
        const nowIso = new Date().toISOString();
        const [{ data: activeAppointment }, { data: loyaltySettings }, { data: reward }] = await Promise.all([
          supabase
            .from("appointments")
            .select("id, service_id, start_at, end_at, status, booking_reference, final_price")
            .eq("customer_id", customer.id)
            .eq("status", "confirmed")
            .gt("end_at", nowIso)
            .order("start_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
          supabase.from("loyalty_settings").select("is_enabled").limit(1).maybeSingle(),
          supabase
            .from("loyalty_rewards")
            .select("id,reward_type,reward_value,expires_at")
            .eq("customer_id", customer.id)
            .eq("status", "available")
            .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
            .order("earned_at", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        registeredAppointment = activeAppointment as ActiveRegisteredAppointment | null;
        if (loyaltySettings?.is_enabled && reward) {
          loyaltyReward = {
            id: reward.id,
            rewardType: reward.reward_type,
            rewardValue: reward.reward_value === null ? null : Number(reward.reward_value),
          };
        }
      }
    }

    const servicePriceOverrides = role === "customer"
      ? (await Promise.all(services.map(async (service) => {
          const price = await getEffectiveServicePrice({
            serviceId: service.id,
            customerId,
            authenticatedCustomer: true,
            supabase,
          });
          return price ? {
            serviceId: service.id,
            finalPrice: price.finalPrice,
            discountAmount: price.discountAmount,
            discountType: price.discountType,
            discountValue: price.discountValue,
            promotionId: price.promotionId,
            promotionName: price.promotionName,
          } : null;
        }))).filter((price): price is BookingServicePriceOverride => price !== null)
      : [];

    const bookingToken = await getGuestBookingToken();
    let persistedConfirmation: PersistedBookingConfirmation | null = null;
    let shouldClearGuestBookingCookie = false;

    if (registeredAppointment) {
      let manageUrl: string | null = null;
      if (bookingToken) {
        const managed = await resolveManagedAppointment(bookingToken);
        if (managed?.appointment.id === registeredAppointment.id) {
          manageUrl = getBookingManagementUrl(bookingToken);
        }
      }
      const service = services.find((item) => item.id === registeredAppointment?.service_id);
      persistedConfirmation = {
        serviceTitle: service?.name ?? "Service",
        price: Number(registeredAppointment.final_price ?? service?.price ?? 0),
        date: formatZurichDate(registeredAppointment.start_at).toUpperCase(),
        time: formatZurichTimeRange(registeredAppointment.start_at, registeredAppointment.end_at),
        bookingReference: registeredAppointment.booking_reference,
        manageUrl,
        status: registeredAppointment.status,
      };
    } else if (role !== "customer" && bookingToken) {
      const managed = await resolveManagedAppointment(bookingToken);
      if (managed && isActiveManagedAppointment(managed.appointment)) {
        const service = services.find((item) => item.id === managed.appointment.service_id);
        persistedConfirmation = {
          serviceTitle: service?.name ?? "Service",
          price: Number(managed.appointment.final_price ?? service?.price ?? 0),
          date: formatZurichDate(managed.appointment.start_at).toUpperCase(),
          time: formatZurichTimeRange(managed.appointment.start_at, managed.appointment.end_at),
          bookingReference: managed.appointment.booking_reference ?? null,
          manageUrl: getBookingManagementUrl(bookingToken),
          status: managed.appointment.status,
        };
      } else {
        shouldClearGuestBookingCookie = true;
      }
    } else if (role === "customer" && bookingToken && customerId) {
      const managed = await resolveManagedAppointment(bookingToken);
      if (!managed || (managed.appointment.customer_id === customerId && !isActiveManagedAppointment(managed.appointment))) {
        shouldClearGuestBookingCookie = true;
      }
    }

    return {
      authRole: role,
      customerProfile,
      persistedConfirmation,
      shouldClearGuestBookingCookie,
      loyaltyReward,
      servicePriceOverrides,
    };
  } catch (error) {
    console.error("HOMEPAGE BOOKING USER STATE ERROR", error);
    return anonymousBookingState;
  }
}

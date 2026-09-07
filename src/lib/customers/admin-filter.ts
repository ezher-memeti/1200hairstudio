import { createAdminClient } from "@/lib/supabase/admin";

export type AdminIdentitySets = {
  adminUserIds: Set<string>;
  adminEmails: Set<string>;
};

export function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export async function getAdminIdentitySets(): Promise<AdminIdentitySets> {
  const adminSupabase = createAdminClient();
  const { data, error } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (error) {
    throw new Error(`Unable to identify admin profiles: ${error.message}`);
  }

  const adminUserIds = new Set((data ?? []).map((profile) => profile.id));
  const adminEmails = new Set<string>();

  if (!adminUserIds.size) {
    return { adminUserIds, adminEmails };
  }

  const authUsers = await Promise.all(
    Array.from(adminUserIds).map(async (userId) => {
      const { data: authData, error: authError } =
        await adminSupabase.auth.admin.getUserById(userId);

      if (authError) {
        throw new Error(`Unable to identify admin auth user: ${authError.message}`);
      }

      return authData.user;
    }),
  );

  for (const user of authUsers) {
    const email = normalizeEmail(user.email);
    if (email) adminEmails.add(email);
  }

  return { adminUserIds, adminEmails };
}

export function getNonAdminCustomerProfileFilter(adminUserIds: Set<string>) {
  if (!adminUserIds.size) return null;
  return `profile_id.is.null,profile_id.not.in.(${Array.from(adminUserIds).join(",")})`;
}

export function isAdminCustomerIdentity(
  customer: { profile_id?: string | null; email?: string | null },
  adminIdentities: AdminIdentitySets,
) {
  const email = normalizeEmail(customer.email);

  return Boolean(
    (customer.profile_id && adminIdentities.adminUserIds.has(customer.profile_id)) ||
      (email && adminIdentities.adminEmails.has(email)),
  );
}

import HeaderClient from "@/components/layout/HeaderClient";
import { getCurrentUserRole } from "@/lib/auth/customer";

type HeaderAuthLink = {
  label: "LOGIN" | "MY PROFILE" | "ADMIN DASHBOARD";
  href: "/login" | "/account" | "/admin";
};

async function getHeaderAuthLink(): Promise<HeaderAuthLink> {
  const { user, role } = await getCurrentUserRole();

  if (!user) {
    return {
      label: "LOGIN",
      href: "/login",
    };
  }

  if (role === "admin") {
    return {
      label: "ADMIN DASHBOARD",
      href: "/admin",
    };
  }

  return {
    label: "MY PROFILE",
    href: "/account",
  };
}

export default async function Header() {
  const authLink = await getHeaderAuthLink();

  return <HeaderClient authLink={authLink} />;
}

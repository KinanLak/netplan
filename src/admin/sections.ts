import {
  Activity01Icon,
  Location01Icon,
  UserMultiple02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { LinkProps } from "@tanstack/react-router";

export type AdminSection = {
  label: string;
  to: NonNullable<LinkProps["to"]>;
  icon: IconSvgElement;
};

/** The admin's left navigation, in order; `/admin` opens the first. */
export const ADMIN_SECTIONS: ReadonlyArray<AdminSection> = [
  { label: "Santé", to: "/admin/health", icon: Activity01Icon },
  { label: "Sites", to: "/admin/sites", icon: Location01Icon },
  { label: "Utilisateurs", to: "/admin/users", icon: UserMultiple02Icon },
];

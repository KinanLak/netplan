import { createFileRoute, redirect } from "@tanstack/react-router";
import { ADMIN_SECTIONS } from "@/admin/sections";

export const Route = createFileRoute("/_authed/admin/")({
  beforeLoad: () => {
    throw redirect({ to: ADMIN_SECTIONS[0].to, replace: true });
  },
});

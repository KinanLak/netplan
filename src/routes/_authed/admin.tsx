import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  PackageIcon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { AdminSkeleton } from "@/components/loading-skeletons";
import { UserMenu } from "@/components/app-nav";
import { NetplanLogo } from "@/components/netplan-logo";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { ADMIN_SECTIONS } from "@/admin/sections";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isAdmin } from "@/lib/roles";

export const Route = createFileRoute("/_authed/admin")({
  ssr: false,
  // Rendered by the server, so a slow link shows the frame at once.
  pendingComponent: AdminSkeleton,
  head: () => ({ meta: [{ title: "Administration" }] }),
  component: AdminShell,
});

// Admins are Éditeurs too, so history is theirs.
const APP_LINKS = [
  { label: "Retour au plan", to: "/", icon: ArrowLeft01Icon },
  { label: "Inventaire", to: "/inventory", icon: PackageIcon },
  { label: "Historique", to: "/history", icon: WorkHistoryIcon },
] as const;

// The server refuses every admin function to anyone else; this only spares
// them a page of errors.
function AdminShell() {
  const me = useCurrentUser();
  if (me === undefined) return <AdminSkeleton />;
  if (!isAdmin(me.role)) return <AdminOnly />;

  return (
    // On a narrow screen the navigation becomes a row above the content.
    <div className="flex h-svh flex-col bg-background text-foreground md:flex-row">
      <nav
        aria-label="Administration"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-sidebar p-2 md:w-56 md:flex-col md:items-stretch md:overflow-x-visible md:border-r md:border-b-0 md:p-3"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 md:mb-3">
          <Link to="/" aria-label="Retour au plan">
            <NetplanLogo size={30} />
          </Link>
          <ModeToggle />
        </div>
        <div className="hidden px-2 pb-1 text-xs font-medium text-muted-foreground md:block">
          Administration
        </div>
        {ADMIN_SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
            }}
          >
            <HugeiconsIcon icon={section.icon} size={16} strokeWidth={1.5} />
            {section.label}
          </Link>
        ))}
        <div className="flex shrink-0 items-center gap-1 md:mt-auto md:flex-col md:items-stretch">
          {APP_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <HugeiconsIcon icon={link.icon} size={16} strokeWidth={1.5} />
              {link.label}
            </Link>
          ))}
          <UserMenu inAdmin className="justify-between md:mt-2 md:max-w-none" />
        </div>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function AdminOnly() {
  return (
    <main className="flex h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="text-lg font-semibold">Réservé aux administrateurs</h1>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        Retour au plan
      </Link>
    </main>
  );
}

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { NetplanLogo } from "@/components/netplan-logo";
import { ModeToggle } from "@/components/mode-toggle";
import { buttonVariants } from "@/components/ui/button";
import { ADMIN_SECTIONS } from "@/admin/sections";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isAdmin } from "@/lib/roles";

export const Route = createFileRoute("/_authed/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Administration" }] }),
  component: AdminShell,
});

// The server refuses every admin function to anyone else; this only spares
// them a page of errors.
function AdminShell() {
  const me = useCurrentUser();
  if (me === undefined) return <div className="h-svh bg-background" />;
  if (!isAdmin(me.role)) return <AdminOnly sso={me.sso} />;

  return (
    // On a narrow screen the navigation becomes a row above the content.
    <div className="flex h-svh flex-col bg-background text-foreground md:flex-row">
      <nav
        aria-label="Administration"
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b bg-sidebar p-2 md:w-56 md:flex-col md:items-stretch md:overflow-x-visible md:border-r md:border-b-0 md:p-3"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 md:mb-3">
          <Link to="/" aria-label="Retour à la carte">
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
        <Link
          to="/"
          className="mt-auto hidden items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:flex"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.5} />
          Retour à la carte
        </Link>
      </nav>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function AdminOnly({ sso }: { sso: boolean }) {
  return (
    <main className="flex h-svh flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <h1 className="text-lg font-semibold">Accès réservé</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        L'administration est réservée aux administrateurs.
        {sso
          ? " Votre rôle vient de Keycloak : demandez à un administrateur de vous en donner un autre."
          : null}
      </p>
      <Link to="/" className={buttonVariants({ variant: "outline" })}>
        Retour à la carte
      </Link>
    </main>
  );
}

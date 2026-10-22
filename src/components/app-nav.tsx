import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  Logout01Icon,
  PackageIcon,
  Settings01Icon,
  WorkHistoryIcon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCanEdit, useCurrentUser } from "@/hooks/use-current-user";
import { ROLE_LABELS, isAdmin } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { useSignOut } from "@/panels/SidebarAccount";
import { roleOf } from "../../convex/lib/roles";

const linkClass = buttonVariants({ variant: "ghost", size: "sm" });
const activeClass = "bg-accent text-accent-foreground";

/**
 * The pages besides the map, for the headers of the pages that are not the
 * map: the map's sidebar already links them. History is an Éditeur's.
 */
export function AppNavLinks({ site }: { site?: string }) {
  const canEdit = useCanEdit();
  const search = site ? { site } : {};
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-1">
      <Link to="/" search={search} className={linkClass}>
        Plan
      </Link>
      <Link
        to="/inventory"
        search={search}
        className={linkClass}
        activeProps={{ className: activeClass }}
      >
        <HugeiconsIcon icon={PackageIcon} strokeWidth={1.5} />
        Inventaire
      </Link>
      {canEdit ? (
        <Link
          to="/history"
          search={search}
          className={linkClass}
          activeProps={{ className: activeClass }}
        >
          <HugeiconsIcon icon={WorkHistoryIcon} strokeWidth={1.5} />
          Historique
        </Link>
      ) : null}
    </nav>
  );
}

/**
 * Who is signed in, the admin for an Admin (`inAdmin` once there), and the
 * way out.
 */
export function UserMenu({
  inAdmin = false,
  className,
}: {
  inAdmin?: boolean;
  className?: string;
}) {
  const me = useCurrentUser();
  const navigate = useNavigate();
  const { signingOut, signOut } = useSignOut();
  if (!me) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "max-w-32 sm:max-w-48",
          className,
        )}
      >
        <span className="truncate">{me.name}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <div className="truncate font-medium text-foreground">
              {me.name}
            </div>
            <div>{ROLE_LABELS[roleOf(me.role)]}</div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {isAdmin(me.role) && !inAdmin ? (
          <DropdownMenuItem onClick={() => void navigate({ to: "/admin" })}>
            <HugeiconsIcon icon={Settings01Icon} strokeWidth={1.5} />
            Administration
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={signingOut} onClick={() => void signOut()}>
          <HugeiconsIcon icon={Logout01Icon} strokeWidth={1.5} />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

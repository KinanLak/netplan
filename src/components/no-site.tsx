import { Link } from "@tanstack/react-router";
import { buttonVariants } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-current-user";
import { isAdmin } from "@/lib/roles";
import { useCurrentSite } from "@/sites/useCurrentSite";

/**
 * A page of a site when there is none to show: the way in for an Admin, and
 * nothing for anyone else (ADR 0041). Sites may exist, all archived (ADR 0033).
 */
export function NoSite() {
  const me = useCurrentUser();
  const { sites } = useCurrentSite();
  if (!me || !isAdmin(me.role)) return null;
  const allArchived = (sites?.length ?? 0) > 0;
  return (
    <div className="flex justify-center rounded-lg border border-dashed p-8">
      <Link to="/admin/sites" className={buttonVariants()}>
        {allArchived ? "Désarchiver un site" : "Créer un site"}
      </Link>
    </div>
  );
}

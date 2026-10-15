import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ROLE_LABELS, isAdmin } from "@/lib/roles";
import { roleOf } from "../../convex/lib/roles";

export function SidebarAccount() {
  const me = useCurrentUser();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await authClient.signOut();
    window.location.assign("/login");
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{me?.name ?? "…"}</div>
        <div className="text-xs text-muted-foreground">
          {me ? ROLE_LABELS[roleOf(me.role)] : " "}
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        {isAdmin(me?.role) ? (
          <Link
            to="/admin"
            aria-label="Administration"
            title="Administration"
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
          >
            <HugeiconsIcon icon={Settings01Icon} />
          </Link>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Se déconnecter"
          title="Se déconnecter"
          disabled={signingOut}
          onClick={() => void signOut()}
        >
          <HugeiconsIcon icon={Logout01Icon} />
        </Button>
      </div>
    </div>
  );
}

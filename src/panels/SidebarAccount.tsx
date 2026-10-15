import { HugeiconsIcon } from "@hugeicons/react";
import { Logout01Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ROLE_LABELS } from "@/lib/roles";
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
  );
}

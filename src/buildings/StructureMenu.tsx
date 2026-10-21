import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import type { ReactElement } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StructureKind } from "@/buildings/names";
import { useStructureDialog } from "@/buildings/useStructureDialog";
import { failureMessage } from "@/lib/errors";
import { api } from "../../convex/_generated/api";

/** A building's or floor's actions, for the sidebar in edit mode. */
export function StructureMenu({
  target,
  id,
  name,
  trigger,
  canMoveUp = false,
  canMoveDown = false,
}: {
  target: StructureKind;
  id: string;
  name: string;
  trigger: ReactElement;
  /** A floor with another above it, in the sidebar's top-first order. */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const open = useStructureDialog((state) => state.open);
  const moveFloor = useMutation(api.floors.move);
  const what = target === "building" ? "du bâtiment" : "de l'étage";
  const move = (direction: "up" | "down") => {
    moveFloor({ id, direction }).catch((caught: unknown) => {
      toast.error(failureMessage(caught, "editor"));
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={trigger}
        aria-label={`Actions ${what} ${name}`}
      >
        <HugeiconsIcon icon={MoreHorizontalIcon} size={16} strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        {target === "building" ? (
          <DropdownMenuItem
            onClick={() =>
              open({ kind: "add-floor", buildingId: id, buildingName: name })
            }
          >
            <HugeiconsIcon icon={Add01Icon} strokeWidth={1.5} />
            Ajouter un étage
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          onClick={() => open({ kind: "rename", target, id, name })}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={1.5} />
          Renommer
        </DropdownMenuItem>
        {target === "floor" ? (
          <>
            <DropdownMenuItem disabled={!canMoveUp} onClick={() => move("up")}>
              <HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={1.5} />
              Monter
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canMoveDown}
              onClick={() => move("down")}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={1.5} />
              Descendre
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => open({ kind: "remove", target, id, name })}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={1.5} />
          Supprimer
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

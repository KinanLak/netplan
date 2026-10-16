import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
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

/** A building's or floor's actions, for the sidebar in edit mode. */
export function StructureMenu({
  target,
  id,
  name,
  trigger,
}: {
  target: StructureKind;
  id: string;
  name: string;
  trigger: ReactElement;
}) {
  const open = useStructureDialog((state) => state.open);
  const what = target === "building" ? "du bâtiment" : "de l'étage";

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

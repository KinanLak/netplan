import type { ShortcutAction } from "@/lib/shortcuts";
import type { ShortcutGroup } from "@/lib/shortcut-groups";
import { getShortcutDisplay, shortcuts } from "@/lib/shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

interface ShortcutGroupGridProps {
  groups: Array<ShortcutGroup>;
}

/** The shortcuts dialog's two columns of groups. */
export function ShortcutGroupGrid({ groups }: ShortcutGroupGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group.title}
          </h3>
          <ul className="space-y-2">
            {group.actions.map((action) => (
              <ShortcutRow key={action} action={action} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ShortcutRow({ action }: { action: ShortcutAction }) {
  const config = shortcuts[action];

  return (
    <li className="flex items-center justify-between gap-3">
      <span className="text-sm text-foreground">{config.label}</span>
      {/* Keys never wrap: "Ctrl Shift Z" reads as one chord. */}
      <span className="flex shrink-0 items-center gap-3 whitespace-nowrap">
        {getShortcutDisplay(action).map((keys) => (
          <span key={keys.join("+")} className="flex items-center gap-1">
            <KbdGroup>
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </KbdGroup>
          </span>
        ))}
      </span>
    </li>
  );
}

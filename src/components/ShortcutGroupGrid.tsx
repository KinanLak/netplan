import type { ShortcutAction } from "@/lib/shortcuts";
import type { ShortcutGroup } from "@/lib/shortcut-groups";
import { formatHotkey, shortcuts } from "@/lib/shortcuts";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

interface ShortcutGroupGridProps {
  groups: Array<ShortcutGroup>;
  /** Pick which text to display for each action. Defaults to `label`. */
  labelKey?: "label" | "description";
}

/**
 * Renders a 2-column grid of shortcut groups.
 * Shared between ShortcutsOverlay and ShortcutsDialog.
 */
export function ShortcutGroupGrid({
  groups,
  labelKey = "label",
}: ShortcutGroupGridProps) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {groups.map((group) => (
        <div key={group.id}>
          <h3 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group.title}
          </h3>
          <ul className="space-y-2">
            {group.actions.map((action) => (
              <ShortcutRow key={action} action={action} labelKey={labelKey} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ShortcutRow({
  action,
  labelKey,
}: {
  action: ShortcutAction;
  labelKey: "label" | "description";
}) {
  const config = shortcuts[action];
  const keyCombinations = Array.from(
    new Map(
      config.keys
        .map((hotkey) => formatHotkey(hotkey))
        .map((keys) => [keys.join("+"), keys]),
    ).values(),
  );

  const displayLabel =
    labelKey === "description"
      ? (config.description ?? config.label)
      : config.label;

  return (
    <li className="flex items-center justify-between gap-2">
      <span className="text-sm text-foreground">{displayLabel}</span>
      <span className="flex items-center gap-1">
        {keyCombinations.map((keys, keyGroupIndex) => {
          const keyGroupKey = `${action}-${keyGroupIndex}`;

          return (
            <span key={keyGroupKey} className="flex items-center gap-1">
              {keyGroupIndex > 0 ? (
                <span className="text-xs text-muted-foreground">/</span>
              ) : null}
              <KbdGroup>
                {keys.map((key, keyIndex) => (
                  <Kbd key={`${keyGroupKey}-${keyIndex}`}>{key}</Kbd>
                ))}
              </KbdGroup>
            </span>
          );
        })}
      </span>
    </li>
  );
}

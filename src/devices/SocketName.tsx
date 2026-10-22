import { PlugSocketIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

/**
 * A wall socket named in a sentence or a list: its icon says « prise », so
 * a socket named « Prise B-06 » does not read « Prise « Prise B-06 » » (A105).
 */
export function SocketName({ name }: { name: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <HugeiconsIcon
        icon={PlugSocketIcon}
        size={12}
        strokeWidth={1.5}
        className="shrink-0 self-center"
        aria-hidden
      />
      <span className="sr-only">Prise </span>
      {name}
    </span>
  );
}

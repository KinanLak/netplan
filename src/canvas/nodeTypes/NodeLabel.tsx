import { fitLabel } from "@/canvas/nodeLabel";
import type { LabelBox } from "@/canvas/nodeLabel";
import { cn } from "@/lib/utils";

/** The name in the middle of a PC's or an endpoint's card. */
export const CARD_LABEL: LabelBox = { width: 64, lines: 2, max: 10, min: 7 };
/** The name in the top bar of a switch or a patch panel. */
export const BAR_LABEL: LabelBox = { width: 150, lines: 1, max: 9, min: 7 };
/** The name at the top of a rack. */
export const RACK_LABEL: LabelBox = { width: 68, lines: 1, max: 8, min: 6 };
/** The name under a socket's icon. */
export const SOCKET_LABEL: LabelBox = { width: 34, lines: 2, max: 8, min: 6 };

/**
 * A device's name on its node (ADR 0029): capitals, shrunk to fit; the full
 * name shows on hover and in the drawer.
 */
export function NodeLabel({
  name,
  box,
  className,
}: {
  name: string;
  box: LabelBox;
  className?: string;
}) {
  const { text, fontSize } = fitLabel(name, box);
  return (
    <span
      className={cn(
        "overflow-hidden leading-[1.15] break-normal [overflow-wrap:anywhere]",
        className,
      )}
      style={{
        fontSize,
        display: "-webkit-box",
        WebkitBoxOrient: "vertical",
        WebkitLineClamp: box.lines,
      }}
    >
      {text}
    </span>
  );
}

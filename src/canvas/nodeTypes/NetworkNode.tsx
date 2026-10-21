import type { DeviceId, DeviceStatus } from "@/types/map";
import { cn } from "@/lib/utils";
import { DEVICE_STATUS_CLASSES } from "@/devices/status";
import {
  useIsDeviceSelected,
  useIsEditMode,
  useShowsCables,
} from "@/store/selectors";

export interface NetworkNodeProps {
  /** React Flow node id — used to read selection and cable display state */
  id: string;
  /** The device's status, or `null` for a passive device, which has none */
  status: DeviceStatus | null;
  /** Node dimensions */
  width: number;
  height: number;
  /** Additional CSS classes */
  className?: string;
  /** Content inside the node */
  children: React.ReactNode;
  /** React 19: ref is a regular prop for function components */
  ref?: React.Ref<HTMLDivElement>;
}

type Tone = DeviceStatus | "passive";

const borderOf = (tone: Tone) =>
  tone === "passive" ? "border-border" : DEVICE_STATUS_CLASSES[tone].border;

// Literal classes, so Tailwind sees each one.
const SELECTED_GLOWS: Record<Tone, string> = {
  up: "shadow-[0_0_8px_2px_var(--up)]!",
  down: "shadow-[0_0_8px_2px_var(--down)]!",
  unknown: "shadow-[0_0_8px_2px_var(--unknown)]!",
  passive: "shadow-[0_0_8px_2px_var(--ring)]!",
};

const SHOWN_GLOWS: Record<Tone, string> = {
  up: "shadow-[0_0_6px_1px_var(--up)]!",
  down: "shadow-[0_0_6px_1px_var(--down)]!",
  unknown: "shadow-[0_0_6px_1px_var(--unknown)]!",
  passive: "shadow-[0_0_6px_1px_var(--ring)]!",
};

/**
 * Base wrapper component for all network device nodes: its border says the
 * device's status, a glow its selection, and a quieter glow that its cables
 * show. A passive device keeps a neutral border.
 */
export default function NetworkNode({
  id,
  status,
  width,
  height,
  className,
  children,
  ref,
}: NetworkNodeProps) {
  const isEditMode = useIsEditMode();
  const deviceId = id as DeviceId;
  const isSelected = useIsDeviceSelected(deviceId);
  // A switch or patch panel whose cables show keeps a glow, so the way to
  // hide them is not lost when it is deselected.
  const isHighlighted = useShowsCables(deviceId);
  const tone: Tone = status ?? "passive";

  return (
    <div
      ref={ref}
      className={cn(
        "network-node relative rounded-sm border-2 transition-all duration-200",
        isEditMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        borderOf(tone),
        isSelected
          ? SELECTED_GLOWS[tone]
          : isHighlighted
            ? SHOWN_GLOWS[tone]
            : "shadow-md",
        className,
      )}
      style={{ width, height }}
    >
      {children}
    </div>
  );
}

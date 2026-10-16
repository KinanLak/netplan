import { useIsEditMode } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceId, PortId } from "@/types/map";

/** Marks an element as a port a cable is drawn from or dropped on. */
export const PORT_ID_ATTRIBUTE = "data-port-id";

export const portIdAt = (target: EventTarget | null): PortId | undefined => {
  if (!(target instanceof Element)) return undefined;
  const port = target.closest(`[${PORT_ID_ATTRIBUTE}]`);
  return (port?.getAttribute(PORT_ID_ATTRIBUTE) ?? undefined) as
    | PortId
    | undefined;
};

/**
 * The pointer-down handler of a device's ports, and whether they are grips:
 * in edit mode, pressing a port draws a cable from it, or unplugs the one
 * there, instead of moving the device.
 */
export const useCableGrip = (deviceId: DeviceId) => {
  const isEditMode = useIsEditMode();
  const setCableDraft = useMapStore((s) => s.setCableDraft);

  const onPointerDown = (event: React.PointerEvent) => {
    if (!isEditMode || event.button !== 0) return;
    const portId = portIdAt(event.target);
    if (!portId) return;
    const { activeDrawTool, isOverlayPanelOpen, isMultiSelectMode } =
      useMapStore.getState();
    if (activeDrawTool !== "device" || isOverlayPanelOpen || isMultiSelectMode)
      return;
    event.stopPropagation();
    // No text selection follows the cable across the plan.
    event.preventDefault();
    // The cable layer settles whether the press draws or unplugs.
    setCableDraft({ deviceId, portId });
  };

  return { isGrip: isEditMode, onPointerDown };
};

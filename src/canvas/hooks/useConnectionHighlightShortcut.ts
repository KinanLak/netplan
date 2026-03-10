import { useCallback } from "react";
import { getConnectedDeviceIds } from "@/domain/map/selectors";
import { useShortcut } from "@/hooks/use-shortcuts";
import { useMapStore } from "@/store/useMapStore";
import { useMapUiStore } from "@/store/useMapUiStore";

export function useConnectionHighlightShortcut() {
  const handleHighlightHoveredConnections = useCallback(() => {
    const { document } = useMapStore.getState();
    const {
      highlightedDeviceIds,
      selectedDeviceId,
      hoveredDeviceId,
      setHighlightedDevices,
    } = useMapUiStore.getState();

    const canUseShortcut =
      !selectedDeviceId &&
      (hoveredDeviceId !== null || highlightedDeviceIds.length > 0);

    if (!canUseShortcut) {
      return;
    }

    if (highlightedDeviceIds.length > 0 && !selectedDeviceId) {
      setHighlightedDevices([]);
      return;
    }

    const targetDeviceId = selectedDeviceId || hoveredDeviceId;
    if (!targetDeviceId) {
      return;
    }

    const connectedIds = getConnectedDeviceIds(document, targetDeviceId);
    if (connectedIds.length === 0) {
      return;
    }

    const allIdsToHighlight = [targetDeviceId, ...connectedIds];
    const isCurrentlyHighlighted = allIdsToHighlight.every((id) =>
      highlightedDeviceIds.includes(id),
    );

    if (isCurrentlyHighlighted) {
      setHighlightedDevices([]);
      return;
    }

    setHighlightedDevices(allIdsToHighlight);
  }, []);

  useShortcut("highlight-connections", handleHighlightHoveredConnections);
}

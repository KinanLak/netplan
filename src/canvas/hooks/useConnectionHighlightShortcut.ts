import { useCallback } from "react";
import { useShortcut } from "@/hooks/use-shortcuts";
import { useMapStore } from "@/store/useMapStore";

export function useConnectionHighlightShortcut() {
  const handleHighlightHoveredConnections = useCallback(() => {
    const {
      devices,
      highlightedDeviceIds,
      selectedDeviceId,
      hoveredDeviceId,
      setHighlightedDevices,
    } = useMapStore.getState();

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

    const device = devices.find((candidate) => candidate.id === targetDeviceId);
    if (!device?.metadata.connectedDeviceIds?.length) {
      return;
    }

    const connectedIds = device.metadata.connectedDeviceIds;
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

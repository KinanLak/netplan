import { useCallback } from "react";
import type { Device } from "@/types/map";
import { useShortcut } from "@/hooks/use-shortcuts";

interface UseConnectionHighlightShortcutParams {
  devices: Array<Device>;
  highlightedDeviceIds: Array<string>;
  selectedDeviceId: string | null;
  hoveredDeviceId: string | null;
  setHighlightedDevices: (deviceIds: Array<string>) => void;
}

export function useConnectionHighlightShortcut({
  devices,
  highlightedDeviceIds,
  selectedDeviceId,
  hoveredDeviceId,
  setHighlightedDevices,
}: UseConnectionHighlightShortcutParams) {
  const handleHighlightHoveredConnections = useCallback(() => {
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
  }, [
    devices,
    highlightedDeviceIds,
    hoveredDeviceId,
    selectedDeviceId,
    setHighlightedDevices,
  ]);

  useShortcut("highlight-connections", handleHighlightHoveredConnections, {
    enabled:
      (!!hoveredDeviceId || highlightedDeviceIds.length > 0) &&
      !selectedDeviceId,
  });
}

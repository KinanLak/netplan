import { useQuery } from "convex/react";
import { useReactFlow } from "@xyflow/react";
import { api } from "../../../convex/_generated/api";
import { getDeviceKind } from "@/devices/deviceKindRegistry";
import { layoutInventoryGrid } from "@/integrations/netbox/inventoryPlacement";
import {
  useMapDocumentActions,
  useMapDocumentData,
} from "@/map-session/useMapDocument";
import { useIsEditMode } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { DeviceDraft, DeviceId } from "@/types/map";

export function useLinkedSocketActions(deviceId: DeviceId | null) {
  const inventory = useQuery(api.netbox.listInventory, deviceId ? {} : "skip");
  const discoveries = useQuery(
    api.librenms.listDiscoveredConnections,
    deviceId ? {} : "skip",
  );
  const isEditMode = useIsEditMode();
  const { document } = useMapDocumentData();
  const { commands } = useMapDocumentActions();
  const reactFlow = useReactFlow();
  const selectDevice = useMapStore((state) => state.selectDevice);
  const setCurrentFloor = useMapStore((state) => state.setCurrentFloor);
  const setActiveDrawTool = useMapStore((state) => state.setActiveDrawTool);

  const device = deviceId
    ? document.devices.find((candidate) => candidate.id === deviceId)
    : undefined;
  const externalId = device?.metadata.source?.externalId;
  const discovery = externalId
    ? discoveries?.find(
        (candidate) => candidate.computerExternalId === externalId,
      )
    : undefined;
  const socketItem = discovery
    ? inventory?.find(
        (candidate) => candidate.externalId === discovery.socketExternalId,
      )
    : undefined;
  const placedSocket = discovery
    ? document.devices.find(
        (candidate) =>
          candidate.metadata.source?.externalId === discovery.socketExternalId,
      )
    : undefined;
  const isLoading = Boolean(deviceId) && (!inventory || !discoveries);

  const focusDevice = (targetId: DeviceId) => {
    const target = document.devices.find(
      (candidate) => candidate.id === targetId,
    );
    if (!target) return;
    setCurrentFloor(target.floorId);
    setActiveDrawTool("device");
    selectDevice(target.id);
    window.requestAnimationFrame(() => {
      reactFlow.setCenter(
        target.position.x + target.size.width / 2,
        target.position.y + target.size.height / 2,
        { duration: 450, zoom: Math.max(reactFlow.getZoom(), 0.8) },
      );
    });
  };

  const placeLinkedSocket = () => {
    if (!device || !socketItem || placedSocket || !isEditMode) return;
    const size = getDeviceKind(socketItem.type).defaultSize;
    const placement = layoutInventoryGrid({
      items: [{ id: socketItem.externalId, size }],
      center: {
        x: device.position.x + device.size.width + size.width,
        y: device.position.y + device.size.height / 2,
      },
      isBlocked: (item, position) =>
        commands.checkCollision(
          device.floorId,
          `device:netbox-preview:${item.id}` as DeviceId,
          position,
          item.size,
        ),
    }).at(0);
    if (!placement) return;
    const draft: DeviceDraft = {
      floorId: device.floorId,
      type: socketItem.type,
      name: socketItem.name,
      hostname: socketItem.hostname,
      position: placement.position,
      size: placement.size,
      metadata: {
        ip: socketItem.ip,
        model: socketItem.model,
        status: "unknown",
        macs: socketItem.macs,
        source: {
          provider: "netbox",
          externalId: socketItem.externalId,
          url: socketItem.url,
          site: socketItem.site,
          location: socketItem.location,
          locationPath: socketItem.locationPath,
          role: socketItem.role,
          lifecycleStatus: socketItem.lifecycleStatus,
          syncedAt: socketItem.syncedAt,
        },
      },
    };
    const newId = commands.addDevice(draft);
    if (newId) focusDevice(newId);
  };

  const deleteDevice = () => {
    if (!device || !isEditMode) return;
    commands.deleteDevice(device.id);
    selectDevice(null);
  };

  return {
    device,
    discovery,
    socketItem,
    placedSocket,
    isEditMode,
    isLoading,
    focusDevice,
    placeLinkedSocket,
    deleteDevice,
  };
}

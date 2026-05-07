import { deviceKinds } from "@/devices/deviceKindRegistry";
import { useShortcutIntentEffects } from "@/hooks/use-shortcuts";
import type { DeviceType } from "@/types/map";

interface UseDeviceToolShortcutsParams {
  enabled: boolean;
  onSelectDeviceType: (type: DeviceType) => void;
}

export function useDeviceToolShortcuts({
  enabled,
  onSelectDeviceType,
}: UseDeviceToolShortcutsParams) {
  useShortcutIntentEffects(
    deviceKinds.map((kind) => ({
      action: kind.shortcut.action,
      enabled,
      run: () => onSelectDeviceType(kind.type),
    })),
  );
}

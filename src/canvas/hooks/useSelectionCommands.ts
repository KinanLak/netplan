import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  alignDevices,
  arrangedDevicesOverlap,
  distributeDevices,
  nudgeDevices,
} from "@/canvas/arrangement";
import type {
  Alignment,
  DistributionAxis,
  PositionUpdate,
} from "@/canvas/arrangement";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { GRID_SIZE } from "@/lib/grid";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import type { Device, Position } from "@/types/map";

/** What the server applies at most in one change. */
export const MAX_SELECTION_MOVE = 100;

const NUDGE_STEPS: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
};

/**
 * Moves, aligns and spreads the selected devices as single map changes
 * (ADR 0030). Each refuses, without moving anything, a result where a device
 * would stand on a wall or another device.
 */
export function useSelectionMoves() {
  const { commands, getDocument } = useMapDocumentActions();

  const selectedDevices = (): Array<Device> => {
    const { currentFloorId, selectedDeviceIdSet } = useMapStore.getState();
    return getDocument().devices.filter(
      (device) =>
        device.floorId === currentFloorId && selectedDeviceIdSet.has(device.id),
    );
  };

  /** Applies the moves when every device lands on free ground. */
  const move = (
    devices: ReadonlyArray<Device>,
    updates: Array<PositionUpdate>,
  ): boolean => {
    if (updates.length === 0) return false;
    if (devices.length > MAX_SELECTION_MOVE) {
      toast.error(
        `Sélectionnez au plus ${MAX_SELECTION_MOVE} équipements pour les déplacer ensemble.`,
      );
      return false;
    }
    const ignored = new Set(devices.map((device) => device.id));
    const byId = new Map(devices.map((device) => [device.id, device]));
    const blocked =
      arrangedDevicesOverlap(devices, updates) ||
      updates.some((update) => {
        const device = byId.get(update.deviceId);
        return (
          !device ||
          commands.checkCollision(
            device.floorId,
            device.id,
            update.position,
            device.size,
            ignored,
          )
        );
      });
    if (blocked) return false;
    commands.updateDevicePositions(updates);
    return true;
  };

  const arrange = (
    plan: (devices: ReadonlyArray<Device>) => Array<PositionUpdate>,
    refusal: string,
  ) => {
    const devices = selectedDevices();
    const updates = plan(devices);
    if (updates.length === 0) return;
    if (!move(devices, updates)) toast.error(refusal);
  };

  return {
    selectedDevices,
    move,
    align: (alignment: Alignment) =>
      arrange(
        (devices) => alignDevices(devices, alignment),
        "Impossible d'aligner : des équipements se chevaucheraient ou toucheraient un mur.",
      ),
    distribute: (axis: DistributionAxis) =>
      arrange(
        (devices) => distributeDevices(devices, axis),
        "Impossible de répartir : des équipements se chevaucheraient ou toucheraient un mur.",
      ),
  };
}

/**
 * The arrows nudge the selection, one grid cell or four with Shift; a held
 * key gathers its moves into one change and one undo, sent on release. Ctrl+A
 * selects the floor's devices. Mounted once, by the map.
 */
export function useSelectionShortcuts() {
  const { commands, getDocument } = useMapDocumentActions();
  const { selectedDevices, move } = useSelectionMoves();
  const heldKeyRef = useRef<string | null>(null);

  useShortcutIntentEffect("nudge-selection", (event) => {
    const direction = NUDGE_STEPS[event.key] as Position | undefined;
    if (!direction) return;
    if (heldKeyRef.current !== event.key) {
      if (heldKeyRef.current !== null) commands.endHistoryGroup();
      heldKeyRef.current = event.key;
      commands.beginHistoryGroup();
    }
    const cells = event.shiftKey ? 4 : 1;
    const devices = selectedDevices();
    move(
      devices,
      nudgeDevices(devices, {
        x: direction.x * cells * GRID_SIZE,
        y: direction.y * cells * GRID_SIZE,
      }),
    );
  });

  useEffect(() => {
    const endHold = () => {
      if (heldKeyRef.current === null) return;
      heldKeyRef.current = null;
      commands.endHistoryGroup();
    };
    const release = (event: KeyboardEvent) => {
      if (event.key === heldKeyRef.current) endHold();
    };
    window.addEventListener("keyup", release);
    window.addEventListener("blur", endHold);
    return () => {
      window.removeEventListener("keyup", release);
      window.removeEventListener("blur", endHold);
      endHold();
    };
  }, [commands]);

  useShortcutIntentEffect("select-all", () => {
    const { currentFloorId, setSelectedDevices } = useMapStore.getState();
    setSelectedDevices(
      getDocument()
        .devices.filter((device) => device.floorId === currentFloorId)
        .map((device) => device.id),
    );
  });
}

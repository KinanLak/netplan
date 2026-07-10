import { Profiler, useEffect, useState } from "react";
import type { ProfilerOnRenderCallback, ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { ShortcutIntentProvider } from "@/hooks/use-shortcuts";
import { MapDocumentProvider } from "@/map-session/MapDocumentProvider";
import type { MapDocumentCommands } from "@/map-session/MapDocumentProvider";
import { MapDocumentStatus } from "@/map-session/MapDocumentStatus";
import {
  useMapDocumentActions,
  useMapDocumentData,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useTemporalStore, useUndoRedo } from "@/hooks/use-undo-redo";
import { useCanvasDeviceNodes } from "@/canvas/hooks/useCanvasDeviceNodes";
import {
  WallInteractionLayer,
  createWallPaneEventBridge,
} from "@/canvas/components/WallInteractionLayer";
import type { WallPaneEventBridge } from "@/canvas/components/WallInteractionLayer";
import { useMapStore } from "@/store/useMapStore";
import {
  useActiveDrawTool,
  useCurrentFloorId,
  useIsEditMode,
  useSelectedDeviceId,
  useSelectedWallColor,
} from "@/store/selectors";
import { BENCH_FLOOR_ID } from "./fixtures";

export interface SubtreeStats {
  commits: number;
  duration: number;
}

export class RenderStats {
  readonly subtrees = new Map<string, SubtreeStats>();

  onRender: ProfilerOnRenderCallback = (id, _phase, actualDuration) => {
    const entry = this.subtrees.get(id) ?? { commits: 0, duration: 0 };
    entry.commits += 1;
    entry.duration += actualDuration;
    this.subtrees.set(id, entry);
  };

  /** Counts a component-body execution (for parents whose Profiler would
   * also fire for child-only commits). */
  recordRender(id: string) {
    const entry = this.subtrees.get(id) ?? { commits: 0, duration: 0 };
    entry.commits += 1;
    this.subtrees.set(id, entry);
  }

  reset() {
    this.subtrees.clear();
  }

  snapshot(): Record<string, SubtreeStats> {
    return Object.fromEntries(
      [...this.subtrees.entries()].map(([id, entry]) => [id, { ...entry }]),
    );
  }
}

export class BenchHandles {
  bridge: WallPaneEventBridge | null = null;
  commands: MapDocumentCommands | null = null;
  pendingOperationCount = 0;

  capture(
    bridge: WallPaneEventBridge,
    commands: MapDocumentCommands,
    pendingOperationCount: number,
  ) {
    this.bridge = bridge;
    this.commands = commands;
    this.pendingOperationCount = pendingOperationCount;
  }
}

export const createBenchHandles = (): BenchHandles => new BenchHandles();

/**
 * Mirrors the FlowCanvas shell: document + commands + node sync, with the
 * real WallInteractionLayer mounted below under its own profiler so pointer
 * interaction renders are measured separately from the shell.
 */
function CanvasShellProbe({
  handles,
  stats,
}: {
  handles: BenchHandles;
  stats: RenderStats;
}) {
  stats.recordRender("canvas-shell");
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);

  const { document, pendingOperations } = useMapDocumentData();
  const isReady = useMapDocumentReady();
  const { commands } = useMapDocumentActions();
  const canEditDevices = isEditMode && activeDrawTool === "device" && isReady;
  const floorWalls = document.walls.filter(
    (wall) => wall.floorId === currentFloorId,
  );

  const { nodes } = useCanvasDeviceNodes({
    devices: document.devices,
    currentFloorId,
    selectedDeviceId,
    activeDrawTool,
    canEditDevices,
    checkCollision: commands.checkCollision,
    updateDevicePosition: commands.updateDevicePosition,
    selectDevice,
    setHoveredDevice,
  });

  const [paneBridge] = useState(createWallPaneEventBridge);
  useEffect(() => {
    handles.capture(paneBridge, commands, pendingOperations.length);
  });

  return (
    <div data-nodes={nodes.length}>
      <Profiler id="wall-layer" onRender={stats.onRender}>
        <WallInteractionLayer bridge={paneBridge} floorWalls={floorWalls} />
      </Profiler>
    </div>
  );
}

/** Mirrors Toolbar: commands + readiness + draw tool selectors. */
function ToolbarProbe() {
  const currentFloorId = useCurrentFloorId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const selectedWallColor = useSelectedWallColor();
  const { commands } = useMapDocumentActions();
  const isReady = useMapDocumentReady();

  return (
    <div
      data-ready={isReady}
      data-floor={currentFloorId}
      data-edit={isEditMode}
      data-tool={activeDrawTool}
      data-color={selectedWallColor}
      data-commands={typeof commands}
    />
  );
}

/** Mirrors AppSidebar's undo/redo consumption. */
function SidebarHistoryProbe() {
  const canUndo = useTemporalStore((s) => s.pastStates.length > 0);
  const canRedo = useTemporalStore((s) => s.futureStates.length > 0);
  const { handleUndo, handleRedo } = useUndoRedo();

  return (
    <div
      data-can-undo={canUndo}
      data-can-redo={canRedo}
      data-handlers={`${typeof handleUndo}-${typeof handleRedo}`}
    />
  );
}

/** Mirrors MapWorkspace's subscriptions in routes/index.tsx. */
function WorkspaceProbe() {
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const isReady = useMapDocumentReady();
  const { commands, undo, redo, getDocument } = useMapDocumentActions();

  return (
    <div
      data-floor={currentFloorId}
      data-selected={selectedDeviceId}
      data-edit={isEditMode}
      data-ready={isReady}
      data-handlers={`${typeof commands}-${typeof undo}-${typeof redo}-${typeof getDocument}`}
    />
  );
}

interface BenchTreeProps {
  stats: RenderStats;
  handles: BenchHandles;
}

function Subtree({
  id,
  stats,
  children,
}: {
  id: string;
  stats: RenderStats;
  children: ReactNode;
}) {
  return (
    <Profiler id={id} onRender={stats.onRender}>
      {children}
    </Profiler>
  );
}

export function BenchTree({ stats, handles }: BenchTreeProps) {
  return (
    <Profiler id="root" onRender={stats.onRender}>
      <ShortcutIntentProvider>
        <MapDocumentProvider floorId={BENCH_FLOOR_ID}>
          <ReactFlowProvider>
            <CanvasShellProbe handles={handles} stats={stats} />
            <Subtree id="toolbar" stats={stats}>
              <ToolbarProbe />
            </Subtree>
            <Subtree id="sidebar-history" stats={stats}>
              <SidebarHistoryProbe />
            </Subtree>
            <Subtree id="workspace" stats={stats}>
              <WorkspaceProbe />
            </Subtree>
            <Subtree id="status" stats={stats}>
              <MapDocumentStatus />
            </Subtree>
          </ReactFlowProvider>
        </MapDocumentProvider>
      </ShortcutIntentProvider>
    </Profiler>
  );
}

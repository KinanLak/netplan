import { Profiler, useEffect } from "react";
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
import { WallToolsLayer } from "@/canvas/components/WallToolsLayer";
import { useWallToolSession } from "@/walls/useWallToolSession";
import type { WallToolSession } from "@/walls/useWallToolSession";
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
  session: WallToolSession | null = null;
  commands: MapDocumentCommands | null = null;

  capture(session: WallToolSession, commands: MapDocumentCommands) {
    this.session = session;
    this.commands = commands;
  }
}

export const createBenchHandles = (): BenchHandles => new BenchHandles();

/** Mirrors FlowCanvas: document + commands + wall tool session + node sync. */
function CanvasProbe({ handles }: { handles: BenchHandles }) {
  const currentFloorId = useCurrentFloorId();
  const selectedDeviceId = useSelectedDeviceId();
  const isEditMode = useIsEditMode();
  const activeDrawTool = useActiveDrawTool();
  const selectDevice = useMapStore((s) => s.selectDevice);
  const setHoveredDevice = useMapStore((s) => s.setHoveredDevice);

  const { document } = useMapDocumentData();
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

  const wallToolSession = useWallToolSession();
  useEffect(() => {
    handles.capture(wallToolSession, commands);
  });

  return (
    <div data-nodes={nodes.length}>
      <WallToolsLayer
        session={wallToolSession}
        floorWalls={floorWalls}
        activeDrawTool={activeDrawTool}
        isEditMode={isEditMode && isReady}
        paneHoverFillColor="#000"
        paneHoverStrokeColor="#000"
      />
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
            <Subtree id="canvas" stats={stats}>
              <CanvasProbe handles={handles} />
            </Subtree>
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

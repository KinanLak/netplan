import {
  createContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import { useConvexConnectionState, useMutation, useQuery } from "convex/react";
import { applyOperation } from "@/map-engine/applyOperation";
import { buildInverseOperation } from "@/map-engine/buildInverseOperation";
import { materializeDocument } from "@/map-engine/materializeDocument";
import type { MapOperation } from "@/map-engine/types";
import {
  createObjectId,
  createOperationMeta,
  useIdentity,
} from "@/lib/identity";
import { rectanglesOverlap } from "@/lib/geometry";
import type {
  Device,
  DeviceDraft,
  DeviceId,
  FloorId,
  LinkDoc,
  LinkId,
  MapDocumentSnapshot,
  Position,
  RoomDraft,
  Size,
  WallCommandResult,
  WallDraft,
  WallId,
  WallPointerInput,
  WallSegment,
  WallStrokeInput,
} from "@/types/map";
import { useMapStore } from "@/store/useMapStore";
import {
  addLine,
  addRoom,
  eraseAtPointer,
  eraseStroke,
  previewEraseAtPointer,
} from "@/walls/engine";
import {
  getWallCollisionRect,
  wallCollidesWithDevices,
} from "@/walls/gridGeometry";
import { api } from "../../convex/_generated/api";
import {
  appendCappedHistory,
  dispatchUndoRedoEvent,
  removeHistoryEntriesForOperation,
  withOperationMeta,
} from "./history";
import type { SessionHistoryEntry } from "./history";
import { SequentialOutbox } from "./outbox";
import { reconcileEphemeralState } from "./reconcileEphemeralState";

export interface MapDocumentCommands {
  addDevice: (draft: DeviceDraft) => DeviceId | null;
  updateDevicePosition: (deviceId: DeviceId, position: Position) => void;
  deleteDevice: (deviceId: DeviceId) => void;
  createLink: (link: Omit<LinkDoc, "id">) => LinkId | null;
  deleteLink: (linkId: LinkId) => void;
  checkCollision: (
    floorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
  ) => boolean;
  addWallLine: (line: WallDraft) => WallCommandResult;
  addWallRoom: (room: RoomDraft) => WallCommandResult;
  eraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  eraseWallStroke: (input: WallStrokeInput) => WallCommandResult;
  previewEraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  beginHistoryGroup: () => void;
  endHistoryGroup: () => void;
}

export interface MapDocumentSession {
  floorId: FloorId | null;
  document: MapDocumentSnapshot;
  serverDocument: MapDocumentSnapshot;
  pendingOperations: ReadonlyArray<MapOperation>;
  isReady: boolean;
  isSaving: boolean;
  hasRejectedOperations: boolean;
  rejectedMessage: string | null;
  connectionState: "connecting" | "connected" | "disconnected";
  dispatch: (operation: MapOperation) => void;
  commands: MapDocumentCommands;
  undo: () => void;
  redo: () => void;
  dismissRejectedOperation: () => void;
  history: {
    undoStack: ReadonlyArray<SessionHistoryEntry>;
    redoStack: ReadonlyArray<SessionHistoryEntry>;
    canUndo: boolean;
    canRedo: boolean;
  };
}

interface MapDocumentProviderProps {
  floorId: FloorId | null;
  children: ReactNode;
}

export const MapDocumentContext = createContext<MapDocumentSession | null>(
  null,
);

const emptyDocument = (floorId: FloorId): MapDocumentSnapshot => ({
  floorId,
  devices: [],
  walls: [],
  links: [],
});

const NONE_FLOOR_ID = "floor:none" as FloorId;

const unchangedWallResult = (
  walls: Array<WallSegment>,
  reason: WallCommandResult["reason"],
): WallCommandResult => ({
  changed: false,
  nextWalls: walls,
  affectedKeys: [],
  reason,
});

const operationLabel = (operation: MapOperation): string => operation.kind;

interface PendingHistoryOperation {
  operation: MapOperation;
  sourceOpId: string;
}

export function MapDocumentProvider({
  floorId,
  children,
}: MapDocumentProviderProps) {
  const identity = useIdentity();
  const applyMutation = useMutation(api.mapOperations.apply);
  type ApplyMutationArgs = Parameters<typeof applyMutation>[0];
  const toServerOperation = (
    operation: MapOperation,
  ): ApplyMutationArgs["operation"] =>
    operation as ApplyMutationArgs["operation"];
  const convexConnectionState = useConvexConnectionState();
  const queriedDocumentRaw = useQuery(
    api.mapDocument.getFloorDocument,
    floorId ? { floorId } : "skip",
  );

  const [pendingOperations, setPendingOperations] = useState<
    Array<MapOperation>
  >([]);
  const [undoStack, setUndoStack] = useState<Array<SessionHistoryEntry>>([]);
  const [redoStack, setRedoStack] = useState<Array<SessionHistoryEntry>>([]);
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);

  const activeFloorId = floorId ?? NONE_FLOOR_ID;
  const queriedDocument = queriedDocumentRaw
    ? ({
        floorId: queriedDocumentRaw.floorId as FloorId,
        devices: queriedDocumentRaw.devices as Array<Device>,
        walls: queriedDocumentRaw.walls as Array<WallSegment>,
        links: queriedDocumentRaw.links as Array<LinkDoc>,
      } satisfies MapDocumentSnapshot)
    : undefined;
  const serverDocument = queriedDocument ?? emptyDocument(activeFloorId);
  const document = materializeDocument(serverDocument, pendingOperations);
  const isReady = Boolean(floorId && identity && queriedDocument !== undefined);

  const documentRef = useRef(document);
  const undoStackRef = useRef(undoStack);
  const redoStackRef = useRef(redoStack);
  const historyGroupRef = useRef<Array<PendingHistoryOperation> | null>(null);

  useLayoutEffect(() => {
    documentRef.current = document;
    undoStackRef.current = undoStack;
    redoStackRef.current = redoStack;
  });

  const [outbox] = useState(
    () =>
      new SequentialOutbox({
        send: (operation) =>
          applyMutation({ operation: toServerOperation(operation) }),
        onAck: (operation) => {
          setPendingOperations((current) =>
            current.filter((item) => item.meta.opId !== operation.meta.opId),
          );
        },
        onReject: (operation, error) => {
          setPendingOperations((current) =>
            current.filter((item) => item.meta.opId !== operation.meta.opId),
          );
          setUndoStack((current) => [
            ...removeHistoryEntriesForOperation(current, operation.meta.opId),
          ]);
          setRedoStack((current) => [
            ...removeHistoryEntriesForOperation(current, operation.meta.opId),
          ]);
          setRejectedMessage(error);
        },
        onNetworkFailure: (_operation, error) => {
          setRejectedMessage(error.message);
        },
      }),
  );

  const [previousFloorId, setPreviousFloorId] = useState(floorId);
  if (previousFloorId !== floorId) {
    setPreviousFloorId(floorId);
    setPendingOperations([]);
    setUndoStack([]);
    setRedoStack([]);
    setRejectedMessage(null);
    outbox.clear();
  }

  useEffect(() => {
    if (convexConnectionState.isWebSocketConnected) {
      outbox.retry();
    }
  }, [convexConnectionState.isWebSocketConnected, outbox]);

  useEffect(() => {
    const patch = reconcileEphemeralState(document, useMapStore.getState());
    if (patch) useMapStore.setState(patch);
  }, [document]);

  useEffect(() => {
    if (!rejectedMessage) return;
    const timeout = window.setTimeout(() => setRejectedMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [rejectedMessage]);

  const pushUndoOperation = (operation: MapOperation, sourceOpId: string) => {
    const group = historyGroupRef.current;
    if (group) {
      group.push({ operation, sourceOpId });
      return;
    }

    setUndoStack((current) => [
      ...appendCappedHistory(current, {
        label: operationLabel(operation),
        operation,
        sourceOpIds: [sourceOpId],
      }),
    ]);
    setRedoStack([]);
  };

  const recordHistory = (
    snapshotBefore: MapDocumentSnapshot,
    operation: MapOperation,
  ) => {
    const inverse = buildInverseOperation(snapshotBefore, operation);
    if (inverse) pushUndoOperation(inverse, operation.meta.opId);
  };

  const dispatchOperation = (
    operation: MapOperation,
    options: { recordHistory: boolean } = { recordHistory: true },
  ) => {
    const snapshotBefore = documentRef.current;
    if (options.recordHistory) recordHistory(snapshotBefore, operation);
    setPendingOperations((current) => [...current, operation]);
    outbox.enqueue(operation);
  };

  const freshMeta = () => {
    if (!identity) return null;
    return createOperationMeta(identity);
  };

  const dispatch = (operation: MapOperation) => {
    dispatchOperation(operation);
  };

  const addDevice = (draft: DeviceDraft): DeviceId | null => {
    if (!isReady || !identity) return null;
    const id = createObjectId("device", identity) as DeviceId;
    const meta = freshMeta();
    if (!meta) return null;
    const device: Device = { id, ...draft };
    dispatchOperation({ kind: "device.create", meta, device });
    return id;
  };

  const updateDevicePosition = (deviceId: DeviceId, position: Position) => {
    if (!isReady) return;
    const device = documentRef.current.devices.find(
      (item) => item.id === deviceId,
    );
    if (!device) return;
    if (device.position.x === position.x && device.position.y === position.y)
      return;
    const meta = freshMeta();
    if (!meta) return;
    dispatchOperation({
      kind: "device.patch",
      meta,
      deviceId,
      patch: { position },
    });
  };

  const deleteDevice = (deviceId: DeviceId) => {
    if (!isReady) return;
    if (!documentRef.current.devices.some((device) => device.id === deviceId))
      return;
    const meta = freshMeta();
    if (!meta) return;
    dispatchOperation({ kind: "device.delete", meta, deviceId });
  };

  const createLink = (linkWithoutId: Omit<LinkDoc, "id">): LinkId | null => {
    if (!isReady || !identity) return null;
    const id = createObjectId("link", identity) as LinkId;
    const meta = freshMeta();
    if (!meta) return null;
    dispatchOperation({
      kind: "link.create",
      meta,
      link: { id, ...linkWithoutId },
    });
    return id;
  };

  const deleteLink = (linkId: LinkId) => {
    if (!isReady) return;
    const meta = freshMeta();
    if (!meta) return;
    dispatchOperation({ kind: "link.delete", meta, linkId });
  };

  const checkCollision = (
    targetFloorId: FloorId,
    deviceId: DeviceId,
    position: Position,
    size: Size,
  ): boolean => {
    if (!isReady) return true;

    for (const other of documentRef.current.devices) {
      if (other.floorId !== targetFloorId) continue;
      if (other.id === deviceId) continue;
      if (rectanglesOverlap(position, size, other.position, other.size)) {
        return true;
      }
    }
    for (const wall of documentRef.current.walls) {
      if (wall.floorId !== targetFloorId) continue;
      const rect = getWallCollisionRect(wall);
      if (
        rectanglesOverlap(
          position,
          size,
          { x: rect.x, y: rect.y },
          { width: rect.width, height: rect.height },
        )
      ) {
        return true;
      }
    }
    return false;
  };

  const dispatchAddedWalls = (
    floorWallsBefore: Array<WallSegment>,
    nextWalls: Array<WallSegment>,
  ) => {
    const existingIds = new Set(floorWallsBefore.map((wall) => wall.id));
    const added = nextWalls.filter((wall) => !existingIds.has(wall.id));
    if (added.length === 0) return;
    const meta = freshMeta();
    if (!meta) return;
    dispatchOperation({ kind: "walls.add", meta, walls: added });
  };

  const dispatchDeletedWalls = (
    floorWallsBefore: Array<WallSegment>,
    nextWalls: Array<WallSegment>,
  ) => {
    const remainingIds = new Set(nextWalls.map((wall) => wall.id));
    const removed = floorWallsBefore.filter(
      (wall) => !remainingIds.has(wall.id),
    );
    if (removed.length === 0) return;
    const meta = freshMeta();
    if (!meta) return;
    dispatchOperation({
      kind: "walls.delete",
      meta,
      wallIds: removed.map((wall) => wall.id),
    });
  };

  const addWallLine = (line: WallDraft): WallCommandResult => {
    const floorWalls = documentRef.current.walls.filter(
      (wall) => wall.floorId === line.floorId,
    );
    if (!isReady || !identity)
      return unchangedWallResult(floorWalls, "invalid-line");
    const floorDevices = documentRef.current.devices.filter(
      (device) => device.floorId === line.floorId,
    );
    const result = addLine({
      walls: floorWalls,
      floorId: line.floorId,
      color: line.color,
      start: line.start,
      end: line.end,
      generateWallId: () => createObjectId("wall", identity) as WallId,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevices),
    });
    if (result.changed) dispatchAddedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const addWallRoom = (room: RoomDraft): WallCommandResult => {
    const floorWalls = documentRef.current.walls.filter(
      (wall) => wall.floorId === room.floorId,
    );
    if (!isReady || !identity)
      return unchangedWallResult(floorWalls, "invalid-room");
    const floorDevices = documentRef.current.devices.filter(
      (device) => device.floorId === room.floorId,
    );
    const result = addRoom({
      walls: floorWalls,
      floorId: room.floorId,
      color: room.color,
      start: room.start,
      end: room.end,
      generateWallId: () => createObjectId("wall", identity) as WallId,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevices),
    });
    if (result.changed) dispatchAddedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const eraseWallAtPointer = (input: WallPointerInput): WallCommandResult => {
    const floorWalls = documentRef.current.walls.filter(
      (wall) => wall.floorId === input.floorId,
    );
    if (!isReady) return unchangedWallResult(floorWalls, "no-wall-at-pointer");
    const result = eraseAtPointer({ walls: floorWalls, ...input });
    if (result.changed) dispatchDeletedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const eraseWallStrokeCommand = (
    input: WallStrokeInput,
  ): WallCommandResult => {
    const floorWalls = documentRef.current.walls.filter(
      (wall) => wall.floorId === input.floorId,
    );
    if (!isReady) return unchangedWallResult(floorWalls, "empty-stroke");
    const result = eraseStroke({ walls: floorWalls, ...input });
    if (result.changed) dispatchDeletedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const previewEraseWallAtPointer = (
    input: WallPointerInput,
  ): WallCommandResult => {
    const floorWalls = documentRef.current.walls.filter(
      (wall) => wall.floorId === input.floorId,
    );
    if (!isReady) return unchangedWallResult(floorWalls, "preview-miss");
    return previewEraseAtPointer({ walls: floorWalls, ...input });
  };

  const beginHistoryGroup = () => {
    if (historyGroupRef.current) return;
    historyGroupRef.current = [];
  };

  const endHistoryGroup = () => {
    const group = historyGroupRef.current;
    historyGroupRef.current = null;
    if (!group || group.length === 0) return;
    const operations = group.map((entry) => entry.operation);
    const operation: MapOperation =
      group.length === 1
        ? operations[0]
        : { kind: "batch", meta: operations[0].meta, operations };
    setUndoStack((current) => [
      ...appendCappedHistory(current, {
        label: operationLabel(operation),
        operation,
        sourceOpIds: group.map((entry) => entry.sourceOpId),
      }),
    ]);
    setRedoStack([]);
  };

  const runHistoryOperation = (
    entry: SessionHistoryEntry,
    type: "undo" | "redo",
  ) => {
    if (!identity) return;
    const snapshotBefore = documentRef.current;
    const operation = withOperationMeta(
      entry.operation,
      createOperationMeta(identity),
    );
    const preview = applyOperation(snapshotBefore, operation);
    if (!preview.applied) {
      setRejectedMessage(
        "Impossible d'annuler: l'element a ete modifie par un autre utilisateur.",
      );
      return;
    }
    const opposite = buildInverseOperation(snapshotBefore, operation);
    dispatchOperation(operation, { recordHistory: false });
    if (opposite) {
      const nextEntry = {
        label: operationLabel(opposite),
        operation: opposite,
        sourceOpIds: [operation.meta.opId],
      };
      if (type === "undo") {
        setRedoStack((current) => [...appendCappedHistory(current, nextEntry)]);
      } else {
        setUndoStack((current) => [...appendCappedHistory(current, nextEntry)]);
      }
    }
    dispatchUndoRedoEvent(type);
  };

  const undo = () => {
    const entry = undoStackRef.current.at(-1);
    if (!entry) return;
    setUndoStack((current) => current.slice(0, -1));
    runHistoryOperation(entry, "undo");
  };

  const redo = () => {
    const entry = redoStackRef.current.at(-1);
    if (!entry) return;
    setRedoStack((current) => current.slice(0, -1));
    runHistoryOperation(entry, "redo");
  };

  const dismissRejectedOperation = () => {
    setRejectedMessage(null);
  };

  const commands: MapDocumentCommands = {
    addDevice,
    updateDevicePosition,
    deleteDevice,
    createLink,
    deleteLink,
    checkCollision,
    addWallLine,
    addWallRoom,
    eraseWallAtPointer,
    eraseWallStroke: eraseWallStrokeCommand,
    previewEraseWallAtPointer,
    beginHistoryGroup,
    endHistoryGroup,
  };

  const connectionState = !convexConnectionState.hasEverConnected
    ? "connecting"
    : convexConnectionState.isWebSocketConnected
      ? "connected"
      : "disconnected";

  const value: MapDocumentSession = {
    floorId,
    document,
    serverDocument,
    pendingOperations,
    isReady,
    isSaving: pendingOperations.length > 0,
    hasRejectedOperations: rejectedMessage !== null,
    rejectedMessage,
    connectionState,
    dispatch,
    commands,
    undo,
    redo,
    dismissRejectedOperation,
    history: {
      undoStack,
      redoStack,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    },
  };

  return (
    <MapDocumentContext.Provider value={value}>
      {children}
    </MapDocumentContext.Provider>
  );
}

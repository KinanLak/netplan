import {
  createContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Dispatch, ReactNode, RefObject, SetStateAction } from "react";
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
import type { Identity } from "@/lib/identity";
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
  coalesceHistoryGroupOperations,
  dispatchUndoRedoEvent,
  removeHistoryEntriesForOperation,
  removePendingHistoryGroupOperation,
  withOperationMeta,
} from "./history";
import type { SessionHistoryEntry } from "./history";
import { SequentialOutbox } from "./outbox";
import type { OutboxState } from "./outbox";
import {
  appendPendingOperation,
  pruneAckedRevisionsInPlace,
  reconcileObservedOperationLogEntries,
  removeAckedPendingOperations,
  removeObservedOperationLogEntries,
} from "./pendingOperations";
import type {
  PendingOperationEntry,
  PendingOperationObservation,
} from "./pendingOperations";
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

/** Document data — changes when local edits or server updates land. */
export interface MapDocumentData {
  floorId: FloorId | null;
  document: MapDocumentSnapshot;
  serverDocument: MapDocumentSnapshot;
  pendingOperations: ReadonlyArray<MapOperation>;
}

/** Save/connection status — flickers with the outbox lifecycle. */
export interface MapDocumentSyncStatus {
  isSaving: boolean;
  isRetrying: boolean;
  hasBackgroundPendingOperations: boolean;
  hasRejectedOperations: boolean;
  rejectedMessage: string | null;
  connectionState: "connecting" | "connected" | "disconnected";
}

/** Per-floor undo/redo stacks — changes on every recorded edit. */
export interface MapDocumentHistoryState {
  undoStack: ReadonlyArray<SessionHistoryEntry>;
  redoStack: ReadonlyArray<SessionHistoryEntry>;
  canUndo: boolean;
  canRedo: boolean;
}

/** Imperative session API — stable for the provider's lifetime. */
export interface MapDocumentActions {
  dispatch: (operation: MapOperation) => void;
  commands: MapDocumentCommands;
  undo: () => void;
  redo: () => void;
  dismissRejectedOperation: () => void;
  /** Snapshot accessor for event handlers that must not subscribe to data. */
  getDocument: () => MapDocumentSnapshot;
}

interface MapDocumentProviderProps {
  floorId: FloorId | null;
  children: ReactNode;
}

export const MapDocumentDataContext = createContext<MapDocumentData | null>(
  null,
);
export const MapDocumentReadyContext = createContext<boolean | null>(null);
export const MapDocumentSyncStatusContext =
  createContext<MapDocumentSyncStatus | null>(null);
export const MapDocumentHistoryContext =
  createContext<MapDocumentHistoryState | null>(null);
export const MapDocumentActionsContext =
  createContext<MapDocumentActions | null>(null);

const emptyDocument = (floorId: FloorId): MapDocumentSnapshot => ({
  floorId,
  revision: 0,
  devices: [],
  walls: [],
  links: [],
});

const NONE_FLOOR_ID = "floor:none" as FloorId;
const MAX_OBSERVED_PENDING_OP_IDS = 100;
const EMPTY_OPERATIONS: ReadonlyArray<MapOperation> = [];

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

interface PendingHistoryGroup {
  snapshotBefore: MapDocumentSnapshot;
  entries: Array<PendingHistoryOperation>;
}

interface FloorHistoryState {
  undoStack: Array<SessionHistoryEntry>;
  redoStack: Array<SessionHistoryEntry>;
}

type HistoryByFloor = Record<string, FloorHistoryState>;

const EMPTY_FLOOR_HISTORY: FloorHistoryState = {
  undoStack: [],
  redoStack: [],
};

const operationFloorId = (
  operation: MapOperation,
  fallbackFloorId: FloorId,
): FloorId => {
  switch (operation.kind) {
    case "device.create":
      return operation.device.floorId;
    case "link.create":
      return operation.link.floorId;
    case "walls.add":
      return operation.walls[0]?.floorId ?? fallbackFloorId;
    case "batch": {
      if (operation.operations.length === 0) return fallbackFloorId;
      const first = operation.operations[0];
      if (first.kind === "device.create") return first.device.floorId;
      if (first.kind === "link.create") return first.link.floorId;
      if (first.kind === "walls.add")
        return first.walls[0]?.floorId ?? fallbackFloorId;
      return fallbackFloorId;
    }
    case "device.patch":
    case "device.delete":
    case "link.delete":
    case "walls.delete":
      return fallbackFloorId;
  }
};

const updateFloorHistory = (
  current: HistoryByFloor,
  floorId: FloorId,
  updater: (history: FloorHistoryState) => FloorHistoryState,
): HistoryByFloor => ({
  ...current,
  [floorId]: updater(current[floorId] ?? EMPTY_FLOOR_HISTORY),
});

const replaceGroupedPendingOperations = (
  current: ReadonlyArray<PendingOperationEntry>,
  sourceOpIds: ReadonlyArray<string>,
  operation: MapOperation,
  floorId: FloorId,
): Array<PendingOperationEntry> => {
  const sourceOpIdSet = new Set(sourceOpIds);
  const next: Array<PendingOperationEntry> = [];
  let inserted = false;

  for (const entry of current) {
    if (!sourceOpIdSet.has(entry.operation.meta.opId)) {
      next.push(entry);
      continue;
    }

    if (!inserted) {
      next.push({ operation, floorId });
      inserted = true;
    }
  }

  return inserted ? next : [...next, { operation, floorId }];
};

interface SessionActionDeps {
  identityRef: RefObject<Identity | null>;
  isReadyRef: RefObject<boolean>;
  activeFloorIdRef: RefObject<FloorId>;
  documentRef: RefObject<MapDocumentSnapshot>;
  undoStackRef: RefObject<ReadonlyArray<SessionHistoryEntry>>;
  redoStackRef: RefObject<ReadonlyArray<SessionHistoryEntry>>;
  historyGroupRef: RefObject<PendingHistoryGroup | null>;
  outboxRef: RefObject<SequentialOutbox | null>;
  setPendingEntries: Dispatch<
    SetStateAction<ReadonlyArray<PendingOperationEntry>>
  >;
  setHistoryByFloor: Dispatch<SetStateAction<HistoryByFloor>>;
  setRejectedMessage: Dispatch<SetStateAction<string | null>>;
}

/**
 * Builds the imperative session API once. Every closure reads the live
 * session through refs, so the resulting object identity never changes and
 * action consumers never re-render because of document or outbox churn.
 */
const createSessionActions = (deps: SessionActionDeps): MapDocumentActions => {
  const {
    identityRef,
    isReadyRef,
    activeFloorIdRef,
    documentRef,
    undoStackRef,
    redoStackRef,
    historyGroupRef,
    outboxRef,
    setPendingEntries,
    setHistoryByFloor,
    setRejectedMessage,
  } = deps;

  const freshMeta = () => {
    const identity = identityRef.current;
    if (!identity) return null;
    return createOperationMeta(identity);
  };

  const pushUndoOperation = (operation: MapOperation, sourceOpId: string) => {
    setHistoryByFloor((current) =>
      updateFloorHistory(current, activeFloorIdRef.current, (history) => ({
        undoStack: [
          ...appendCappedHistory(history.undoStack, {
            label: operationLabel(operation),
            operation,
            sourceOpIds: [sourceOpId],
          }),
        ],
        redoStack: [],
      })),
    );
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
    const historyGroup = options.recordHistory ? historyGroupRef.current : null;
    if (historyGroup) {
      historyGroup.entries.push({ operation, sourceOpId: operation.meta.opId });
    } else if (options.recordHistory) {
      recordHistory(snapshotBefore, operation);
    }
    const targetFloorId = operationFloorId(operation, activeFloorIdRef.current);
    setPendingEntries((current) =>
      appendPendingOperation(
        current,
        operation,
        targetFloorId,
        historyGroup !== null,
      ),
    );
    if (!historyGroup) outboxRef.current?.enqueue(operation);
  };

  const addDevice = (draft: DeviceDraft): DeviceId | null => {
    const identity = identityRef.current;
    if (!isReadyRef.current || !identity) return null;
    const id = createObjectId("device", identity) as DeviceId;
    const meta = freshMeta();
    if (!meta) return null;
    const device: Device = { id, ...draft };
    dispatchOperation({ kind: "device.create", meta, device });
    return id;
  };

  const updateDevicePosition = (deviceId: DeviceId, position: Position) => {
    if (!isReadyRef.current) return;
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
    if (!isReadyRef.current) return;
    if (!documentRef.current.devices.some((device) => device.id === deviceId))
      return;
    const meta = freshMeta();
    if (!meta) return;
    dispatchOperation({ kind: "device.delete", meta, deviceId });
  };

  const createLink = (linkWithoutId: Omit<LinkDoc, "id">): LinkId | null => {
    const identity = identityRef.current;
    if (!isReadyRef.current || !identity) return null;
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
    if (!isReadyRef.current) return;
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
    if (!isReadyRef.current) return true;

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

  const floorWallsOf = (floorId: FloorId): Array<WallSegment> =>
    documentRef.current.walls.filter((wall) => wall.floorId === floorId);

  const floorDevicesOf = (floorId: FloorId): Array<Device> =>
    documentRef.current.devices.filter((device) => device.floorId === floorId);

  const addWallLine = (line: WallDraft): WallCommandResult => {
    const identity = identityRef.current;
    const floorWalls = floorWallsOf(line.floorId);
    if (!isReadyRef.current || !identity)
      return unchangedWallResult(floorWalls, "invalid-line");
    const result = addLine({
      walls: floorWalls,
      floorId: line.floorId,
      color: line.color,
      start: line.start,
      end: line.end,
      generateWallId: () => createObjectId("wall", identity) as WallId,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevicesOf(line.floorId)),
    });
    if (result.changed) dispatchAddedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const addWallRoom = (room: RoomDraft): WallCommandResult => {
    const identity = identityRef.current;
    const floorWalls = floorWallsOf(room.floorId);
    if (!isReadyRef.current || !identity)
      return unchangedWallResult(floorWalls, "invalid-room");
    const result = addRoom({
      walls: floorWalls,
      floorId: room.floorId,
      color: room.color,
      start: room.start,
      end: room.end,
      generateWallId: () => createObjectId("wall", identity) as WallId,
      collidesWithBlock: (block) =>
        wallCollidesWithDevices(block, floorDevicesOf(room.floorId)),
    });
    if (result.changed) dispatchAddedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const eraseWallAtPointer = (input: WallPointerInput): WallCommandResult => {
    const floorWalls = floorWallsOf(input.floorId);
    if (!isReadyRef.current)
      return unchangedWallResult(floorWalls, "no-wall-at-pointer");
    const result = eraseAtPointer({ walls: floorWalls, ...input });
    if (result.changed) dispatchDeletedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const eraseWallStrokeCommand = (
    input: WallStrokeInput,
  ): WallCommandResult => {
    const floorWalls = floorWallsOf(input.floorId);
    if (!isReadyRef.current)
      return unchangedWallResult(floorWalls, "empty-stroke");
    const result = eraseStroke({ walls: floorWalls, ...input });
    if (result.changed) dispatchDeletedWalls(floorWalls, result.nextWalls);
    return result;
  };

  const previewEraseWallAtPointer = (
    input: WallPointerInput,
  ): WallCommandResult => {
    const floorWalls = floorWallsOf(input.floorId);
    if (!isReadyRef.current)
      return unchangedWallResult(floorWalls, "preview-miss");
    return previewEraseAtPointer({ walls: floorWalls, ...input });
  };

  const beginHistoryGroup = () => {
    if (historyGroupRef.current) return;
    historyGroupRef.current = {
      snapshotBefore: documentRef.current,
      entries: [],
    };
  };

  const endHistoryGroup = () => {
    const group = historyGroupRef.current;
    historyGroupRef.current = null;
    if (!group || group.entries.length === 0) return;
    const operation = coalesceHistoryGroupOperations(
      group.entries.map((entry) => entry.operation),
    );
    if (!operation) return;

    const sourceOpIds = group.entries.map((entry) => entry.sourceOpId);
    const targetFloorId = operationFloorId(operation, activeFloorIdRef.current);
    setPendingEntries((current) =>
      replaceGroupedPendingOperations(
        current,
        sourceOpIds,
        operation,
        targetFloorId,
      ),
    );
    recordHistory(group.snapshotBefore, operation);
    outboxRef.current?.enqueue(operation);
  };

  const runHistoryOperation = (
    entry: SessionHistoryEntry,
    type: "undo" | "redo",
  ) => {
    const identity = identityRef.current;
    if (!identity || !isReadyRef.current) return;
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
        setHistoryByFloor((current) =>
          updateFloorHistory(current, activeFloorIdRef.current, (history) => ({
            ...history,
            redoStack: [...appendCappedHistory(history.redoStack, nextEntry)],
          })),
        );
      } else {
        setHistoryByFloor((current) =>
          updateFloorHistory(current, activeFloorIdRef.current, (history) => ({
            ...history,
            undoStack: [...appendCappedHistory(history.undoStack, nextEntry)],
          })),
        );
      }
    }
    dispatchUndoRedoEvent(type);
  };

  const undo = () => {
    if (!isReadyRef.current) return;
    const entry = undoStackRef.current.at(-1);
    if (!entry) return;
    setHistoryByFloor((current) =>
      updateFloorHistory(current, activeFloorIdRef.current, (history) => ({
        ...history,
        undoStack: history.undoStack.slice(0, -1),
      })),
    );
    runHistoryOperation(entry, "undo");
  };

  const redo = () => {
    if (!isReadyRef.current) return;
    const entry = redoStackRef.current.at(-1);
    if (!entry) return;
    setHistoryByFloor((current) =>
      updateFloorHistory(current, activeFloorIdRef.current, (history) => ({
        ...history,
        redoStack: history.redoStack.slice(0, -1),
      })),
    );
    runHistoryOperation(entry, "redo");
  };

  return {
    dispatch: (operation) => dispatchOperation(operation),
    commands: {
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
    },
    undo,
    redo,
    dismissRejectedOperation: () => setRejectedMessage(null),
    getDocument: () => documentRef.current,
  };
};

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

  const [pendingEntries, setPendingEntries] = useState<
    ReadonlyArray<PendingOperationEntry>
  >([]);
  const [historyByFloor, setHistoryByFloor] = useState<HistoryByFloor>({});
  const [rejectedMessage, setRejectedMessage] = useState<string | null>(null);
  const [outboxState, setOutboxState] = useState<OutboxState>({
    pendingCount: 0,
    isFlushing: false,
    isRetrying: false,
    lastFailure: null,
    nextRetryAt: null,
  });

  const activeFloorId = floorId ?? NONE_FLOOR_ID;

  // Identity-stable derivations: consumers subscribe per-context, so every
  // object below must keep its identity as long as its inputs are unchanged.
  const queriedDocument = useMemo(
    () =>
      queriedDocumentRaw
        ? ({
            floorId: queriedDocumentRaw.floorId as FloorId,
            revision: queriedDocumentRaw.revision,
            devices: queriedDocumentRaw.devices as Array<Device>,
            walls: queriedDocumentRaw.walls as Array<WallSegment>,
            links: queriedDocumentRaw.links as Array<LinkDoc>,
          } satisfies MapDocumentSnapshot)
        : undefined,
    [queriedDocumentRaw],
  );
  const serverDocument = useMemo(
    () => queriedDocument ?? emptyDocument(activeFloorId),
    [queriedDocument, activeFloorId],
  );
  const pendingOperations = useMemo(() => {
    const operations = pendingEntries
      .filter((entry) => entry.floorId === activeFloorId)
      .map((entry) => entry.operation);
    return operations.length === 0 ? EMPTY_OPERATIONS : operations;
  }, [pendingEntries, activeFloorId]);
  const document = useMemo(
    () =>
      pendingOperations.length === 0
        ? serverDocument
        : materializeDocument(serverDocument, pendingOperations),
    [serverDocument, pendingOperations],
  );

  const isReady = Boolean(floorId && identity && queriedDocument !== undefined);
  const activeHistory = historyByFloor[activeFloorId] ?? EMPTY_FLOOR_HISTORY;
  const undoStack = activeHistory.undoStack;
  const redoStack = activeHistory.redoStack;
  const hasBackgroundPendingOperations = pendingEntries.some(
    (entry) => entry.floorId !== activeFloorId,
  );
  const observedPendingOpIds = useMemo(
    () =>
      pendingEntries
        .filter((entry) => !entry.deferred)
        .slice(0, MAX_OBSERVED_PENDING_OP_IDS)
        .map((entry) => entry.operation.meta.opId),
    [pendingEntries],
  );
  const observedPendingRaw = useQuery(
    api.mapOperations.observePending,
    observedPendingOpIds.length > 0 ? { opIds: observedPendingOpIds } : "skip",
  );
  const observedPending = observedPendingRaw as
    | Array<PendingOperationObservation>
    | undefined;

  const documentRef = useRef(document);
  const undoStackRef = useRef<ReadonlyArray<SessionHistoryEntry>>(undoStack);
  const redoStackRef = useRef<ReadonlyArray<SessionHistoryEntry>>(redoStack);
  const identityRef = useRef<Identity | null>(identity);
  const isReadyRef = useRef(isReady);
  const activeFloorIdRef = useRef(activeFloorId);
  const serverRevisionRef = useRef(serverDocument.revision);
  // Acks live in a ref: recording one must not re-render the tree. Removal is
  // triggered explicitly (onAck + revision effect) through setPendingEntries.
  const ackedRevisionsRef = useRef<Map<string, number>>(new Map());
  const historyGroupRef = useRef<PendingHistoryGroup | null>(null);
  const outboxRef = useRef<SequentialOutbox | null>(null);

  useLayoutEffect(() => {
    documentRef.current = document;
    undoStackRef.current = undoStack;
    redoStackRef.current = redoStack;
    identityRef.current = identity;
    isReadyRef.current = isReady;
    activeFloorIdRef.current = activeFloorId;
    serverRevisionRef.current = serverDocument.revision;
    pruneAckedRevisionsInPlace(ackedRevisionsRef.current, pendingEntries);
  });

  // The initializer only wires refs into event-handler closures; no ref is
  // read during render.
  // oxlint-disable-next-line
  const [actions] = useState(() =>
    createSessionActions({
      identityRef,
      isReadyRef,
      activeFloorIdRef,
      documentRef,
      undoStackRef,
      redoStackRef,
      historyGroupRef,
      outboxRef,
      setPendingEntries,
      setHistoryByFloor,
      setRejectedMessage,
    }),
  );

  useEffect(() => {
    const outbox = new SequentialOutbox({
      send: (operation) =>
        applyMutation({ operation: toServerOperation(operation) }),
      onAck: (operation, result) => {
        ackedRevisionsRef.current.set(
          operation.meta.opId,
          result.appliedRevision ?? 0,
        );
        // The document subscription may already be past the acked revision;
        // identity-preserving removal makes this a no-op render otherwise.
        setPendingEntries((current) =>
          removeAckedPendingOperations(
            current,
            activeFloorIdRef.current,
            serverRevisionRef.current,
            ackedRevisionsRef.current,
          ),
        );
      },
      onReject: (operation, error) => {
        setPendingEntries((current) =>
          current.filter(
            (entry) => entry.operation.meta.opId !== operation.meta.opId,
          ),
        );
        setHistoryByFloor((current) => {
          const next: HistoryByFloor = {};
          for (const [historyFloorId, history] of Object.entries(current)) {
            next[historyFloorId] = {
              undoStack: [
                ...removeHistoryEntriesForOperation(
                  history.undoStack,
                  operation.meta.opId,
                ),
              ],
              redoStack: [
                ...removeHistoryEntriesForOperation(
                  history.redoStack,
                  operation.meta.opId,
                ),
              ],
            };
          }
          return next;
        });
        const historyGroup = historyGroupRef.current;
        if (historyGroup) {
          historyGroup.entries = removePendingHistoryGroupOperation(
            historyGroup.entries,
            operation.meta.opId,
          );
        }
        setRejectedMessage(error);
      },
      onNetworkFailure: (_operation, error) => {
        setRejectedMessage(error.message);
      },
      onStateChange: setOutboxState,
    });
    outboxRef.current = outbox;
    return () => {
      outbox.dispose();
      if (outboxRef.current === outbox) outboxRef.current = null;
    };
  }, [applyMutation]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPendingEntries((current) =>
        removeAckedPendingOperations(
          current,
          activeFloorId,
          serverDocument.revision,
          ackedRevisionsRef.current,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [activeFloorId, serverDocument.revision]);

  useEffect(() => {
    if (!observedPending || observedPending.length === 0) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const reconciliation = reconcileObservedOperationLogEntries(
        pendingEntries,
        activeFloorId,
        observedPending,
      );
      const rejectedOpIds = new Set(reconciliation.rejectedOpIds);

      setPendingEntries((current) =>
        current === pendingEntries
          ? reconciliation.pendingEntries
          : removeObservedOperationLogEntries(
              current,
              activeFloorId,
              observedPending,
            ),
      );

      if (rejectedOpIds.size === 0) return;
      setHistoryByFloor((current) => {
        const next: HistoryByFloor = {};
        for (const [historyFloorId, history] of Object.entries(current)) {
          next[historyFloorId] = {
            undoStack: history.undoStack.filter((entry) =>
              entry.sourceOpIds.every((opId) => !rejectedOpIds.has(opId)),
            ),
            redoStack: history.redoStack.filter((entry) =>
              entry.sourceOpIds.every((opId) => !rejectedOpIds.has(opId)),
            ),
          };
        }
        return next;
      });
      const historyGroup = historyGroupRef.current;
      if (historyGroup) {
        historyGroup.entries = historyGroup.entries.filter(
          (entry) => !rejectedOpIds.has(entry.sourceOpId),
        );
      }
      if (reconciliation.rejectedMessage) {
        setRejectedMessage(reconciliation.rejectedMessage);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeFloorId, observedPending, pendingEntries]);

  useEffect(() => {
    if (convexConnectionState.isWebSocketConnected) {
      outboxRef.current?.retry();
    }
  }, [convexConnectionState.isWebSocketConnected]);

  useEffect(() => {
    const patch = reconcileEphemeralState(document, useMapStore.getState());
    if (patch) useMapStore.setState(patch);
  }, [document]);

  useEffect(() => {
    if (!rejectedMessage) return;
    const timeout = window.setTimeout(() => setRejectedMessage(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [rejectedMessage]);

  const connectionState = !convexConnectionState.hasEverConnected
    ? "connecting"
    : convexConnectionState.isWebSocketConnected
      ? "connected"
      : "disconnected";
  const isSaving = pendingEntries.length > 0 || outboxState.pendingCount > 0;

  const data = useMemo<MapDocumentData>(
    () => ({ floorId, document, serverDocument, pendingOperations }),
    [floorId, document, serverDocument, pendingOperations],
  );
  const syncStatus = useMemo<MapDocumentSyncStatus>(
    () => ({
      isSaving,
      isRetrying: outboxState.isRetrying,
      hasBackgroundPendingOperations,
      hasRejectedOperations: rejectedMessage !== null,
      rejectedMessage,
      connectionState,
    }),
    [
      isSaving,
      outboxState.isRetrying,
      hasBackgroundPendingOperations,
      rejectedMessage,
      connectionState,
    ],
  );
  const history = useMemo<MapDocumentHistoryState>(
    () => ({
      undoStack,
      redoStack,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
    }),
    [undoStack, redoStack],
  );

  return (
    <MapDocumentActionsContext.Provider value={actions}>
      <MapDocumentReadyContext.Provider value={isReady}>
        <MapDocumentSyncStatusContext.Provider value={syncStatus}>
          <MapDocumentHistoryContext.Provider value={history}>
            <MapDocumentDataContext.Provider value={data}>
              {children}
            </MapDocumentDataContext.Provider>
          </MapDocumentHistoryContext.Provider>
        </MapDocumentSyncStatusContext.Provider>
      </MapDocumentReadyContext.Provider>
    </MapDocumentActionsContext.Provider>
  );
}

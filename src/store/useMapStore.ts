import { create } from "zustand";
import { temporal } from "zundo";
import type { MapDocumentRepository } from "@/data/mapDocumentRepository";
import type {
  AddConnectionInput,
  AddDeviceInput,
  CheckDeviceCollisionInput,
  DeleteConnectionInput,
  DeleteDeviceInput,
  MapCommandResult,
  MoveDeviceInput,
} from "@/domain/map/types";
import type {
  MapDocument,
  WallCommandResult,
  WallPointerInput,
} from "@/types/map";
import { LocalStorageMapDocumentRepository } from "@/data/mapDocumentRepository";
import {
  addConnection,
  deleteConnection,
} from "@/domain/map/commands/connections";
import {
  addDevice,
  deleteDevice,
  moveDevice,
} from "@/domain/map/commands/devices";
import {
  addWallLine,
  addWallRoom,
  eraseWallAtPointer,
  eraseWallStroke,
} from "@/domain/map/commands/walls";
import { checkDeviceCollision } from "@/domain/map/invariants";
import { createMockMapDocument } from "@/mock/document";
import { previewEraseAtPointer } from "@/walls/engine";
import { useMapUiStore } from "@/store/useMapUiStore";

export interface MapStoreState {
  document: MapDocument;
  loadDocument: (document: MapDocument) => void;
  addDevice: (
    input: AddDeviceInput,
  ) => MapCommandResult<
    | "device-not-found"
    | "floor-not-found"
    | "collision"
    | "floor-mismatch"
    | "no-valid-position"
  >;
  updateDevicePosition: (
    input: MoveDeviceInput,
  ) => MapCommandResult<
    | "device-not-found"
    | "floor-not-found"
    | "collision"
    | "floor-mismatch"
    | "no-valid-position"
  >;
  deleteDevice: (
    input: DeleteDeviceInput,
  ) => MapCommandResult<
    | "device-not-found"
    | "floor-not-found"
    | "collision"
    | "floor-mismatch"
    | "no-valid-position"
  >;
  addConnection: (
    input: AddConnectionInput,
  ) => MapCommandResult<
    | "connection-not-found"
    | "device-not-found"
    | "port-not-found"
    | "same-endpoint"
    | "cross-floor"
    | "duplicate-connection"
  >;
  deleteConnection: (
    input: DeleteConnectionInput,
  ) => MapCommandResult<
    | "connection-not-found"
    | "device-not-found"
    | "port-not-found"
    | "same-endpoint"
    | "cross-floor"
    | "duplicate-connection"
  >;
  addWallLine: ReturnType<typeof createWallLineAction>;
  addWallRoom: ReturnType<typeof createWallRoomAction>;
  eraseWallAtPointer: ReturnType<typeof createEraseWallAtPointerAction>;
  eraseWallStroke: ReturnType<typeof createEraseWallStrokeAction>;
  previewEraseWallAtPointer: (input: WallPointerInput) => WallCommandResult;
  checkCollision: (input: CheckDeviceCollisionInput) => boolean;
}

type Snapshot = Pick<MapStoreState, "document">;

const defaultDocument = () => createMockMapDocument();

const defaultRepository = new LocalStorageMapDocumentRepository();
let activeRepository: MapDocumentRepository = defaultRepository;
let hasBootstrappedDocument = false;

const applyDocumentResult = <TFailureReason extends string>(
  result: MapCommandResult<TFailureReason>,
  setDocument: (document: MapDocument) => void,
) => {
  if (result.ok) {
    setDocument(result.document);
  }

  return result;
};

function createWallLineAction(
  getDocument: () => MapDocument,
  setDocument: (document: MapDocument) => void,
) {
  return (
    input: Parameters<typeof addWallLine>[1],
  ): ReturnType<typeof addWallLine> =>
    applyDocumentResult(addWallLine(getDocument(), input), setDocument);
}

function createWallRoomAction(
  getDocument: () => MapDocument,
  setDocument: (document: MapDocument) => void,
) {
  return (
    input: Parameters<typeof addWallRoom>[1],
  ): ReturnType<typeof addWallRoom> =>
    applyDocumentResult(addWallRoom(getDocument(), input), setDocument);
}

function createEraseWallAtPointerAction(
  getDocument: () => MapDocument,
  setDocument: (document: MapDocument) => void,
) {
  return (
    input: Parameters<typeof eraseWallAtPointer>[1],
  ): ReturnType<typeof eraseWallAtPointer> =>
    applyDocumentResult(eraseWallAtPointer(getDocument(), input), setDocument);
}

function createEraseWallStrokeAction(
  getDocument: () => MapDocument,
  setDocument: (document: MapDocument) => void,
) {
  return (
    input: Parameters<typeof eraseWallStroke>[1],
  ): ReturnType<typeof eraseWallStroke> =>
    applyDocumentResult(eraseWallStroke(getDocument(), input), setDocument);
}

export const useMapStore = create<MapStoreState>()(
  temporal(
    (set, get) => {
      const setDocument = (document: MapDocument) => {
        set({ document });
      };
      const getDocument = () => get().document;

      return {
        document: defaultDocument(),

        loadDocument: (document) => {
          set({ document });
        },

        addDevice: (input) =>
          applyDocumentResult(addDevice(getDocument(), input), setDocument),

        updateDevicePosition: (input) =>
          applyDocumentResult(moveDevice(getDocument(), input), setDocument),

        deleteDevice: (input) => {
          const result = applyDocumentResult(
            deleteDevice(getDocument(), input),
            setDocument,
          );

          if (result.ok) {
            const uiState = useMapUiStore.getState();
            uiState.selectDevice(null);
            uiState.setHoveredDevice(null);
            uiState.setHighlightedDevices([]);
          }

          return result;
        },

        addConnection: (input) =>
          applyDocumentResult(addConnection(getDocument(), input), setDocument),

        deleteConnection: (input) =>
          applyDocumentResult(
            deleteConnection(getDocument(), input),
            setDocument,
          ),

        addWallLine: createWallLineAction(getDocument, setDocument),

        addWallRoom: createWallRoomAction(getDocument, setDocument),

        eraseWallAtPointer: createEraseWallAtPointerAction(
          getDocument,
          setDocument,
        ),

        eraseWallStroke: createEraseWallStrokeAction(getDocument, setDocument),

        previewEraseWallAtPointer: (input) => {
          const { walls } = getDocument();
          return previewEraseAtPointer({
            walls,
            floorId: input.floorId,
            pointer: input.pointer,
            snappedPoint: input.snappedPoint,
          });
        },

        checkCollision: (input) => checkDeviceCollision(getDocument(), input),
      };
    },
    {
      partialize: (state): Snapshot => ({ document: state.document }),
      equality: (previousState, currentState) =>
        previousState.document === currentState.document,
      limit: 100,
    },
  ),
);

useMapStore.subscribe((state, previousState) => {
  if (state.document === previousState.document) {
    return;
  }

  useMapUiStore.getState().syncWithDocument(state.document);

  if (!hasBootstrappedDocument) {
    return;
  }

  void activeRepository.save(state.document);
});

export async function rehydrateMapStore(
  repository: MapDocumentRepository = activeRepository,
) {
  activeRepository = repository;
  const document = await activeRepository.load();

  useMapStore.getState().loadDocument(document);
  useMapStore.temporal.getState().clear();
  useMapUiStore.getState().resetForDocument(document);
  hasBootstrappedDocument = true;
}

export function resetMapStoresForTests(
  document: MapDocument = defaultDocument(),
  repository: MapDocumentRepository = defaultRepository,
) {
  activeRepository = repository;
  hasBootstrappedDocument = false;
  useMapStore.setState({ document });
  useMapStore.temporal.getState().clear();
  useMapUiStore.getState().resetForDocument(document);
}

import type { MapDocument } from "@/types/map";
import { createMockMapDocument } from "@/mock/document";
import { assertNoDanglingConnectionRefs } from "@/domain/map/invariants";

export interface MapDocumentRepository {
  load: () => Promise<MapDocument>;
  save: (document: MapDocument) => Promise<void>;
}

const DEFAULT_STORAGE_KEY = "netplan-map-document-v1";

const isMapDocument = (value: unknown): value is MapDocument => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<MapDocument>;
  return (
    Array.isArray(candidate.buildings) &&
    Array.isArray(candidate.devices) &&
    Array.isArray(candidate.walls) &&
    Array.isArray(candidate.connections)
  );
};

export class LocalStorageMapDocumentRepository implements MapDocumentRepository {
  constructor(private readonly storageKey = DEFAULT_STORAGE_KEY) {}

  load(): Promise<MapDocument> {
    if (typeof window === "undefined") {
      return Promise.resolve(createMockMapDocument());
    }

    const rawDocument = window.localStorage.getItem(this.storageKey);
    if (!rawDocument) {
      return Promise.resolve(createMockMapDocument());
    }

    try {
      const parsedDocument = JSON.parse(rawDocument) as unknown;
      if (!isMapDocument(parsedDocument)) {
        return Promise.resolve(createMockMapDocument());
      }

      assertNoDanglingConnectionRefs(parsedDocument);
      return Promise.resolve(parsedDocument);
    } catch {
      return Promise.resolve(createMockMapDocument());
    }
  }

  save(document: MapDocument): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.resolve();
    }

    window.localStorage.setItem(this.storageKey, JSON.stringify(document));
    return Promise.resolve();
  }
}

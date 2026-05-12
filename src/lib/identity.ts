import { useState } from "react";
import type {
  ClientId,
  ObjectId,
  ObjectKind,
  OperationMeta,
  OperationId,
  SessionId,
} from "@/types/map";
import { identityAdjectives } from "./identity-adjectives";
import { identityAnimals } from "./identity-animals";

const STORAGE_KEY = "netplan-identity";

export interface LocalIdentity {
  clientId: ClientId;
  sessionId: SessionId;
  nextObjectCounter: number;
  nextOperationCounter: number;
  displayName: string;
  colorHue: number;
}

export type Identity = LocalIdentity;

const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const randomToken = (prefix: string): string => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi.randomUUID === "function") {
    return `${prefix}:${cryptoApi.randomUUID()}`;
  }

  if (typeof cryptoApi.getRandomValues === "function") {
    const values = new Uint32Array(4);
    cryptoApi.getRandomValues(values);
    return `${prefix}:${Array.from(values, (value) => value.toString(36)).join("")}`;
  }

  throw new Error("Secure random identity generation is unavailable");
};

const generateClientId = (): ClientId => randomToken("client") as ClientId;
const generateSessionId = (): SessionId => randomToken("session") as SessionId;

const pickFrom = <T>(items: ReadonlyArray<T>, seed: number): T => {
  if (items.length === 0) throw new Error("pickFrom: empty items");
  return items[seed % items.length];
};

const buildDisplayName = (clientId: ClientId): string => {
  const seed = hashString(clientId);
  const adjective = pickFrom(identityAdjectives, seed);
  const animal = pickFrom(identityAnimals, Math.floor(seed / 17));
  return `${adjective} ${animal}`;
};

const buildIdentity = (clientId = generateClientId()): LocalIdentity => ({
  clientId,
  sessionId: generateSessionId(),
  nextObjectCounter: 0,
  nextOperationCounter: 0,
  displayName: buildDisplayName(clientId),
  colorHue: hashString(clientId) % 360,
});

const isNonNegativeInteger = (value: number): boolean =>
  Number.isInteger(value) && value >= 0;

const isLocalIdentity = (value: object | null): value is LocalIdentity => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LocalIdentity>;
  return (
    typeof candidate.clientId === "string" &&
    typeof candidate.sessionId === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.colorHue === "number" &&
    isNonNegativeInteger(candidate.nextObjectCounter ?? -1) &&
    isNonNegativeInteger(candidate.nextOperationCounter ?? -1)
  );
};

const persistIdentity = (identity: LocalIdentity) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
};

export const loadOrCreateIdentity = (): LocalIdentity => {
  if (typeof window === "undefined") {
    return buildIdentity();
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        isLocalIdentity(parsed)
      ) {
        return parsed;
      }
    } catch {
      // fall through to fresh identity
    }
  }

  const identity = buildIdentity();
  persistIdentity(identity);
  return identity;
};

const objectIdForKind = (
  kind: ObjectKind,
  clientId: ClientId,
  counter: number,
): ObjectId => `${kind}:${clientId}:${counter}` as ObjectId;

export function createObjectId(
  kind: ObjectKind,
  identity: LocalIdentity,
): ObjectId {
  const id = objectIdForKind(
    kind,
    identity.clientId,
    identity.nextObjectCounter,
  );
  identity.nextObjectCounter += 1;
  persistIdentity(identity);
  return id;
}

export function createOperationMeta(identity: LocalIdentity): OperationMeta {
  const clientSeq = identity.nextOperationCounter;
  const opId = `op:${identity.clientId}:${clientSeq}` as OperationId;
  identity.nextOperationCounter += 1;
  persistIdentity(identity);
  return {
    opId,
    clientId: identity.clientId,
    clientSeq,
    createdAt: Date.now(),
  };
}

export const colorForHue = (
  hue: number,
  role: "fill" | "stroke" | "label",
): string => {
  switch (role) {
    case "fill":
      return `hsl(${hue} 70% 55%)`;
    case "stroke":
      return `hsl(${hue} 65% 35%)`;
    case "label":
      return `hsl(${hue} 80% 25%)`;
  }
};

export const useIdentity = (): LocalIdentity | null => {
  const [identity] = useState<LocalIdentity | null>(() => {
    if (typeof window === "undefined") return null;
    return loadOrCreateIdentity();
  });
  return identity;
};

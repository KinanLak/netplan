import type {
  ClientId,
  ObjectId,
  ObjectKind,
  OperationMeta,
  OperationId,
} from "@/types/map";

/**
 * This page load's random id and the counters it names new objects and
 * operations with. Who the user is comes from the session, not from here
 * (ADR 0021).
 */
export interface LocalIdentity {
  clientId: ClientId;
  nextObjectCounter: number;
  nextOperationCounter: number;
}

// `randomUUID` exists only in secure contexts, and a self-hosted install may
// be served over plain HTTP on the LAN.
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

/** An id for an object created outside a map session, such as from the inventory. */
export const createStandaloneObjectId = (kind: ObjectKind): ObjectId =>
  randomToken(kind) as ObjectId;

export const createLocalIdentity = (): LocalIdentity => ({
  clientId: randomToken("client") as ClientId,
  nextObjectCounter: 0,
  nextOperationCounter: 0,
});

export function createObjectId(
  kind: ObjectKind,
  identity: LocalIdentity,
): ObjectId {
  const id =
    `${kind}:${identity.clientId}:${identity.nextObjectCounter}` as ObjectId;
  identity.nextObjectCounter += 1;
  return id;
}

export function createOperationMeta(identity: LocalIdentity): OperationMeta {
  const clientSeq = identity.nextOperationCounter;
  const opId = `op:${identity.clientId}:${clientSeq}` as OperationId;
  identity.nextOperationCounter += 1;
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

let pageIdentity: LocalIdentity | null = null;

/**
 * The page's identity, shared by the map and presence so a page publishes
 * under the id its operations carry. `null` while rendering on the server.
 */
export const useIdentity = (): LocalIdentity | null => {
  if (typeof window === "undefined") return null;
  pageIdentity ??= createLocalIdentity();
  return pageIdentity;
};

import { useState } from "react";
import { identityAdjectives } from "./identity-adjectives";
import { identityAnimals } from "./identity-animals";

const STORAGE_KEY = "netplan-identity";

export interface Identity {
  sessionId: string;
  displayName: string;
  colorHue: number;
}

const hashString = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

const generateSessionId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const pickFrom = <T>(items: ReadonlyArray<T>, seed: number): T =>
  items[seed % items.length];

const buildDisplayName = (sessionId: string): string => {
  const seed = hashString(sessionId);
  const adjective = pickFrom(identityAdjectives, seed);
  const animal = pickFrom(identityAnimals, Math.floor(seed / 17));
  return `${adjective} ${animal}`;
};

const buildIdentity = (sessionId: string): Identity => ({
  sessionId,
  displayName: buildDisplayName(sessionId),
  colorHue: hashString(sessionId) % 360,
});

const isIdentity = (value: unknown): value is Identity => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionId === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.colorHue === "number"
  );
};

export const loadOrCreateIdentity = (): Identity => {
  if (typeof window === "undefined") {
    return buildIdentity(generateSessionId());
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isIdentity(parsed)) return parsed;
    } catch {
      // fall through to fresh identity
    }
  }

  const identity = buildIdentity(generateSessionId());
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  return identity;
};

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

export const useIdentity = (): Identity | null => {
  const [identity] = useState<Identity | null>(() => {
    if (typeof window === "undefined") return null;
    return loadOrCreateIdentity();
  });
  return identity;
};

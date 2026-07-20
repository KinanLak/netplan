export interface SwitchFreshnessBounds {
  externalId: string;
  triggerStartedAt: number;
  discoveryCompletedAt: number;
  serverObservedAt: number;
}

export type FdbFreshnessReason =
  | "fresh"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "before_trigger"
  | "after_discovery"
  | "future_server_time";

export interface FdbFreshnessResult {
  fresh: boolean;
  observedAt?: number;
  reason: FdbFreshnessReason;
}

export interface FdbIdentityRow {
  deviceId: string | number;
  portId: number;
  macAddress: string;
  updatedAt: string;
}

export const parseExplicitOffsetTimestamp = (
  value: string,
): number | undefined => {
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const classifyFdbTimestamp = (
  sourceObservedAt: string | undefined,
  bounds: SwitchFreshnessBounds,
): FdbFreshnessResult => {
  if (!sourceObservedAt) {
    return { fresh: false, reason: "missing_timestamp" };
  }
  const observedAt = parseExplicitOffsetTimestamp(sourceObservedAt);
  if (observedAt === undefined) {
    return { fresh: false, reason: "invalid_timestamp" };
  }
  if (observedAt < bounds.triggerStartedAt) {
    return { fresh: false, observedAt, reason: "before_trigger" };
  }
  if (observedAt > bounds.discoveryCompletedAt + 60_000) {
    return { fresh: false, observedAt, reason: "after_discovery" };
  }
  if (observedAt > bounds.serverObservedAt) {
    return { fresh: false, observedAt, reason: "future_server_time" };
  }
  return { fresh: true, observedAt, reason: "fresh" };
};

export const normalizedFdbIdentitySet = (
  rows: ReadonlyArray<FdbIdentityRow>,
): Array<string> | undefined => {
  const identities = new Set<string>();
  for (const row of rows) {
    const deviceId = Number(row.deviceId);
    const macAddress = row.macAddress.toUpperCase().replace(/[^0-9A-F]/g, "");
    const updatedAt = parseExplicitOffsetTimestamp(row.updatedAt);
    if (
      !Number.isSafeInteger(deviceId) ||
      deviceId < 0 ||
      !Number.isSafeInteger(row.portId) ||
      row.portId < 0 ||
      macAddress.length !== 12 ||
      updatedAt === undefined
    ) {
      return undefined;
    }
    identities.add(`${deviceId}\0${row.portId}\0${macAddress}\0${updatedAt}`);
  }
  return [...identities].sort();
};

export const summarizeFdbFreshness = <
  T extends {
    deviceId: number;
    updatedAt?: string;
  },
>(
  rows: ReadonlyArray<T>,
  bounds: ReadonlyArray<SwitchFreshnessBounds>,
) => {
  const boundsByDevice = new Map(
    bounds.map((item) => [Number(item.externalId), item]),
  );
  const fresh: Array<T> = [];
  const reasons = new Map<FdbFreshnessReason, number>();
  for (const row of rows) {
    const bound = boundsByDevice.get(row.deviceId);
    const result = bound
      ? classifyFdbTimestamp(row.updatedAt, bound)
      : { fresh: false as const, reason: "invalid_timestamp" as const };
    reasons.set(result.reason, (reasons.get(result.reason) ?? 0) + 1);
    if (result.fresh) fresh.push(row);
  }
  return { fresh, reasons };
};

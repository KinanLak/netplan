import type { LibreNmsDeviceStatus } from "../convex/librenms";

interface DiscoveryClient {
  getDevice(deviceId: string): Promise<LibreNmsDeviceStatus>;
  triggerDiscovery(deviceId: string, cycleId: string): Promise<void>;
}

interface RefreshOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  onPoll?: () => Promise<void>;
}

export interface RefreshedDevice {
  deviceId: string;
  triggerStartedAt: number;
  previousLastDiscovered: string;
  lastDiscovered: string;
  lastDiscoveredTimetaken?: number;
  completedAt: number;
  serverObservedAt: number;
}

const defaultSleep = async (milliseconds: number): Promise<void> =>
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

const refreshDevice = async (
  client: DiscoveryClient,
  deviceId: string,
  cycleId: string,
  options: Required<
    Pick<RefreshOptions, "timeoutMs" | "pollIntervalMs" | "now" | "sleep">
  > &
    Pick<RefreshOptions, "onPoll">,
): Promise<RefreshedDevice> => {
  const baseline = await client.getDevice(deviceId);
  if (!baseline.lastDiscovered) {
    throw new Error(
      `Le switch LibreNMS ${deviceId} a déjà un discovery en cours`,
    );
  }
  const triggerStartedAt = options.now();
  await client.triggerDiscovery(deviceId, cycleId);
  const deadline = options.now() + options.timeoutMs;
  while (options.now() < deadline) {
    await options.sleep(options.pollIntervalMs);
    await options.onPoll?.();
    let current: LibreNmsDeviceStatus;
    try {
      current = await client.getDevice(deviceId);
    } catch {
      continue;
    }
    if (
      current.lastDiscovered &&
      current.lastDiscovered !== baseline.lastDiscovered
    ) {
      return {
        deviceId,
        triggerStartedAt,
        previousLastDiscovered: baseline.lastDiscovered,
        lastDiscovered: current.lastDiscovered,
        lastDiscoveredTimetaken: current.lastDiscoveredTimetaken,
        completedAt: options.now(),
        serverObservedAt: current.serverObservedAt,
      };
    }
  }
  throw new Error(
    `Le discovery LibreNMS ${deviceId} est incertain après le timeout`,
  );
};

export const refreshLibreNmsDevices = async (
  client: DiscoveryClient,
  deviceIds: ReadonlyArray<string>,
  cycleId: string,
  options: RefreshOptions = {},
): Promise<Array<RefreshedDevice>> => {
  const resolvedOptions = {
    timeoutMs: options.timeoutMs ?? 2 * 60 * 1000,
    pollIntervalMs: options.pollIntervalMs ?? 4_000,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? defaultSleep,
    onPoll: options.onPoll,
  };
  return await Promise.all(
    deviceIds.map((deviceId) =>
      refreshDevice(client, deviceId, cycleId, resolvedOptions),
    ),
  );
};

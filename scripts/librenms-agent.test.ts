import { describe, expect, it } from "bun:test";
import type { LibreNmsDeviceStatus } from "../convex/librenms";
import { refreshLibreNmsDevices } from "./librenms-agent";

const device = (
  deviceId: string,
  lastDiscovered?: string,
  serverObservedAt = 0,
): LibreNmsDeviceStatus => ({
  deviceId: Number(deviceId),
  lastDiscovered,
  lastDiscoveredTimetaken: lastDiscovered === "new" ? 42 : undefined,
  serverObservedAt,
});

describe("one-shot LibreNMS agent", () => {
  it("triggers switches in parallel and waits for both generations", async () => {
    let now = 0;
    const triggered: Array<string> = [];
    const reads = new Map<string, number>();
    const client = {
      getDevice: (deviceId: string) => {
        const read = (reads.get(deviceId) ?? 0) + 1;
        reads.set(deviceId, read);
        const lastDiscovered =
          read === 1 ? "old" : read === 2 ? undefined : "new";
        return Promise.resolve(
          device(deviceId, lastDiscovered, lastDiscovered === "new" ? 123 : 0),
        );
      },
      triggerDiscovery: (deviceId: string) => {
        triggered.push(deviceId);
        return Promise.resolve();
      },
    };

    const result = await refreshLibreNmsDevices(client, ["4", "5"], "cycle", {
      timeoutMs: 10,
      pollIntervalMs: 1,
      now: () => now,
      sleep: (milliseconds) => {
        now += milliseconds;
        return Promise.resolve();
      },
    });

    expect(triggered.sort()).toEqual(["4", "5"]);
    expect(result.map((item) => item.lastDiscovered)).toEqual(["new", "new"]);
    expect(result.map((item) => item.serverObservedAt)).toEqual([123, 123]);
  });

  it("never triggers a switch whose discovery is already active", async () => {
    let triggered = false;
    await expect(
      refreshLibreNmsDevices(
        {
          getDevice: () => Promise.resolve(device("4")),
          triggerDiscovery: () => {
            triggered = true;
            return Promise.resolve();
          },
        },
        ["4"],
        "cycle",
      ),
    ).rejects.toThrow("déjà un discovery");
    expect(triggered).toBe(false);
  });

  it("does not retrigger after an uncertain timeout", async () => {
    let now = 0;
    let triggers = 0;
    await expect(
      refreshLibreNmsDevices(
        {
          getDevice: () => Promise.resolve(device("4", "old")),
          triggerDiscovery: () => {
            triggers += 1;
            return Promise.resolve();
          },
        },
        ["4"],
        "cycle",
        {
          timeoutMs: 2,
          pollIntervalMs: 1,
          now: () => now,
          sleep: (milliseconds) => {
            now += milliseconds;
            return Promise.resolve();
          },
        },
      ),
    ).rejects.toThrow("incertain");
    expect(triggers).toBe(1);
  });
});

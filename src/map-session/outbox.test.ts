import { describe, expect, it } from "bun:test";
import type { DeviceId, FloorId } from "@/types/map";
import type { MapOperation } from "@/map-engine/types";
import { SequentialOutbox } from "./outbox";
import type { OutboxApplyResult } from "./outbox";

const floorId = "floor:a" as FloorId;

const operation = (seq: number): MapOperation => ({
  kind: "device.create",
  meta: {
    opId: `op:test:${seq}` as MapOperation["meta"]["opId"],
    clientId: "client:test" as MapOperation["meta"]["clientId"],
    clientSeq: seq,
    createdAt: seq,
  },
  device: {
    id: `device:${seq}` as DeviceId,
    floorId,
    type: "pc",
    name: `Device ${seq}`,
    position: { x: seq * 100, y: 0 },
    size: { width: 80, height: 80 },
    metadata: {},
  },
});

const tick = () =>
  new Promise<void>((resolve) => queueMicrotask(() => resolve()));

describe("SequentialOutbox", () => {
  it("flushes operations sequentially in dispatch order", async () => {
    const sent: Array<string> = [];
    const acked: Array<string> = [];
    const outbox = new SequentialOutbox({
      send: (item) => {
        sent.push(item.meta.opId);
        return Promise.resolve({ status: "applied", opId: item.meta.opId });
      },
      onAck: (item) => acked.push(item.meta.opId),
      onReject: () => {},
      onNetworkFailure: () => {},
    });

    outbox.enqueue(operation(1));
    outbox.enqueue(operation(2));
    await tick();
    await tick();

    expect(sent).toEqual(["op:test:1", "op:test:2"]);
    expect(acked).toEqual(sent);
  });

  it("keeps an operation pending on network failure and retries same opId", async () => {
    const sent: Array<string> = [];
    let shouldFail = true;
    const outbox = new SequentialOutbox({
      send: (item) => {
        sent.push(item.meta.opId);
        if (shouldFail) return Promise.reject(new Error("offline"));
        return Promise.resolve({ status: "applied", opId: item.meta.opId });
      },
      onAck: () => {},
      onReject: () => {},
      onNetworkFailure: () => {},
    });

    outbox.enqueue(operation(1));
    await tick();
    expect(outbox.length).toBe(1);

    shouldFail = false;
    outbox.retry();
    await tick();

    expect(sent).toEqual(["op:test:1", "op:test:1"]);
    expect(outbox.length).toBe(0);
  });

  it("removes rejected operations and reports the rejection", async () => {
    let rejected = "";
    const outbox = new SequentialOutbox({
      send: (item) =>
        Promise.resolve({
          status: "rejected",
          opId: item.meta.opId,
          error: "collision",
        }),
      onAck: () => {},
      onReject: (_item, error) => {
        rejected = error;
      },
      onNetworkFailure: () => {},
    });

    outbox.enqueue(operation(1));
    await tick();

    expect(rejected).toBe("collision");
    expect(outbox.length).toBe(0);
  });

  it("ignores stale in-flight sends after clear without dropping new operations", async () => {
    const sends: Array<{
      operation: MapOperation;
      resolve: (result: OutboxApplyResult) => void;
    }> = [];
    const acked: Array<string> = [];
    const outbox = new SequentialOutbox({
      send: (item) =>
        new Promise<OutboxApplyResult>((resolve) => {
          sends.push({ operation: item, resolve });
        }),
      onAck: (item) => acked.push(item.meta.opId),
      onReject: () => {},
      onNetworkFailure: () => {},
    });
    const first = operation(1);
    const second = operation(2);

    outbox.enqueue(first);
    await tick();
    expect(sends.map((send) => send.operation.meta.opId)).toEqual([
      first.meta.opId,
    ]);

    outbox.clear();
    outbox.enqueue(second);
    await tick();
    expect(sends.map((send) => send.operation.meta.opId)).toEqual([
      first.meta.opId,
      second.meta.opId,
    ]);

    sends[0]?.resolve({ status: "applied", opId: first.meta.opId });
    await tick();
    await tick();
    expect(acked).toEqual([]);
    expect(outbox.length).toBe(1);

    sends[1]?.resolve({ status: "applied", opId: second.meta.opId });
    await tick();
    await tick();
    expect(acked).toEqual([second.meta.opId]);
    expect(outbox.length).toBe(0);
  });
});

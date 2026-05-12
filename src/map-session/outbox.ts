import type { MapOperation } from "@/map-engine/types";

export interface OutboxApplyResult {
  status: "applied" | "rejected";
  opId: string;
  error?: string;
}

export interface SequentialOutboxOptions {
  send: (operation: MapOperation) => Promise<OutboxApplyResult>;
  onAck: (operation: MapOperation) => void;
  onReject: (operation: MapOperation, error: string) => void;
  onNetworkFailure: (operation: MapOperation, error: Error) => void;
}

export class SequentialOutbox {
  private readonly queue: Array<MapOperation> = [];
  private flushing = false;
  private generation = 0;
  private readonly options: SequentialOutboxOptions;

  constructor(options: SequentialOutboxOptions) {
    this.options = options;
  }

  enqueue(operation: MapOperation) {
    if (this.queue.some((item) => item.meta.opId === operation.meta.opId)) {
      return;
    }
    this.queue.push(operation);
    void this.flush();
  }

  retry() {
    void this.flush();
  }

  clear() {
    this.queue.length = 0;
    this.generation += 1;
    this.flushing = false;
  }

  get length() {
    return this.queue.length;
  }

  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    const generation = this.generation;

    try {
      while (this.queue.length > 0) {
        const operation = this.queue[0];
        try {
          const result = await this.options.send(operation);
          if (generation !== this.generation) return;
          if (result.status === "rejected") {
            this.queue.shift();
            this.options.onReject(
              operation,
              result.error ?? "Operation rejected by server",
            );
            continue;
          }
          this.queue.shift();
          this.options.onAck(operation);
        } catch (error) {
          if (generation !== this.generation) return;
          this.options.onNetworkFailure(
            operation,
            error instanceof Error ? error : new Error(String(error)),
          );
          break;
        }
      }
    } finally {
      if (generation === this.generation) this.flushing = false;
    }
  }
}

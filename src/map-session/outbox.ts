import type { MapOperation } from "@/map-engine/types";
import { failureMessage } from "@/lib/errors";
import { isForbidden } from "@/lib/login";

export interface OutboxApplyResult {
  status: "applied" | "rejected";
  opId: string;
  appliedRevision?: number;
  floorId?: string;
  error?: string;
  /** Cables an undone deletion could not lay again. */
  droppedCables?: number;
}

/** The rejection an operation gets when the user's role cannot edit. */
export const FORBIDDEN_REJECTION = "forbidden";

export interface OutboxState {
  pendingCount: number;
}

export interface SequentialOutboxOptions {
  send: (operation: MapOperation) => Promise<OutboxApplyResult>;
  onAck: (operation: MapOperation, result: OutboxApplyResult) => void;
  onReject: (operation: MapOperation, error: string) => void;
  onStateChange?: (state: OutboxState) => void;
}

/**
 * Sends the map's operations one at a time, in the order they were made.
 *
 * Nothing is made without a connection (ADR 0034). An operation already
 * sent when the connection drops stays with Convex's client, which sends it
 * again on reconnection: the server confirms it, or refuses it and it rolls
 * back like any refusal. A function that fails rolls back too, with its
 * message, and so do the operations made after it, which built on it:
 * retrying would fail the same way.
 */
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
    this.emitState();
    void this.flush();
  }

  clear() {
    this.queue.length = 0;
    this.generation += 1;
    this.flushing = false;
    this.emitState();
  }

  dispose() {
    this.clear();
  }

  get length() {
    return this.queue.length;
  }

  get state(): OutboxState {
    return { pendingCount: this.queue.length };
  }

  private emitState() {
    this.options.onStateChange?.(this.state);
  }

  private async flush() {
    if (this.flushing) return;
    this.flushing = true;
    const generation = this.generation;

    try {
      while (this.queue.length > 0) {
        const operation = this.queue[0];
        let result: OutboxApplyResult;
        try {
          result = await this.options.send(operation);
        } catch (error) {
          if (generation !== this.generation) return;
          const message = isForbidden(error)
            ? FORBIDDEN_REJECTION
            : failureMessage(error, "editor");
          for (const failed of this.queue.splice(0)) {
            this.options.onReject(failed, message);
          }
          this.emitState();
          break;
        }
        if (generation !== this.generation) return;
        this.queue.shift();
        if (result.status === "rejected") {
          this.options.onReject(
            operation,
            result.error ?? "Le serveur a refusé la modification.",
          );
        } else {
          this.options.onAck(operation, result);
        }
        this.emitState();
      }
    } finally {
      if (generation === this.generation) this.flushing = false;
    }
  }
}

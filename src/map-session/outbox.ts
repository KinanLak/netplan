import type { MapOperation } from "@/map-engine/types";

export interface OutboxApplyResult {
  status: "applied" | "rejected";
  opId: string;
  appliedRevision?: number;
  floorId?: string;
  error?: string;
}

export interface OutboxState {
  pendingCount: number;
  isFlushing: boolean;
  isRetrying: boolean;
  lastFailure: string | null;
  nextRetryAt: number | null;
}

interface RetryOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => RetryTimer;
  clearTimeout?: (timeout: RetryTimer) => void;
}

type RetryTimer = number | ReturnType<typeof setTimeout>;

export interface SequentialOutboxOptions {
  send: (operation: MapOperation) => Promise<OutboxApplyResult>;
  onAck: (operation: MapOperation, result: OutboxApplyResult) => void;
  onReject: (operation: MapOperation, error: string) => void;
  onNetworkFailure: (operation: MapOperation, error: Error) => void;
  onStateChange?: (state: OutboxState) => void;
  retry?: RetryOptions;
}

export class SequentialOutbox {
  private readonly queue: Array<MapOperation> = [];
  private flushing = false;
  private generation = 0;
  private retryAttempts = 0;
  private retryTimer: RetryTimer | null = null;
  private lastFailure: string | null = null;
  private nextRetryAt: number | null = null;
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

  retry() {
    this.cancelRetryTimer();
    void this.flush();
  }

  clear() {
    this.queue.length = 0;
    this.generation += 1;
    this.flushing = false;
    this.retryAttempts = 0;
    this.lastFailure = null;
    this.cancelRetryTimer();
    this.emitState();
  }

  dispose() {
    this.clear();
  }

  get length() {
    return this.queue.length;
  }

  get state(): OutboxState {
    return {
      pendingCount: this.queue.length,
      isFlushing: this.flushing,
      isRetrying: this.retryTimer !== null,
      lastFailure: this.lastFailure,
      nextRetryAt: this.nextRetryAt,
    };
  }

  private emitState() {
    this.options.onStateChange?.(this.state);
  }

  private cancelRetryTimer() {
    if (!this.retryTimer) return;
    const clearTimeoutFn = this.options.retry?.clearTimeout ?? clearTimeout;
    clearTimeoutFn(this.retryTimer);
    this.retryTimer = null;
    this.nextRetryAt = null;
  }

  private scheduleRetry() {
    if (this.retryTimer || this.queue.length === 0) return;
    const retry = this.options.retry;
    const baseDelayMs = retry?.baseDelayMs ?? 750;
    const maxDelayMs = retry?.maxDelayMs ?? 10_000;
    const jitterRatio = retry?.jitterRatio ?? 0.3;
    const random = retry?.random ?? Math.random;
    const now = retry?.now ?? Date.now;
    const setTimeoutFn = retry?.setTimeout ?? setTimeout;
    const exponentialDelay = Math.min(
      maxDelayMs,
      baseDelayMs * 2 ** Math.max(0, this.retryAttempts - 1),
    );
    const jitter = exponentialDelay * jitterRatio * random();
    const delayMs = Math.round(exponentialDelay + jitter);
    this.nextRetryAt = now() + delayMs;
    this.retryTimer = setTimeoutFn(() => {
      this.retryTimer = null;
      this.nextRetryAt = null;
      this.emitState();
      void this.flush();
    }, delayMs);
    this.emitState();
  }

  private async flush() {
    if (this.flushing) return;
    this.cancelRetryTimer();
    this.flushing = true;
    const generation = this.generation;
    this.emitState();

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
            this.retryAttempts = 0;
            this.lastFailure = null;
            this.emitState();
            continue;
          }
          this.queue.shift();
          this.retryAttempts = 0;
          this.lastFailure = null;
          this.options.onAck(operation, result);
          this.emitState();
        } catch (error) {
          if (generation !== this.generation) return;
          this.retryAttempts += 1;
          this.lastFailure =
            error instanceof Error ? error.message : String(error);
          this.options.onNetworkFailure(
            operation,
            error instanceof Error ? error : new Error(String(error)),
          );
          this.scheduleRetry();
          break;
        }
      }
    } finally {
      if (generation === this.generation) {
        this.flushing = false;
        this.emitState();
      }
    }
  }
}

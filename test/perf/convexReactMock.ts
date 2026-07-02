import { useCallback, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

type QueryArgs = Record<string, unknown> | "skip";

export interface FakeMutationCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Deterministic in-memory stand-in for the Convex react client.
 * Query results are stored per function name and pushed to subscribers
 * exactly like a server-driven subscription update.
 */
export class FakeConvexBackend {
  private readonly results = new Map<string, unknown>();
  private readonly listeners = new Set<() => void>();
  readonly mutationCalls: Array<FakeMutationCall> = [];
  mutationImpl: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<unknown> = () => Promise.resolve({});

  setQueryResult(name: string, value: unknown) {
    this.results.set(name, value);
    for (const listener of [...this.listeners]) listener();
  }

  getQueryResult(name: string): unknown {
    return this.results.get(name);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

const CONNECTION_STATE = {
  hasEverConnected: true,
  isWebSocketConnected: true,
  isDeploymentOnline: true,
};

export const createConvexReactModuleMock = (backend: FakeConvexBackend) => {
  const useQuery = (query: unknown, args?: QueryArgs): unknown => {
    const name = getFunctionName(query as never);
    const skip = args === "skip";
    return useSyncExternalStore(backend.subscribe, () =>
      skip ? undefined : backend.getQueryResult(name),
    );
  };

  const useMutation = (mutation: unknown) => {
    const name = getFunctionName(mutation as never);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useCallback(
      (args: Record<string, unknown>) => {
        backend.mutationCalls.push({ name, args });
        return backend.mutationImpl(name, args);
      },
      [name],
    );
  };

  const useConvexConnectionState = () => CONNECTION_STATE;

  return { useQuery, useMutation, useConvexConnectionState };
};

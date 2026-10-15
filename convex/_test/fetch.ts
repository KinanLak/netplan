type Answer = Response | Error | (() => Response);

/**
 * Replaces the global `fetch` with one that gives `answers` in turn, the
 * last one again once they run out. The test DOM installs `fetch` as an
 * accessor, which `spyOn` cannot wrap.
 */
export function stubFetch(...answers: Array<Answer>) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  let next = 0;
  // Convex bundles this folder, so no `bun:test` mock here.
  const calls: Array<[string | URL | Request, RequestInit | undefined]> = [];
  const fake = (url: string | URL | Request, init?: RequestInit) => {
    calls.push([url, init]);
    const answer =
      answers.at(Math.min(next, answers.length - 1)) ??
      new Error("The test gave fetch no answer.");
    next += 1;
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(typeof answer === "function" ? answer() : answer);
  };
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fake,
  });
  return {
    calls,
    restore: () => {
      if (original) Object.defineProperty(globalThis, "fetch", original);
    },
  };
}

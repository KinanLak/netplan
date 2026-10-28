import { describe, expect, it } from "bun:test";
import { isConnectionError } from "@/components/error-screen";
import { BACKEND_UNREACHABLE } from "@/lib/health";

describe("isConnectionError", () => {
  it("recognises a fetch that never reached the app's server", () => {
    expect(isConnectionError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("recognises a page's code that failed to load, in each browser's words", () => {
    for (const message of [
      "Failed to fetch dynamically imported module: /assets/history.js",
      "error loading dynamically imported module: /assets/history.js",
      "Importing a module script failed.",
    ]) {
      expect(isConnectionError(new TypeError(message))).toBe(true);
    }
  });

  it("recognises the app's server saying Convex does not answer", () => {
    expect(isConnectionError(new Error(BACKEND_UNREACHABLE))).toBe(true);
  });

  it("leaves any other failure unexpected", () => {
    expect(isConnectionError(new Error("fetch failed"))).toBe(false);
    expect(isConnectionError(new TypeError("x is undefined"))).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";
import {
  BACKEND_UNREACHABLE,
  isConnectionError,
} from "@/components/error-screen";

describe("isConnectionError", () => {
  it("recognises a fetch that never reached the app's server", () => {
    expect(isConnectionError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("recognises the app's server saying Convex does not answer", () => {
    expect(isConnectionError(new Error(BACKEND_UNREACHABLE))).toBe(true);
  });

  it("leaves any other failure unexpected", () => {
    expect(isConnectionError(new Error("fetch failed"))).toBe(false);
    expect(isConnectionError(new TypeError("x is undefined"))).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";
import { readRuntimeConfig } from "@/lib/runtimeConfig";

const env = {
  CONVEX_URL: "https://convex.netplan.example",
  CONVEX_SITE_URL: "https://convex-site.netplan.example",
};

describe("readRuntimeConfig", () => {
  it("reads both Convex URLs", () => {
    expect(readRuntimeConfig(env)).toEqual({
      convexUrl: "https://convex.netplan.example",
      convexSiteUrl: "https://convex-site.netplan.example",
    });
  });

  it("drops trailing slashes and surrounding spaces", () => {
    expect(
      readRuntimeConfig({
        CONVEX_URL: " http://127.0.0.1:3210/ ",
        CONVEX_SITE_URL: "http://127.0.0.1:3211//",
      }),
    ).toEqual({
      convexUrl: "http://127.0.0.1:3210",
      convexSiteUrl: "http://127.0.0.1:3211",
    });
  });

  it("rejects a missing or blank variable by name", () => {
    expect(() => readRuntimeConfig({ ...env, CONVEX_URL: undefined })).toThrow(
      "CONVEX_URL is not set.",
    );
    expect(() => readRuntimeConfig({ ...env, CONVEX_SITE_URL: " " })).toThrow(
      "CONVEX_SITE_URL is not set.",
    );
  });

  it("ignores the build-time names", () => {
    expect(() =>
      readRuntimeConfig({
        VITE_CONVEX_URL: env.CONVEX_URL,
        VITE_CONVEX_SITE_URL: env.CONVEX_SITE_URL,
      }),
    ).toThrow("CONVEX_URL is not set.");
  });

  it("rejects values that are not http or https URLs", () => {
    expect(() =>
      readRuntimeConfig({ ...env, CONVEX_URL: "convex.netplan.example" }),
    ).toThrow("CONVEX_URL is not a valid URL.");
    expect(() =>
      readRuntimeConfig({ ...env, CONVEX_URL: "ws://convex.netplan.example" }),
    ).toThrow("CONVEX_URL must be an http or https URL.");
  });
});

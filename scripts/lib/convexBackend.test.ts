import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CONVEX_BACKEND_IMAGE, isLoopbackUrl } from "./convexBackend";

describe("isLoopbackUrl", () => {
  test("accepts this machine", () => {
    expect(isLoopbackUrl("http://127.0.0.1:13210")).toBe(true);
    expect(isLoopbackUrl("http://localhost:3210")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:3210")).toBe(true);
  });

  test("refuses anything else", () => {
    expect(isLoopbackUrl("https://happy-otter-123.convex.cloud")).toBe(false);
    expect(isLoopbackUrl("http://10.0.0.5:3210")).toBe(false);
    expect(isLoopbackUrl("http://127.0.0.1.example.com")).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});

test("CI runs the same backend image as dev:agent", async () => {
  const workflowPath = join(import.meta.dir, "../../.github/workflows");
  for (const file of ["ci.yml"]) {
    const workflow = await readFile(join(workflowPath, file), "utf8");
    const images = [
      ...workflow.matchAll(/image:\s*(ghcr\.io\/get-convex\/\S+)/g),
    ].map((match) => match[1]);
    expect(images.length).toBeGreaterThan(0);
    for (const image of images) expect(image).toBe(CONVEX_BACKEND_IMAGE);
  }
});

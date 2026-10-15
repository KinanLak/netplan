import { describe, expect, it } from "bun:test";
import {
  isGeneratedEnvFile,
  nextBackendPorts,
  nextWebPort,
  parseEnvLines,
  preferredPorts,
  publishedPort,
  renderEnvFile,
  resourceName,
} from "./devAgent";

describe("resourceName", () => {
  it("is readable, Docker-safe and stable for a path", () => {
    const name = resourceName("/home/me/.t3/worktrees/netplan/Feat_Walls.2");
    expect(name).toMatch(/^netplan-cvx-feat-walls-2-[0-9a-f]{6}$/);
    expect(resourceName("/home/me/.t3/worktrees/netplan/Feat_Walls.2")).toBe(
      name,
    );
  });

  it("differs for two worktrees with the same directory name", () => {
    expect(resourceName("/a/netplan")).not.toBe(resourceName("/b/netplan"));
  });
});

describe("ports", () => {
  it("starts each worktree in its ranges, with an even backend pair", () => {
    for (const path of ["/a", "/b/c", "/home/me/netplan"]) {
      const { backend, web } = preferredPorts(path);
      expect(backend).toBeGreaterThanOrEqual(13200);
      expect(backend + 1).toBeLessThan(14000);
      expect(backend % 2).toBe(0);
      expect(web).toBeGreaterThanOrEqual(3100);
      expect(web).toBeLessThan(4000);
    }
  });

  it("walks past taken ports and the port browsers refuse", () => {
    const taken = new Set([3657]);
    expect(nextWebPort(3657, (port) => !taken.has(port))).toBe(3658);
    expect(nextWebPort(3659, () => true)).toBe(3660);
  });

  it("moves the backend pair when either port is taken", () => {
    const taken = new Set([13401]);
    expect(nextBackendPorts(13400, (port) => !taken.has(port))).toBe(13402);
  });

  it("reads the published host port of a container port", () => {
    const bindings = {
      "3210/tcp": [{ HostIp: "127.0.0.1", HostPort: "13380" }],
      "3211/tcp": null,
    };
    expect(publishedPort(bindings, 3210)).toBe(13380);
    expect(publishedPort(bindings, 3211)).toBeUndefined();
    expect(publishedPort(null, 3210)).toBeUndefined();
  });
});

describe("env files", () => {
  it("recognises only files it wrote", () => {
    const text = renderEnvFile({ VITE_CONVEX_URL: "http://127.0.0.1:13380" });
    expect(isGeneratedEnvFile(text)).toBe(true);
    expect(isGeneratedEnvFile("VITE_CONVEX_URL=https://x.example\n")).toBe(
      false,
    );
    expect(parseEnvLines(text)).toEqual(
      new Map([["VITE_CONVEX_URL", "http://127.0.0.1:13380"]]),
    );
  });

  it("writes values a shell loads unchanged", async () => {
    const value = "local|0a1b2c"; // gitleaks:allow
    const file = `${process.env.TMPDIR ?? "/tmp"}/netplan-env-${Bun.hash(value)}`;
    await Bun.write(file, renderEnvFile({ KEY: value }));
    const shell = Bun.spawnSync([
      "sh",
      "-c",
      'set -a; . "$0"; set +a; printf %s "$KEY"',
      file,
    ]);
    await Bun.file(file).delete();
    expect(shell.stdout.toString()).toBe(value);
    expect(parseEnvLines(renderEnvFile({ KEY: value })).get("KEY")).toBe(value);
  });

  it("parses `convex env list` lines, keeping `=` inside values", () => {
    expect(parseEnvLines("ALLOW_DEV_SEED=true\nTOKEN=a=b\n\nnoise\n")).toEqual(
      new Map([
        ["ALLOW_DEV_SEED", "true"],
        ["TOKEN", "a=b"],
      ]),
    );
  });
});

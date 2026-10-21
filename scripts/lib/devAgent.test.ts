import { describe, expect, it } from "bun:test";
import {
  backendCommand,
  backendOf,
  integrationSeedArgs,
  isGeneratedEnvFile,
  mailName,
  nextBackendPorts,
  nextWebPort,
  parseEnvLines,
  portRelay,
  preferredPorts,
  publishedPort,
  renderEnvFile,
  browserUrl,
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

  it("ties the Mailpit container back to its backend", () => {
    const name = resourceName("/home/me/netplan");
    expect(mailName(name)).not.toBe(name);
    expect(backendOf(mailName(name))).toBe(name);
    expect(backendOf(name)).toBe(name);
  });
});

describe("browserUrl", () => {
  it("gives each worktree its own loopback name, so cookies do not mix", () => {
    const url = browserUrl("/w/netplan/UX_U5", "http://127.0.0.1:3109");
    expect(url).toMatch(/^http:\/\/ux-u5-[0-9a-f]{6}\.localhost:3109$/);
    expect(browserUrl("/other/UX_U5", "http://127.0.0.1:3109")).not.toBe(url);
  });
});

describe("ports", () => {
  it("starts each worktree in its ranges, with an even backend pair", () => {
    for (const path of ["/a", "/b/c", "/home/me/netplan"]) {
      const { backend, web, mail } = preferredPorts(path);
      expect(backend).toBeGreaterThanOrEqual(13200);
      expect(backend + 1).toBeLessThan(14000);
      expect(backend % 2).toBe(0);
      expect(web).toBeGreaterThanOrEqual(3100);
      expect(web).toBeLessThan(4000);
      expect(mail).toBeGreaterThanOrEqual(14000);
      expect(mail).toBeLessThan(14900);
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
    const text = renderEnvFile({ CONVEX_URL: "http://127.0.0.1:13380" });
    expect(isGeneratedEnvFile(text)).toBe(true);
    expect(isGeneratedEnvFile("CONVEX_URL=https://x.example\n")).toBe(false);
    expect(parseEnvLines(text)).toEqual(
      new Map([["CONVEX_URL", "http://127.0.0.1:13380"]]),
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

describe("integrationSeedArgs", () => {
  it("connects each tool whose address and token are both set", () => {
    expect(
      integrationSeedArgs({
        NETBOX_URL: " https://netbox.test ",
        NETBOX_TOKEN: "nb", // gitleaks:allow
        LIBRENMS_URL: "https://nms.test",
      }),
    ).toEqual({
      args: { netbox: { url: "https://netbox.test", token: "nb" } }, // gitleaks:allow
      missing: ["LIBRENMS_TOKEN"],
    });
  });
});

describe("the backend's port relay", () => {
  it("relays a connection from the published port to the backend's own", async () => {
    const backend = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data: (socket, data) => void socket.write(data) },
    });
    const free = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data: () => undefined },
    });
    const published = free.port;
    free.stop(true);
    const relay = Bun.spawn(
      [process.execPath, "-e", portRelay([[published, backend.port]])],
      { stdout: "ignore", stderr: "inherit" },
    );
    try {
      const echoed = Promise.withResolvers<string>();
      const connect = () =>
        Bun.connect({
          hostname: "127.0.0.1",
          port: published,
          socket: {
            open: (socket) => void socket.write("ping"),
            data: (_socket, data) => echoed.resolve(data.toString()),
          },
        });
      // The relay listens once its process has started.
      let client = await connect().catch(() => null);
      while (!client) client = await connect().catch(() => null);
      expect(await echoed.promise).toBe("ping");
      client.end();
    } finally {
      relay.kill();
      backend.stop(true);
    }
  });

  it("starts the image's own script after the relay", () => {
    const { entrypoint, args } = backendCommand(13806);
    expect(entrypoint).toBe("bash");
    expect(args[0]).toBe("-c");
    expect(args[1]).toEndWith("& exec ./run_backend.sh");
    expect(args[1]).toContain("[[13806,3210],[13807,3211]]");
    expect(
      args[1].slice("node -e '".length, -"' & exec ./run_backend.sh".length),
    ).not.toContain("'");
  });
});

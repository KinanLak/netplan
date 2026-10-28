import { describe, expect, it } from "bun:test";
import {
  createSessionTokens,
  readSessionToken,
  tokenAnswer,
} from "@/lib/session-token";
import type { TokenAnswer } from "@/lib/session-token";

const answers = (...queue: Array<TokenAnswer>) => {
  const asked: Array<number> = [];
  return {
    asked,
    requestToken: () => {
      asked.push(asked.length);
      const next = queue.shift();
      if (!next) throw new Error("asked once too often");
      return Promise.resolve(next);
    },
  };
};

const noWait = () => Promise.resolve();

describe("createSessionTokens", () => {
  it("hands Convex the page's token without asking the server", async () => {
    const server = answers();
    const tokens = createSessionTokens({
      initialToken: "from-ssr",
      ...server,
    });
    expect(tokens.signedIn).toBe(true);
    expect(await tokens.fetchAccessToken()).toBe("from-ssr");
    expect(server.asked).toHaveLength(0);
  });

  it("keeps asking while the server cannot be reached, then hands the token", async () => {
    const waits: Array<number> = [];
    const tokens = createSessionTokens({
      initialToken: "old",
      ...answers(
        { kind: "unreachable" },
        { kind: "unreachable" },
        { kind: "token", token: "fresh" },
      ),
      wait: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });
    expect(await tokens.fetchAccessToken({ forceRefreshToken: true })).toBe(
      "fresh",
    );
    expect(waits).toEqual([1_000, 2_000]);
    expect(await tokens.fetchAccessToken()).toBe("fresh");
  });

  it("answers null only once the server says the session is gone", async () => {
    const tokens = createSessionTokens({
      initialToken: "old",
      ...answers({ kind: "unreachable" }, { kind: "signedOut" }),
      wait: noWait,
    });
    expect(
      await tokens.fetchAccessToken({ forceRefreshToken: true }),
    ).toBeNull();
  });

  it("asks once for concurrent requests", async () => {
    const server = answers({ kind: "token", token: "fresh" });
    const tokens = createSessionTokens({ initialToken: null, ...server });
    expect(tokens.signedIn).toBe(false);
    const [first, second] = await Promise.all([
      tokens.fetchAccessToken({ forceRefreshToken: true }),
      tokens.fetchAccessToken(),
    ]);
    expect([first, second]).toEqual(["fresh", "fresh"]);
    expect(server.asked).toHaveLength(1);
  });
});

describe("tokenAnswer", () => {
  it("reads a token", () => {
    expect(tokenAnswer({ data: { token: "t" }, error: null })).toEqual({
      kind: "token",
      token: "t",
    });
  });

  it("reads a refused session as signed out", () => {
    expect(tokenAnswer({ data: null, error: { status: 401 } })).toEqual({
      kind: "signedOut",
    });
  });

  it("reads a server error, as when Convex is down behind it, as unreachable", () => {
    expect(tokenAnswer({ data: null, error: { status: 502 } })).toEqual({
      kind: "unreachable",
    });
    expect(tokenAnswer({ data: null, error: { status: 500 } })).toEqual({
      kind: "unreachable",
    });
  });
});

describe("readSessionToken", () => {
  const read = ({
    token,
    cookie,
    backendUp,
  }: {
    token: string | undefined;
    cookie: boolean;
    backendUp: boolean;
  }) =>
    readSessionToken({
      getToken: () => Promise.resolve(token),
      hasSessionCookie: () => Promise.resolve(cookie),
      backendAnswers: () => Promise.resolve(backendUp),
    });

  it("hands over the token", async () => {
    expect(await read({ token: "t", cookie: true, backendUp: true })).toBe("t");
  });

  it("reads a visitor without a session cookie as signed out", async () => {
    expect(
      await read({ token: undefined, cookie: false, backendUp: false }),
    ).toBeNull();
  });

  it("reads a session the backend refused as signed out", async () => {
    expect(
      await read({ token: undefined, cookie: true, backendUp: true }),
    ).toBeNull();
  });

  it("throws when a session cookie gets no token because the backend does not answer", async () => {
    await expect(
      read({ token: undefined, cookie: true, backendUp: false }),
    ).rejects.toThrow();
  });
});

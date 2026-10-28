import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import { components, internal } from "./_generated/api";
import type { TestBackend } from "./_test/auth.setup";
import { SITE, post, withMail, withMailRelay } from "./_test/mail.setup";

const PASSWORD = "first-password-1"; // gitleaks:allow
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

withMailRelay();

afterEach(() => {
  setSystemTime();
});

async function owner(t: TestBackend) {
  await t.action(internal.bootstrap.ensureFirstAdmin, {
    email: "owner@example.test",
    password: PASSWORD,
    name: "Owner",
  });
  return "owner@example.test";
}

const signIn = (t: TestBackend, email: string, password: string) =>
  post(t, "/sign-in/email", { email, password });

/** The token a sign-in returns, which the bearer plugin accepts. */
const sessionToken = async (response: Response) =>
  ((await response.json()) as { token: string }).token;

const getSession = (t: TestBackend, token: string) =>
  t.fetch("/api/auth/get-session", {
    headers: { authorization: `Bearer ${token}`, origin: SITE },
  });

async function onlySession(t: TestBackend) {
  const sessions = await t.run((ctx) =>
    ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "session",
      where: [],
      paginationOpts: { cursor: null, numItems: 10 },
    }),
  );
  expect(sessions.page).toHaveLength(1);
  return sessions.page[0] as {
    _id: string;
    createdAt: number;
    expiresAt: number;
  };
}

const MINUTE = 60 * 1000;

const retryAfter = async (response: Response) =>
  ((await response.json()) as { retryAfter?: number }).retryAfter;

describe("sign-in attempts", () => {
  it("wait from the fifth failure on, longer each time, for that identifier only", async () => {
    const t = withMail();
    const email = await owner(t);
    let now = Date.now();
    setSystemTime(now);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signIn(t, email, "wrong-password")).status).toBe(401);
    }
    // The right password does not get through during the wait, and the case
    // typed does not make another identifier.
    const refused = await signIn(t, email.toUpperCase(), PASSWORD);
    expect(refused.status).toBe(429);
    expect(await retryAfter(refused)).toBe(60);
    // Nobody else waits.
    expect((await signIn(t, "someone@example.test", PASSWORD)).status).toBe(
      401,
    );

    // Each further failure doubles the wait.
    now += MINUTE;
    setSystemTime(now);
    expect((await signIn(t, email, "wrong-password")).status).toBe(401);
    expect(await retryAfter(await signIn(t, email, PASSWORD))).toBe(120);
    now += 2 * MINUTE;
    setSystemTime(now);
    expect((await signIn(t, email, "wrong-password")).status).toBe(401);
    expect(await retryAfter(await signIn(t, email, PASSWORD))).toBe(240);

    // A success wipes the failures: the next mistake costs nothing.
    now += 4 * MINUTE;
    setSystemTime(now);
    expect((await signIn(t, email, PASSWORD)).status).toBe(200);
    expect((await signIn(t, email, "wrong-password")).status).toBe(401);
    expect((await signIn(t, email, PASSWORD)).status).toBe(200);
  });

  it("treat an identifier without an account like one with", async () => {
    const t = withMail();
    const email = await owner(t);
    setSystemTime(Date.now());
    const answers = async (identifier: string) => {
      const statuses: Array<number> = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        statuses.push((await signIn(t, identifier, "wrong-password")).status);
      }
      return statuses;
    };
    expect(await answers("nobody@example.test")).toEqual(await answers(email));
  });

  it("are forgotten after an hour left alone", async () => {
    const t = withMail();
    const email = await owner(t);
    const start = Date.now();
    setSystemTime(start);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signIn(t, email, "wrong-password");
    }
    setSystemTime(start + HOUR);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await signIn(t, email, "wrong-password")).status).toBe(401);
    }
    expect((await signIn(t, email, PASSWORD)).status).toBe(200);
  });
});

describe("password reset requests", () => {
  it("wait from the fifth for one address, known or not, and nobody else", async () => {
    const t = withMail();
    const email = await owner(t);
    setSystemTime(Date.now());
    const request = (address: string) =>
      post(t, "/request-password-reset", {
        email: address,
        redirectTo: "/reset-password",
      });
    for (const address of [email, "nobody@example.test"]) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect((await request(address)).status).toBe(200);
      }
      const refused = await request(address);
      expect(refused.status).toBe(429);
      expect(await retryAfter(refused)).toBe(60);
    }
    expect((await request("third@example.test")).status).toBe(200);
  });
});

describe("sessions", () => {
  it("last 24 hours from their last use, and 7 days from login at most", async () => {
    const t = withMail();
    const email = await owner(t);
    const login = Date.now();
    setSystemTime(login);
    const token = await sessionToken(await signIn(t, email, PASSWORD));
    expect((await onlySession(t)).expiresAt).toBe(login + DAY);

    // Used two hours later: 24 hours from then.
    setSystemTime(login + 2 * HOUR);
    expect((await getSession(t, token)).status).toBe(200);
    expect((await onlySession(t)).expiresAt).toBe(login + 2 * HOUR + DAY);

    // Kept alive for almost a week, it still ends a week after login.
    for (let use = 1; use <= 8; use += 1) {
      setSystemTime(login + 2 * HOUR + use * 20 * HOUR);
      expect((await getSession(t, token)).status).toBe(200);
    }
    expect((await onlySession(t)).expiresAt).toBe(login + 7 * DAY);

    setSystemTime(login + 7 * DAY + 1);
    expect(await (await getSession(t, token)).json()).toBeNull();
  });
});

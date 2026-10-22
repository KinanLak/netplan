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

describe("sign-in attempts", () => {
  it("refuses an identifier after five attempts in a minute, not the others", async () => {
    const t = withMail();
    const email = await owner(t);
    const start = Date.now();
    setSystemTime(start);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await signIn(t, email, "wrong-password")).status).toBe(401);
    }
    // The right password does not get through either, and the case typed
    // does not make another identifier.
    expect((await signIn(t, email.toUpperCase(), PASSWORD)).status).toBe(429);
    expect((await signIn(t, "someone@example.test", PASSWORD)).status).toBe(
      401,
    );

    setSystemTime(start + 61_000);
    expect((await signIn(t, email, PASSWORD)).status).toBe(200);
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

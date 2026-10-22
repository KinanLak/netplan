import { afterAll, beforeAll, beforeEach, mock } from "bun:test";
import { testBackend } from "./auth.setup";
import type { TestBackend } from "./auth.setup";

export const SITE = "http://netplan.test";

export interface SentMail {
  to: string;
  subject: string;
  text: string;
}

// The relay `mail.send` talks to: it records instead of connecting.
const sent: Array<SentMail> = [];
void mock.module("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: (mail: SentMail) => {
        sent.push(mail);
        return Promise.resolve({});
      },
      close: () => {},
    }),
  },
}));

const env = {
  SITE_URL: SITE,
  BETTER_AUTH_SECRET: "test-secret-for-better-auth-only-0123456789", // gitleaks:allow
  SMTP_HOST: "relay.test",
  SMTP_FROM: "NetPlan <netplan@example.test>",
};

/**
 * Sets the auth and relay environment for the calling test file and empties
 * the recorded mail before each test.
 */
export function withMailRelay() {
  const saved = { ...process.env };
  beforeAll(() => {
    Object.assign(process.env, env);
  });
  afterAll(() => {
    for (const key of Object.keys(env)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  beforeEach(() => {
    sent.length = 0;
  });
}

/** A backend that includes the `mail.send` Node action. */
export const withMail = () =>
  testBackend({ "./mail.ts": () => import("../mail") });

/** The mails the relay received once every scheduled send has run. */
export const outbox = async (t: TestBackend) => {
  // Real timers: this only yields until the scheduled sends have run.
  await t.finishAllScheduledFunctions(() => {});
  return sent;
};

/** A better-auth route, called the way the app's pages call it. */
export const post = (t: TestBackend, path: string, body: unknown) =>
  t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE },
    body: JSON.stringify(body),
  });

/** Follows a mailed reset or invitation link to the token it carries. */
export async function tokenFromLink(t: TestBackend, mail: SentMail) {
  const link = /https?:\/\/\S+/.exec(mail.text)?.[0] ?? "";
  if (!link.startsWith(`${SITE}/api/auth/reset-password/`)) {
    throw new Error(`not a reset link: ${link}`);
  }
  const landing = await t.fetch(link.slice(SITE.length), {
    redirect: "manual",
  });
  const page = new URL(landing.headers.get("location") ?? "");
  return { path: page.pathname, token: page.searchParams.get("token") };
}

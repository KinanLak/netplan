import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import authSchema from "../betterAuth/schema";
import { components } from "../_generated/api";
import schema from "../schema";
import { insertSite } from "../sites";
import type { Role } from "../lib/roles";
import { modules } from "./modules";

// The better-auth component's modules, listed for the same reason as
// `./modules`.
const authModules: Record<string, () => Promise<Record<string, unknown>>> = {
  "./betterAuth/_generated/api.ts": () =>
    import("../betterAuth/_generated/api.js"),
  "./betterAuth/adapter.ts": () => import("../betterAuth/adapter"),
  "./betterAuth/schema.ts": () => import("../betterAuth/schema"),
};

export type TestBackend = TestConvex<typeof schema>;

/**
 * A backend with the better-auth component and no signed-in caller; `extra`
 * adds modules `./modules` leaves out, such as Node actions.
 */
export function testBackend(
  extra: Record<string, () => Promise<Record<string, unknown>>> = {},
): TestBackend {
  const t = convexTest(schema, {
    ...modules,
    // Only `.test.ts` files import this one, so Convex never bundles it.
    "./sources.ts": () => import("../sources"),
    ...extra,
  });
  t.registerComponent("betterAuth", authSchema, authModules);
  return t;
}

let accounts = 0;

/**
 * Stores a user and a live session, the way a better-auth sign-in does, and
 * returns the identity Convex derives from its token.
 */
export async function createSignedInUser(
  t: TestBackend,
  role: Role,
  options: { banned?: boolean; expired?: boolean } = {},
) {
  accounts += 1;
  const now = Date.now();
  return await t.run(async (ctx) => {
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: {
          name: `Test ${role} ${accounts}`,
          email: `${role}-${accounts}@example.test`,
          emailVerified: true,
          role,
          banned: options.banned ?? false,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string; name: string };
    const session = (await ctx.runMutation(
      components.betterAuth.adapter.create,
      {
        input: {
          model: "session",
          data: {
            userId: user._id,
            token: `session-${accounts}`,
            expiresAt: options.expired ? now - 1 : now + 60_000,
            createdAt: now,
            updatedAt: now,
          },
        },
      },
    )) as { _id: string };
    return {
      userId: user._id,
      name: user.name,
      identity: { subject: user._id, sessionId: session._id },
    };
  });
}

/** A backend whose calls run as a signed-in user with `role`. */
export async function signedInTest(role: Role = "editor") {
  const t = testBackend();
  const { identity } = await createSignedInUser(t, role);
  return t.withIdentity(identity);
}

export type TestClient = Awaited<ReturnType<typeof signedInTest>>;

let sites = 0;

/** Creates a site directly, whatever the caller's role. */
export const createTestSite = (
  t: TestClient,
  site: { objectId?: string; name?: string } = {},
) => {
  sites += 1;
  const objectId = site.objectId ?? `site:test-${sites}`;
  const name = site.name ?? `Site ${sites}`;
  return t.run((ctx) =>
    insertSite(ctx, { objectId, name, timezone: "Europe/Paris" }),
  );
};

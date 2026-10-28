import type { PaginationResult } from "convex/server";
import { ConvexError, v } from "convex/values";
import { generateRandomString } from "better-auth/crypto";
import { components, internal } from "./_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { createAuth } from "./auth";
import { internalMutation } from "./_generated/server";
import { endSessions } from "./lib/sessions";
import { noteSignIn } from "./lib/signIns";
import {
  adminAction,
  adminMutation,
  adminQuery,
  readerQuery,
} from "./lib/functions";
import { invitationMail, testMail } from "./lib/mailTemplates";
import { ROLES, roleOf } from "./lib/roles";
import { ROLE_LABELS } from "../src/lib/roles";
import type { Role } from "./lib/roles";
import {
  accountKind,
  invitationError,
  mailFailure,
  normalizeUsername,
} from "./lib/userAccounts";
import type { AccountKind } from "./lib/userAccounts";

const INVITATION_SECONDS = 7 * 24 * 60 * 60;

const role = v.union(...ROLES.map((name) => v.literal(name)));

/** The signed-in user, as the app shows them. */
export const me = readerQuery({
  args: {},
  returns: v.object({
    id: v.string(),
    name: v.string(),
    role: v.string(),
    // A Keycloak account's role comes from the role mapping, so a page that
    // refuses it says to ask there.
    sso: v.boolean(),
  }),
  handler: async (ctx) => ({
    id: ctx.user.id,
    name: ctx.user.name,
    role: ctx.user.role,
    sso: (await kindOf(ctx, ctx.user.id)) === "sso",
  }),
});

type AuthDoc = { _id: string } & Record<string, unknown>;

async function findAll(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  model: "user" | "account" | "verification",
): Promise<Array<AuthDoc>> {
  const docs: Array<AuthDoc> = [];
  let cursor: string | null = null;
  for (;;) {
    const page: PaginationResult<AuthDoc> = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      { model, paginationOpts: { numItems: 200, cursor } },
    );
    docs.push(...page.page);
    if (page.isDone) return docs;
    cursor = page.continueCursor;
  }
}

async function findUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  where: { field: string; value: string },
): Promise<AuthDoc | null> {
  return (await ctx.runQuery(components.betterAuth.adapter.findOne, {
    model: "user",
    where: [where],
  })) as AuthDoc | null;
}

async function kindOf(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  userId: string,
): Promise<AccountKind> {
  const page = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [{ field: "userId", value: userId }],
    paginationOpts: { numItems: 10, cursor: null },
  });
  return accountKind(
    (page.page as Array<AuthDoc>).map((account) => String(account.providerId)),
  );
}

const userRow = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
  username: v.union(v.string(), v.null()),
  role,
  disabled: v.boolean(),
  kind: v.union(v.literal("local"), v.literal("sso"), v.literal("invited")),
  lastSignInAt: v.union(v.number(), v.null()),
  /** Invited only: when its latest link stops working; `null` without one. */
  invitationExpiresAt: v.union(v.number(), v.null()),
});

/** The identifier of a password link, which invitations reuse. */
const RESET_LINK = "reset-password:";

/**
 * Every account, for the users page. Who is online comes from
 * `presences.list` instead: it changes at every heartbeat.
 */
export const list = adminQuery({
  args: {},
  returns: v.array(userRow),
  handler: async (ctx) => {
    const providers = new Map<string, Array<string>>();
    for (const account of await findAll(ctx, "account")) {
      const userId = String(account.userId);
      providers.set(userId, [
        ...(providers.get(userId) ?? []),
        String(account.providerId),
      ]);
    }
    const now = Date.now();
    const links = new Map<string, number>();
    for (const row of await findAll(ctx, "verification")) {
      const expiresAt = Number(row.expiresAt);
      if (!String(row.identifier).startsWith(RESET_LINK) || expiresAt <= now) {
        continue;
      }
      const userId = String(row.value);
      links.set(userId, Math.max(links.get(userId) ?? 0, expiresAt));
    }
    const signIns = new Map(
      (await ctx.db.query("signIns").collect()).map((row) => [
        row.userId,
        row.at,
      ]),
    );
    return (
      (await findAll(ctx, "user"))
        .map((user) => ({
          id: user._id,
          name: String(user.name),
          email: String(user.email),
          username:
            typeof user.displayUsername === "string"
              ? user.displayUsername
              : typeof user.username === "string"
                ? user.username
                : null,
          role: roleOf(user.role),
          disabled: user.banned === true,
          kind: accountKind(providers.get(user._id) ?? []),
          lastSignInAt: signIns.get(user._id) ?? null,
          invitationExpiresAt: links.get(user._id) ?? null,
        }))
        // A forgotten-password link is not an invitation, and a disabled
        // invitation has nothing pending.
        .map((user) =>
          user.kind === "invited" && !user.disabled
            ? user
            : { ...user, invitationExpiresAt: null },
        )
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
    );
  },
});

async function existingUser(
  ctx: QueryCtx | MutationCtx | ActionCtx,
  userId: string,
): Promise<AuthDoc> {
  const user = await findUser(ctx, { field: "_id", value: userId });
  if (!user) throw new ConvexError("Ce compte n'existe plus.");
  return user;
}

/**
 * Sets a local account's role. A Keycloak account's role comes from the role
 * mapping at each login, so setting it here would be undone at the next one.
 */
export const setRole = adminMutation({
  args: { userId: v.string(), role },
  returns: v.null(),
  handler: async (ctx, { userId, role: next }) => {
    if (userId === ctx.user.id) {
      throw new ConvexError("Vous ne pouvez pas changer votre propre rôle.");
    }
    await existingUser(ctx, userId);
    if ((await kindOf(ctx, userId)) === "sso") {
      throw new ConvexError(
        "Le rôle d'un compte Keycloak suit la correspondance des rôles.",
      );
    }
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: userId }],
        update: { role: next, updatedAt: Date.now() },
      },
    });
    return null;
  },
});

/**
 * Disables an account (a better-auth ban) and ends its sessions, or enables
 * it again. Every Convex function already refuses a banned user; ending the
 * sessions also stops its token being renewed.
 */
export const setDisabled = adminMutation({
  args: { userId: v.string(), disabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { userId, disabled }) => {
    if (userId === ctx.user.id) {
      throw new ConvexError(
        "Vous ne pouvez pas désactiver votre propre compte.",
      );
    }
    await existingUser(ctx, userId);
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: userId }],
        update: {
          banned: disabled,
          banReason: null,
          banExpires: null,
          updatedAt: Date.now(),
        },
      },
    });
    if (disabled) await endSessions(ctx, userId);
    return null;
  },
});

/**
 * Ends every session of another account without disabling it (ADR 0036).
 * It signs in again at once if it can; a Keycloak account's role is read
 * again then. Answers how many sessions ended, never which.
 */
export const signOutEverywhere = adminMutation({
  args: { userId: v.string() },
  returns: v.number(),
  handler: async (ctx, { userId }) => {
    if (userId === ctx.user.id) {
      throw new ConvexError(
        "Pour votre propre compte, utilisez « Se déconnecter ».",
      );
    }
    await existingUser(ctx, userId);
    return await endSessions(ctx, userId);
  },
});

/**
 * Mails a seven-day link to the reset-password page, where the invited user
 * chooses a password (ADR 0021). The token is a better-auth reset token, so
 * the page and its checks are the forgotten-password ones. Waits for the
 * relay, so the admin learns at once when the mail did not leave.
 */
async function sendInvitation(
  ctx: ActionCtx,
  user: { id: string; name: string; email: string; role: Role },
  invitedBy: string,
  login: string,
) {
  const context = await createAuth(ctx).$context;
  const token = generateRandomString(32, "a-z", "A-Z", "0-9");
  const identifier = `${RESET_LINK}${token}`;
  await context.internalAdapter.createVerificationValue({
    identifier,
    value: user.id,
    expiresAt: new Date(Date.now() + INVITATION_SECONDS * 1000),
  });
  // `login` lets the page tell a password manager whose password it is, and
  // `invitation` lets it say « Bienvenue » rather than « mot de passe changé ».
  const landing = `/reset-password?${new URLSearchParams({ login: user.email, invitation: "1" }).toString()}`;
  const url = `${context.baseURL}/reset-password/${token}?callbackURL=${encodeURIComponent(landing)}`;
  try {
    await ctx.runAction(internal.mail.send, {
      to: user.email,
      ...invitationMail({
        name: user.name,
        invitedBy,
        url,
        role: ROLE_LABELS[user.role],
        login,
        // better-auth's base URL is the app's, plus its own mount point.
        appUrl: context.baseURL.replace(/\/api\/auth\/?$/, ""),
      }),
    });
  } catch (error) {
    // A link that never left would count as a pending invitation.
    await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        model: "verification",
        where: [{ field: "identifier", value: identifier }],
      },
      paginationOpts: { numItems: 10, cursor: null },
    });
    throw new ConvexError(
      `Le compte existe, mais l'invitation n'est pas partie : ${mailFailure(error)} Renvoyez-la une fois la messagerie réparée.`,
    );
  }
}

/** Creates a local account without a password and mails its invitation. */
export const invite = adminAction({
  args: {
    name: v.string(),
    email: v.string(),
    username: v.optional(v.string()),
    role,
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const username = args.username?.trim() ? args.username.trim() : undefined;
    const invalid = invitationError({ name, email, username });
    if (invalid) throw new ConvexError(invalid);
    if (await findUser(ctx, { field: "email", value: email })) {
      throw new ConvexError("Un compte utilise déjà cette adresse e-mail.");
    }
    if (
      username &&
      (await findUser(ctx, {
        field: "username",
        value: normalizeUsername(username),
      }))
    ) {
      throw new ConvexError("Cet identifiant est déjà pris.");
    }
    const { user } = await createAuth(ctx).api.createUser({
      body: {
        email,
        name,
        role: args.role satisfies Role,
        data: username
          ? { username: normalizeUsername(username), displayUsername: username }
          : {},
      },
    });
    await sendInvitation(
      ctx,
      { id: user.id, name, email, role: args.role },
      ctx.user.name,
      username ?? email,
    );
    return user.id;
  },
});

/** A new seven-day link for an invited user who has not chosen a password. */
export const resendInvitation = adminAction({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    const user = await existingUser(ctx, userId);
    if ((await kindOf(ctx, userId)) !== "invited") {
      throw new ConvexError("Ce compte a déjà choisi son mot de passe.");
    }
    if (user.banned === true) {
      throw new ConvexError(
        "Réactivez ce compte avant de renvoyer l'invitation.",
      );
    }
    const login =
      typeof user.displayUsername === "string"
        ? user.displayUsername
        : String(user.email);
    await sendInvitation(
      ctx,
      {
        id: user._id,
        name: String(user.name),
        email: String(user.email),
        role: roleOf(user.role),
      },
      ctx.user.name,
      login,
    );
    return null;
  },
});

/**
 * Deletes an account invited by mistake (C5). Only one that never chose a
 * password: it has signed in nowhere and done nothing anyone could miss. A
 * used account is disabled instead, so its name stays in the history.
 */
export const cancelInvitation = adminMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await existingUser(ctx, userId);
    if ((await kindOf(ctx, userId)) !== "invited") {
      throw new ConvexError("Ce compte a déjà servi : désactivez-le plutôt.");
    }
    for (const row of await findAll(ctx, "verification")) {
      if (String(row.value) !== userId) continue;
      await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: "verification",
          where: [{ field: "_id", value: row._id }],
        },
      });
    }
    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: { model: "user", where: [{ field: "_id", value: userId }] },
    });
    return null;
  },
});

export const recordSignIn = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await noteSignIn(ctx, userId);
    return null;
  },
});

/** Sends a test mail to the admin, to check the relay settings. */
export const sendTestMail = adminAction({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    try {
      await ctx.runAction(internal.mail.send, {
        to: ctx.user.email,
        ...testMail({ name: ctx.user.name }),
      });
    } catch (error) {
      throw new ConvexError(`L'e-mail n'est pas parti : ${mailFailure(error)}`);
    }
    return ctx.user.email;
  },
});

import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import {
  forgotPasswordErrorMessage,
  isEmail,
  isForbidden,
  isSessionLost,
  sessionLostReason,
  keycloakErrorMessage,
  loginErrorMessage,
  requestFailure,
  resetPasswordErrorMessage,
  safeRedirect,
} from "./login";

describe("safeRedirect", () => {
  it("keeps a path on this site", () => {
    expect(safeRedirect("/logo?x=1")).toBe("/logo?x=1");
  });

  it("drops anything that leaves the site", () => {
    for (const value of [
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "/\t/evil.test",
      "/\n/evil.test",
      "/a/..//evil.test",
      "javascript:alert(1)",
      42,
      undefined,
    ]) {
      expect(safeRedirect(value)).toBeUndefined();
    }
  });
});

describe("login", () => {
  it("signs in by email only when the identifier is one", () => {
    expect(isEmail("admin@netplan.test")).toBe(true);
    expect(isEmail("admin")).toBe(false);
  });

  it("does not say whether the account or the password was wrong", () => {
    expect(loginErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe(
      loginErrorMessage({ code: "INVALID_USERNAME_OR_PASSWORD" }),
    );
  });

  it("reads an identifier no account can have as a wrong one", () => {
    const wrong = loginErrorMessage({ code: "INVALID_USERNAME_OR_PASSWORD" });
    for (const code of [
      "INVALID_USERNAME",
      "USERNAME_TOO_SHORT",
      "USERNAME_TOO_LONG",
      "INVALID_EMAIL",
    ]) {
      expect(loginErrorMessage({ status: 422, code })).toBe(wrong);
    }
    expect(loginErrorMessage({ status: 0 })).toContain("Réessayez");
  });

  it("explains a disabled account and rate limiting", () => {
    expect(loginErrorMessage({ code: "BANNED_USER" })).toContain("désactivé");
    expect(loginErrorMessage({ status: 429 })).toContain("Trop de tentatives");
  });
});

describe("isSessionLost", () => {
  it("recognises the error a function throws without a session", () => {
    expect(isSessionLost(new ConvexError({ code: "unauthenticated" }))).toBe(
      true,
    );
  });

  it("leaves a refused edit and other failures alone", () => {
    expect(isSessionLost(new ConvexError({ code: "forbidden" }))).toBe(false);
    expect(isSessionLost(new ConvexError("unauthenticated"))).toBe(false);
    expect(isSessionLost(new Error("unauthenticated"))).toBe(false);
  });
});

describe("sessionLostReason", () => {
  it("reads a disabled account from the server's refusal", () => {
    expect(
      sessionLostReason(
        new ConvexError({ code: "unauthenticated", reason: "disabled" }),
      ),
    ).toBe("disabled");
  });

  it("reads anything else as an expired session", () => {
    expect(
      sessionLostReason(
        new ConvexError({ code: "unauthenticated", reason: "expired" }),
      ),
    ).toBe("expired");
    expect(
      sessionLostReason(new ConvexError({ code: "unauthenticated" })),
    ).toBe("expired");
    expect(sessionLostReason(new Error("unauthenticated"))).toBe("expired");
  });
});

describe("isForbidden", () => {
  it("recognises the error a function throws for a role too low", () => {
    expect(isForbidden(new ConvexError({ code: "forbidden" }))).toBe(true);
  });

  it("leaves a lost session and other failures alone", () => {
    expect(isForbidden(new ConvexError({ code: "unauthenticated" }))).toBe(
      false,
    );
    expect(isForbidden(new ConvexError("forbidden"))).toBe(false);
    expect(isForbidden(new Error("forbidden"))).toBe(false);
  });
});

describe("password reset messages", () => {
  it("tells a rate-limited user to wait rather than retry", () => {
    expect(forgotPasswordErrorMessage({ status: 429 })).toContain("Réessayez");
    expect(resetPasswordErrorMessage({ status: 429 })).toContain(
      "Réessayez dans",
    );
  });

  it("says what is wrong with a refused password", () => {
    expect(
      resetPasswordErrorMessage({ status: 400, code: "PASSWORD_TOO_SHORT" }),
    ).toContain("8 caractères");
    expect(
      resetPasswordErrorMessage({ status: 400, code: "PASSWORD_TOO_LONG" }),
    ).toContain("trop long");
  });
});

describe("requestFailure", () => {
  it("reads a dropped connection as a failure the form can show", async () => {
    const dropped = Promise.reject(new TypeError("Failed to fetch"));
    expect(await requestFailure(dropped)).toEqual({ status: 0 });
  });

  it("passes a refusal through and is null on success", async () => {
    const refusal = { status: 429, code: "TOO_MANY_REQUESTS" };
    expect(await requestFailure(Promise.resolve({ error: refusal }))).toBe(
      refusal,
    );
    expect(await requestFailure(Promise.resolve({ error: null }))).toBeNull();
  });
});

describe("keycloakErrorMessage", () => {
  it("says why Keycloak could not sign the user in", () => {
    expect(keycloakErrorMessage("account_not_linked")).toContain(
      "utilise déjà l'adresse e-mail",
    );
    expect(keycloakErrorMessage("BANNED_USER")).toBe(
      loginErrorMessage({ code: "BANNED_USER" }),
    );
    expect(keycloakErrorMessage("access_denied")).toContain("annulée");
    expect(keycloakErrorMessage("state_mismatch")).toContain("a échoué");
  });
});

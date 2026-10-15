import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import {
  forgotPasswordErrorMessage,
  isEmail,
  isForbidden,
  isSessionLost,
  loginErrorMessage,
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
      "quelques minutes",
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

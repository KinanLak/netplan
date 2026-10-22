import { describe, expect, it } from "bun:test";
import { NO_FILTER, describeUntil, matchesFilter } from "./users";
import type { ListedUser } from "./users";

const user = (more: Partial<ListedUser> = {}): ListedUser => ({
  name: "Éléonore Dupré",
  email: "eleonore@example.test",
  username: "edupre",
  role: "editor",
  disabled: false,
  kind: "local",
  ...more,
});

describe("matchesFilter", () => {
  it("finds a user by any word of the name, address or username, without accents", () => {
    expect(matchesFilter(user(), { ...NO_FILTER, search: "eleonore" })).toBe(
      true,
    );
    expect(matchesFilter(user(), { ...NO_FILTER, search: "dupre EDU" })).toBe(
      true,
    );
    expect(matchesFilter(user(), { ...NO_FILTER, search: "martin" })).toBe(
      false,
    );
  });

  it("filters by role and by status", () => {
    expect(matchesFilter(user(), { ...NO_FILTER, role: "admin" })).toBe(false);
    expect(
      matchesFilter(user({ kind: "invited" }), {
        ...NO_FILTER,
        status: "invited",
      }),
    ).toBe(true);
    // A disabled invitation counts as disabled, the state that blocks it.
    expect(
      matchesFilter(user({ kind: "invited", disabled: true }), {
        ...NO_FILTER,
        status: "invited",
      }),
    ).toBe(false);
  });
});

describe("relative times", () => {
  const now = Date.UTC(2026, 9, 21, 12);
  it("says how long is left", () => {
    expect(describeUntil(now + 6.9 * 86_400_000, now)).toBe("7 j");
    expect(describeUntil(now + 5 * 3_600_000, now)).toBe("5 h");
    expect(describeUntil(now + 10_000, now)).toBe("1 min");
  });
});

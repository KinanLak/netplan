import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import { adminErrorMessage } from "./errors";

describe("adminErrorMessage", () => {
  it("shows the server's reason, and nothing technical", () => {
    expect(
      adminErrorMessage(new ConvexError("Un site porte déjà ce nom.")),
    ).toBe("Un site porte déjà ce nom.");
    expect(adminErrorMessage(new ConvexError({ code: "forbidden" }))).toBe(
      "Action réservée aux administrateurs.",
    );
    expect(adminErrorMessage(new Error("[CONVEX M(sites:update)] boom"))).toBe(
      "La modification a échoué. Réessayez.",
    );
  });
});

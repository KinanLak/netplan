import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import { failureMessage } from "./errors";

describe("failureMessage", () => {
  it("shows the server's reason, the role refusal, and nothing technical", () => {
    expect(
      failureMessage(new ConvexError("Un site porte déjà ce nom."), "admin"),
    ).toBe("Un site porte déjà ce nom.");
    expect(
      failureMessage(new ConvexError({ code: "forbidden" }), "admin"),
    ).toBe("Action réservée aux administrateurs.");
    expect(
      failureMessage(new ConvexError({ code: "forbidden" }), "editor"),
    ).toBe("Action réservée aux éditeurs.");
    expect(
      failureMessage(new Error("[CONVEX M(sites:update)] boom"), "editor"),
    ).toBe("La modification a échoué. Réessayez.");
  });
});

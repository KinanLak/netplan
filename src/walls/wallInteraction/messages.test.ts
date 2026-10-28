import { describe, expect, it } from "bun:test";
import { toLineFailureMessage, toRoomFailureMessage } from "./messages";

describe("wall failure messages", () => {
  it("maps every line refusal to a French message", () => {
    expect(toLineFailureMessage("invalid-line")).toMatch(/invalide/);
    expect(toLineFailureMessage("collision-with-device")).toMatch(/équipement/);
    // Drawing over walls already there changes nothing and says nothing.
    expect(toLineFailureMessage("already-exists")).toBeNull();
    expect(toLineFailureMessage("applied")).toMatch(/Impossible/);
  });

  it("maps every room refusal to a French message", () => {
    expect(toRoomFailureMessage("invalid-room")).toMatch(/petite/);
    expect(toRoomFailureMessage("collision-with-device")).toMatch(/équipement/);
    expect(toRoomFailureMessage("already-exists")).toBeNull();
    expect(toRoomFailureMessage("applied")).toMatch(/Impossible/);
  });
});

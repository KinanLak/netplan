import { describe, expect, it } from "bun:test";
import { toLineFailureMessage, toRoomFailureMessage } from "./messages";

describe("wall failure messages", () => {
  it("maps every line failure reason to a French message", () => {
    expect(toLineFailureMessage("invalid-line")).toMatch(/invalide/);
    expect(toLineFailureMessage("collision-with-device")).toMatch(/collision/);
    expect(toLineFailureMessage("already-exists")).toMatch(/Aucun/);
    expect(toLineFailureMessage("applied")).toMatch(/Impossible/);
  });

  it("maps every room failure reason to a French message", () => {
    expect(toRoomFailureMessage("invalid-room")).toMatch(/rectangle/);
    expect(toRoomFailureMessage("collision-with-device")).toMatch(/collision/);
    expect(toRoomFailureMessage("already-exists")).toMatch(/Aucun/);
    expect(toRoomFailureMessage("applied")).toMatch(/Impossible/);
  });
});

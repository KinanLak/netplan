import { describe, expect, it, mock } from "bun:test";
import {
  forgetCableChange,
  rememberCableChange,
  reshowCableChange,
} from "./cableUndo";

describe("cable undo", () => {
  it("shows the last cable change's toast once, then lets undo reach the map", () => {
    const first = mock(() => {});
    const last = mock(() => {});
    rememberCableChange(first);
    rememberCableChange(last);

    expect(reshowCableChange()).toBe(true);
    expect(last).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(reshowCableChange()).toBe(false);
  });

  it("forgets the change once a map edit or a redo comes after it", () => {
    const show = mock(() => {});
    rememberCableChange(show);
    forgetCableChange();
    expect(reshowCableChange()).toBe(false);
    expect(show).not.toHaveBeenCalled();
  });
});

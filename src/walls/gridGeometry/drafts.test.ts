import { describe, expect, it } from "bun:test";
import type { FloorId } from "@/types/map";
import {
  createBrushWallDraft,
  createOrthogonalWallDraft,
  createRoomWallDrafts,
  splitWallDraftIntoBlocks,
} from "./drafts";

const floorId = "floor-a" as FloorId;

describe("wall draft geometry", () => {
  it("projects freeform wall drags to the dominant orthogonal axis", () => {
    expect(
      createOrthogonalWallDraft(
        { x: 10, y: 10 },
        { x: 50, y: 20 },
        floorId,
        "concrete",
      ),
    ).toEqual({
      floorId,
      color: "concrete",
      start: { x: 10, y: 10 },
      end: { x: 50, y: 10 },
    });
    expect(
      createOrthogonalWallDraft(
        { x: 10, y: 10 },
        { x: 20, y: 50 },
        floorId,
        "slate",
      ),
    ).toEqual({
      floorId,
      color: "slate",
      start: { x: 10, y: 10 },
      end: { x: 10, y: 50 },
    });
  });

  it("returns no orthogonal draft when the projected segment is empty", () => {
    expect(
      createOrthogonalWallDraft(
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        floorId,
        "concrete",
      ),
    ).toBe(null);
  });

  it("creates a single-cell brush draft", () => {
    expect(createBrushWallDraft(floorId, { x: 10, y: 10 }, "sand")).toEqual({
      floorId,
      color: "sand",
      start: { x: 10, y: 10 },
      end: { x: 11, y: 10 },
    });
  });

  it("returns no room draft for an empty rectangle", () => {
    expect(
      createRoomWallDrafts(
        { x: 10, y: 10 },
        { x: 10, y: 50 },
        floorId,
        "concrete",
      ),
    ).toEqual([]);
  });

  it("splits single and reversed line drafts into grid-cell blocks", () => {
    expect(
      splitWallDraftIntoBlocks({
        floorId,
        color: "concrete",
        start: { x: 10, y: 10 },
        end: { x: 10, y: 10 },
      }),
    ).toEqual([
      {
        floorId,
        color: "concrete",
        start: { x: 10, y: 10 },
        end: { x: 10, y: 10 },
      },
    ]);
    expect(
      splitWallDraftIntoBlocks({
        floorId,
        color: "concrete",
        start: { x: 50, y: 10 },
        end: { x: 10, y: 10 },
      }).map((block) => block.start),
    ).toEqual([
      { x: 10, y: 10 },
      { x: 30, y: 10 },
      { x: 50, y: 10 },
    ]);
    expect(
      splitWallDraftIntoBlocks({
        floorId,
        color: "concrete",
        start: { x: 10, y: 50 },
        end: { x: 10, y: 10 },
      }).map((block) => block.start),
    ).toEqual([
      { x: 10, y: 10 },
      { x: 10, y: 30 },
      { x: 10, y: 50 },
    ]);
  });

  it("returns no blocks for diagonal drafts", () => {
    expect(
      splitWallDraftIntoBlocks({
        floorId,
        color: "concrete",
        start: { x: 10, y: 10 },
        end: { x: 30, y: 50 },
      }),
    ).toEqual([]);
  });
});

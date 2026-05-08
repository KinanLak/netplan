import { describe, expect, it } from "bun:test";
import { rectanglesOverlap } from "./geometry";

const at = (x: number, y: number) => ({ x, y });
const sized = (width: number, height: number) => ({ width, height });

describe("rectangle overlap", () => {
  it("treats touching edges as non-overlapping", () => {
    expect(
      rectanglesOverlap(at(0, 0), sized(10, 10), at(10, 0), sized(10, 10)),
    ).toBe(false);
    expect(
      rectanglesOverlap(at(0, 0), sized(10, 10), at(0, 10), sized(10, 10)),
    ).toBe(false);
  });

  it("detects partial overlap on either axis", () => {
    expect(
      rectanglesOverlap(at(0, 0), sized(10, 10), at(5, 5), sized(10, 10)),
    ).toBe(true);
  });

  it("detects nesting", () => {
    expect(
      rectanglesOverlap(at(0, 0), sized(40, 40), at(10, 10), sized(10, 10)),
    ).toBe(true);
    expect(
      rectanglesOverlap(at(10, 10), sized(10, 10), at(0, 0), sized(40, 40)),
    ).toBe(true);
  });

  it("treats fully separated rectangles as non-overlapping", () => {
    expect(
      rectanglesOverlap(at(0, 0), sized(10, 10), at(50, 50), sized(10, 10)),
    ).toBe(false);
  });
});

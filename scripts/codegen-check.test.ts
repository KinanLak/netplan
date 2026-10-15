import { expect, test } from "bun:test";
import { diffSnapshots } from "./codegen-check";

test("diffSnapshots reports added, removed and changed files", () => {
  const committed = new Map([
    ["api.d.ts", "a"],
    ["server.js", "s"],
    ["old.js", "o"],
  ]);
  const generated = new Map([
    ["api.d.ts", "a"],
    ["server.js", "s2"],
    ["new.js", "n"],
  ]);

  expect(diffSnapshots(committed, generated)).toEqual([
    "added   new.js",
    "removed old.js",
    "changed server.js",
  ]);
});

test("diffSnapshots is empty when nothing changed", () => {
  const files = new Map([["api.d.ts", "a"]]);
  expect(diffSnapshots(files, new Map(files))).toEqual([]);
});

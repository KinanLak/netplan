import { describe, expect, it } from "bun:test";
import { getRejectedOperationMessage } from "./MapDocumentStatus";

describe("MapDocumentStatus", () => {
  it("formats collision rejections for users", () => {
    expect(getRejectedOperationMessage("Device collides with a wall")).toBe(
      "Action refusee: collision avec un autre element.",
    );
  });

  it("formats missing target rejections for users", () => {
    expect(getRejectedOperationMessage("Device not found")).toBe(
      "Action refusee: l'element n'est plus disponible.",
    );
  });
});

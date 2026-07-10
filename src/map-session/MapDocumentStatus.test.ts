import { describe, expect, it } from "bun:test";
import {
  getDocumentActivityMessage,
  getRejectedOperationMessage,
} from "./MapDocumentStatus";

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

  it("reports document loading and saving states", () => {
    expect(
      getDocumentActivityMessage({
        isReady: false,
        isSaving: false,
        isRetrying: false,
        hasBackgroundPendingOperations: false,
      }),
    ).toBe("Chargement du plan...");
    expect(
      getDocumentActivityMessage({
        isReady: true,
        isSaving: true,
        isRetrying: false,
        hasBackgroundPendingOperations: true,
      }),
    ).toContain("plusieurs etages");
    expect(
      getDocumentActivityMessage({
        isReady: true,
        isSaving: false,
        isRetrying: true,
        hasBackgroundPendingOperations: false,
      }),
    ).toContain("nouvelle tentative");
  });
});

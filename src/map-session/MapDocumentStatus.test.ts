import { describe, expect, it } from "bun:test";
import { FORBIDDEN_REJECTION } from "./outbox";
import {
  getDocumentActivityMessage,
  getRejectedOperationMessage,
} from "./MapDocumentStatus";

describe("MapDocumentStatus", () => {
  it("shows the server's own sentence", () => {
    expect(getRejectedOperationMessage("L'équipement chevauche un mur.")).toBe(
      "L'équipement chevauche un mur.",
    );
  });

  it("tells a reader their role cannot edit the map", () => {
    expect(getRejectedOperationMessage(FORBIDDEN_REJECTION)).toContain(
      "votre rôle ne permet pas de modifier le plan",
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
    ).toBe("Chargement du plan…");
    expect(
      getDocumentActivityMessage({
        isReady: true,
        isSaving: true,
        isRetrying: false,
        hasBackgroundPendingOperations: true,
      }),
    ).toContain("plusieurs étages");
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

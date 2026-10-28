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

  it("replaces the role refusal's code with a sentence", () => {
    const message = getRejectedOperationMessage(FORBIDDEN_REJECTION);
    expect(message).not.toBe(FORBIDDEN_REJECTION);
    expect(message.length).toBeGreaterThan(0);
  });

  it("reports loading, then saving, and nothing once saved", () => {
    const loading = getDocumentActivityMessage({
      isReady: false,
      isSaving: false,
    });
    const saving = getDocumentActivityMessage({
      isReady: true,
      isSaving: true,
    });
    expect(loading).not.toBeNull();
    expect(saving).not.toBeNull();
    expect(saving).not.toBe(loading);
    expect(
      getDocumentActivityMessage({ isReady: true, isSaving: false }),
    ).toBeNull();
  });
});

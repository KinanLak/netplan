import { describe, expect, it } from "bun:test";
import { ConvexError } from "convex/values";
import { overlayImportMessage } from "./importMessages";
import {
  OverlayImportError,
  overlaySourceKind,
  svgAspectRatio,
} from "./rasterize";

describe("overlaySourceKind", () => {
  it("trusts the MIME type, then the extension", () => {
    expect(overlaySourceKind({ name: "plan", type: "application/pdf" })).toBe(
      "pdf",
    );
    expect(overlaySourceKind({ name: "PLAN.JPEG", type: "" })).toBe("jpeg");
    expect(overlaySourceKind({ name: "plan.svg", type: "" })).toBe("svg");
    expect(overlaySourceKind({ name: "plan.png", type: "image/png" })).toBe(
      "png",
    );
  });

  it("refuses formats the calque cannot hold", () => {
    expect(overlaySourceKind({ name: "plan.dwg", type: "" })).toBe(null);
    expect(overlaySourceKind({ name: "plan.gif", type: "image/gif" })).toBe(
      null,
    );
  });
});

describe("svgAspectRatio", () => {
  it("reads the root's pixel size first", () => {
    expect(
      svgAspectRatio(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800px" height="400" viewBox="0 0 1 1"/>',
      ),
    ).toBe(2);
  });

  it("falls back to the viewBox when the size is relative or missing", () => {
    expect(
      svgAspectRatio(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0,0,300,600"/>',
      ),
    ).toBe(0.5);
  });

  it("has no ratio for a drawing without size or viewBox", () => {
    expect(svgAspectRatio('<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(
      null,
    );
    expect(svgAspectRatio("<html/>")).toBe(null);
  });
});

describe("overlayImportMessage", () => {
  it("explains client and server refusals in French", () => {
    expect(
      overlayImportMessage(new OverlayImportError("pdf-password")),
    ).toContain("mot de passe");
    expect(
      overlayImportMessage(new ConvexError({ code: "forbidden" })),
    ).toContain("éditeurs");
  });

  it("falls back to a generic message for anything else", () => {
    const fallback = "L'import du calque a échoué. Réessayez.";
    expect(overlayImportMessage(new Error("network"))).toBe(fallback);
    expect(overlayImportMessage(new ConvexError({ code: "toString" }))).toBe(
      fallback,
    );
  });
});

import { describe, expect, it } from "bun:test";
import { classifyGraphicsRenderer } from "./graphicsAcceleration";

describe("graphicsAcceleration", () => {
  it("classifies common software renderers", () => {
    expect(classifyGraphicsRenderer("Google SwiftShader").status).toBe(
      "supposed-software",
    );
    expect(classifyGraphicsRenderer("llvmpipe LLVM 18.1.0").status).toBe(
      "supposed-software",
    );
  });

  it("classifies visible GPU renderers as supposed hardware", () => {
    expect(classifyGraphicsRenderer("Apple M1 Pro").status).toBe(
      "supposed-hardware",
    );
  });

  it("reports unknown when the renderer is hidden", () => {
    expect(classifyGraphicsRenderer(null)).toEqual({
      status: "unknown",
      renderer: null,
      reason: "WebGL is available, but the renderer name is hidden.",
    });
  });
});

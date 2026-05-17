import { describe, expect, it } from "bun:test";
import {
  classifyWebGpuAdapter,
  classifyGraphicsRenderer,
  detectGraphicsBrowser,
  detectGraphicsRuntime,
} from "./graphicsAcceleration";

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
    expect(classifyGraphicsRenderer("Apple M1 Pro", "chromium").status).toBe(
      "supposed-hardware",
    );
  });

  it("does not infer Firefox compositing from sanitized WebGL renderer names", () => {
    expect(
      classifyGraphicsRenderer("Apple M1, or similar", "firefox").status,
    ).toBe("unknown");
  });

  it("reports unknown when the renderer is hidden", () => {
    expect(classifyGraphicsRenderer(null)).toEqual({
      status: "unknown",
      renderer: null,
      browser: "unknown",
      reason: "WebGL is available, but the renderer name is hidden.",
    });
  });

  it("detects browsers from user agent strings", () => {
    expect(detectGraphicsBrowser("Mozilla/5.0 Firefox/150.0")).toBe("firefox");
    expect(
      detectGraphicsBrowser("Mozilla/5.0 Chrome/124.0 Safari/537.36"),
    ).toBe("chromium");
    expect(
      detectGraphicsBrowser("Mozilla/5.0 Version/17.0 Safari/605.1.15"),
    ).toBe("safari");
  });

  it("detects the normal browser runtime outside Electrobun", () => {
    expect(detectGraphicsRuntime()).toBe("browser");
  });

  it("classifies WebGPU fallback adapters as software", () => {
    expect(classifyWebGpuAdapter({ isFallbackAdapter: true }).status).toBe(
      "supposed-software",
    );
  });

  it("classifies WebGPU adapters as hardware by default", () => {
    expect(
      classifyWebGpuAdapter({
        isFallbackAdapter: false,
        info: { vendor: "Apple", architecture: "Metal" },
      }),
    ).toEqual({
      status: "supposed-hardware",
      renderer: "Apple Metal",
      browser: "unknown",
      runtime: "electrobun",
      reason:
        "WebGPU is available through Chromium without a fallback adapter.",
    });
  });
});

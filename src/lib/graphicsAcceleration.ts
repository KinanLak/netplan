export type GraphicsAccelerationStatus =
  | "supposed-hardware"
  | "supposed-software"
  | "unavailable"
  | "unknown";

export type GraphicsBrowser = "firefox" | "chromium" | "safari" | "unknown";

export interface GraphicsAccelerationHint {
  status: GraphicsAccelerationStatus;
  renderer: string | null;
  browser: GraphicsBrowser;
  reason: string;
}

declare global {
  interface Window {
    __netplanGraphicsAccelerationStatusLogged?: boolean;
  }
}

const SOFTWARE_RENDERER_TERMS = [
  "swiftshader",
  "software",
  "llvmpipe",
  "mesa offscreen",
  "basic render",
  "warp",
];

export function classifyGraphicsRenderer(
  renderer: string | null,
  browser: GraphicsBrowser = "unknown",
): GraphicsAccelerationHint {
  if (!renderer) {
    return {
      status: "unknown",
      renderer: null,
      browser,
      reason: "WebGL is available, but the renderer name is hidden.",
    };
  }

  const normalizedRenderer = renderer.toLowerCase();
  const usesSoftwareRenderer = SOFTWARE_RENDERER_TERMS.some((term) =>
    normalizedRenderer.includes(term),
  );

  if (usesSoftwareRenderer) {
    return {
      status: "supposed-software",
      renderer,
      browser,
      reason: "The WebGL renderer name looks like a software renderer.",
    };
  }

  if (browser === "firefox") {
    return {
      status: "unknown",
      renderer,
      browser,
      reason:
        "Firefox exposes a sanitized WebGL renderer that does not reveal whether WebRender compositing is hardware accelerated.",
    };
  }

  return {
    status: "supposed-hardware",
    renderer,
    browser,
    reason: "WebGL is available and the renderer does not look software-only.",
  };
}

export function detectGraphicsBrowser(userAgent: string): GraphicsBrowser {
  if (userAgent.includes("Firefox/")) {
    return "firefox";
  }

  if (
    userAgent.includes("Chrome/") ||
    userAgent.includes("Chromium/") ||
    userAgent.includes("Edg/")
  ) {
    return "chromium";
  }

  if (userAgent.includes("Safari/")) {
    return "safari";
  }

  return "unknown";
}

export function getSupposedGraphicsAccelerationStatus(): GraphicsAccelerationHint {
  if (typeof document === "undefined") {
    return {
      status: "unknown",
      renderer: null,
      browser: "unknown",
      reason: "The DOM is unavailable, so graphics status cannot be checked.",
    };
  }

  const browser =
    typeof navigator === "undefined"
      ? "unknown"
      : detectGraphicsBrowser(navigator.userAgent);

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");

  if (!gl) {
    return {
      status: "unavailable",
      renderer: null,
      browser,
      reason:
        "WebGL is unavailable. Hardware graphics acceleration may be disabled.",
    };
  }

  const debugInfo =
    browser === "firefox" ? null : gl.getExtension("WEBGL_debug_renderer_info");
  const rendererValue: unknown =
    debugInfo && "UNMASKED_RENDERER_WEBGL" in debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
  const renderer = rendererValue == null ? null : String(rendererValue);

  return classifyGraphicsRenderer(renderer, browser);
}

export function logGraphicsAccelerationStatusOnce() {
  if (
    typeof window === "undefined" ||
    window.__netplanGraphicsAccelerationStatusLogged
  ) {
    return;
  }

  window.__netplanGraphicsAccelerationStatusLogged = true;
  console.log(
    "[Netplan] Statut graphique supposé:",
    getSupposedGraphicsAccelerationStatus(),
  );
}

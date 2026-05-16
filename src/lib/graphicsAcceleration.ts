export type GraphicsAccelerationStatus =
  | "supposed-hardware"
  | "supposed-software"
  | "unavailable"
  | "unknown";

export interface GraphicsAccelerationHint {
  status: GraphicsAccelerationStatus;
  renderer: string | null;
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
): GraphicsAccelerationHint {
  if (!renderer) {
    return {
      status: "unknown",
      renderer: null,
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
      reason: "The WebGL renderer name looks like a software renderer.",
    };
  }

  return {
    status: "supposed-hardware",
    renderer,
    reason: "WebGL is available and the renderer does not look software-only.",
  };
}

export function getSupposedGraphicsAccelerationStatus(): GraphicsAccelerationHint {
  if (typeof document === "undefined") {
    return {
      status: "unknown",
      renderer: null,
      reason: "The DOM is unavailable, so graphics status cannot be checked.",
    };
  }

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");

  if (!gl) {
    return {
      status: "unavailable",
      renderer: null,
      reason:
        "WebGL is unavailable. Hardware graphics acceleration may be disabled.",
    };
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const rendererValue: unknown = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : gl.getParameter(gl.RENDERER);
  const renderer = rendererValue == null ? null : String(rendererValue);

  return classifyGraphicsRenderer(renderer);
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

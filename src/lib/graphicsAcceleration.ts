export type GraphicsAccelerationStatus =
  | "supposed-hardware"
  | "supposed-software"
  | "unavailable"
  | "unknown";

export type GraphicsBrowser = "firefox" | "chromium" | "safari" | "unknown";

export type GraphicsRuntime = "browser" | "electrobun";

export interface GraphicsAccelerationHint {
  status: GraphicsAccelerationStatus;
  renderer: string | null;
  browser: GraphicsBrowser;
  runtime?: GraphicsRuntime;
  reason: string;
}

declare global {
  interface Window {
    __electrobunWebviewId?: number;
    __electrobunWindowId?: number;
    __netplanGraphicsAccelerationStatusLogged?: boolean;
  }
}

interface WebGpuAdapterLike {
  isFallbackAdapter?: boolean;
  info?: unknown;
  requestAdapterInfo?: () => Promise<unknown>;
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

export function detectGraphicsRuntime(): GraphicsRuntime {
  if (
    typeof window !== "undefined" &&
    (typeof window.__electrobunWebviewId === "number" ||
      typeof window.__electrobunWindowId === "number")
  ) {
    return "electrobun";
  }

  return "browser";
}

export function classifyWebGpuAdapter(
  adapter: WebGpuAdapterLike,
  browser: GraphicsBrowser = "unknown",
): GraphicsAccelerationHint {
  const renderer = getWebGpuAdapterRenderer(adapter);

  if (adapter.isFallbackAdapter === true) {
    return {
      status: "supposed-software",
      renderer,
      browser,
      runtime: "electrobun",
      reason: "WebGPU is available, but Chromium reports a fallback adapter.",
    };
  }

  return {
    status: "supposed-hardware",
    renderer,
    browser,
    runtime: "electrobun",
    reason: "WebGPU is available through Chromium without a fallback adapter.",
  };
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

export async function getGraphicsAccelerationStatus(): Promise<GraphicsAccelerationHint> {
  const browser =
    typeof navigator === "undefined"
      ? "unknown"
      : detectGraphicsBrowser(navigator.userAgent);

  if (detectGraphicsRuntime() === "electrobun") {
    const webGpuStatus = await getElectrobunWebGpuAccelerationStatus(browser);

    if (webGpuStatus) {
      return webGpuStatus;
    }
  }

  return getSupposedGraphicsAccelerationStatus();
}

export function logGraphicsAccelerationStatusOnce() {
  if (
    typeof window === "undefined" ||
    window.__netplanGraphicsAccelerationStatusLogged
  ) {
    return;
  }

  window.__netplanGraphicsAccelerationStatusLogged = true;
  void getGraphicsAccelerationStatus().then((status) => {
    console.log("[Netplan] Statut graphique:", status);
  });
}

async function getElectrobunWebGpuAccelerationStatus(
  browser: GraphicsBrowser,
): Promise<GraphicsAccelerationHint | null> {
  const gpu = getBrowserGpu();

  if (!gpu) {
    return null;
  }

  try {
    const adapter = await gpu.requestAdapter();

    if (!adapter) {
      return {
        status: "unavailable",
        renderer: null,
        browser,
        runtime: "electrobun",
        reason:
          "Electrobun is running with CEF, but Chromium did not expose a WebGPU adapter.",
      };
    }

    return classifyWebGpuAdapter(adapter, browser);
  } catch (error) {
    return {
      status: "unknown",
      renderer: null,
      browser,
      runtime: "electrobun",
      reason: `Electrobun is running with CEF, but WebGPU adapter detection failed: ${getErrorMessage(error)}.`,
    };
  }
}

function getBrowserGpu(): {
  requestAdapter: () => Promise<WebGpuAdapterLike | null>;
} | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  const candidate: unknown = navigator;

  if (!isRecord(candidate)) {
    return null;
  }

  const gpu = candidate.gpu;

  if (!isRecord(gpu) || typeof gpu.requestAdapter !== "function") {
    return null;
  }

  const requestAdapter = gpu.requestAdapter;

  return {
    requestAdapter: async () => {
      const adapter: unknown = await requestAdapter.call(gpu);

      return isRecord(adapter) ? adapter : null;
    },
  };
}

function getWebGpuAdapterRenderer(adapter: WebGpuAdapterLike): string | null {
  if (!isRecord(adapter.info)) {
    return null;
  }

  const parts = [
    adapter.info.vendor,
    adapter.info.architecture,
    adapter.info.device,
    adapter.info.description,
  ].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );

  return parts.length > 0 ? parts.join(" ") : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

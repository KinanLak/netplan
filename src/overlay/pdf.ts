import type { PDFDocumentProxy } from "pdfjs-dist";
import { pdfRenderScale } from "./placement";
import {
  OVERLAY_RASTER_MAX_SIDE,
  OverlayImportError,
  encodeOverlay,
} from "./rasterize";
import type { RasterOverlay } from "./rasterize";

/** Fine enough to read room labels on an A3 plan when zoomed in. */
const PDF_RENDER_DPI = 200;
const THUMBNAIL_WIDTH = 160;

export type PdfDocument = PDFDocumentProxy;

// pdf.js and its worker are loaded on the first PDF import only.
const loadPdfJs = async () => {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
};

export async function openPdf(file: File): Promise<PdfDocument> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch (error) {
    throw new OverlayImportError(
      error instanceof pdfjs.PasswordException
        ? "pdf-password"
        : "unreadable-file",
      { cause: error },
    );
  }
}

const renderPage = async (
  pdf: PdfDocument,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  width: number,
) => {
  const page = await pdf.getPage(pageNumber);
  const unit = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: width / unit.width });
  await page.render({ canvas, viewport }).promise;
};

export async function rasterizePdfPage(
  pdf: PdfDocument,
  pageNumber: number,
): Promise<RasterOverlay> {
  const page = await pdf.getPage(pageNumber);
  const unit = page.getViewport({ scale: 1 });
  const scale = pdfRenderScale(unit, PDF_RENDER_DPI, OVERLAY_RASTER_MAX_SIDE);
  return encodeOverlay(
    {
      width: Math.round(unit.width * scale),
      height: Math.round(unit.height * scale),
    },
    (canvas, size) => renderPage(pdf, pageNumber, canvas, size.width),
  );
}

/** A small preview for the page picker, as an object URL to revoke. */
export async function pdfPageThumbnail(
  pdf: PdfDocument,
  pageNumber: number,
): Promise<string> {
  const page = await pdf.getPage(pageNumber);
  const unit = page.getViewport({ scale: 1 });
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = Math.round((THUMBNAIL_WIDTH * unit.height) / unit.width);
  try {
    await renderPage(pdf, pageNumber, canvas, THUMBNAIL_WIDTH);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7),
    );
    if (!blob) throw new OverlayImportError("unreadable-file");
    return URL.createObjectURL(blob);
  } finally {
    canvas.width = 0;
  }
}

/** Frees the document and its worker; renders still running then reject. */
export function closePdf(pdf: PdfDocument): void {
  void pdf.loadingTask.destroy();
}

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { useStoreApi } from "@xyflow/react";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import type { FloorId, OverlayFileId } from "@/types/map";
import { api } from "../../convex/_generated/api";
import { overlayImportMessage } from "./importMessages";
import { closePdf as destroyPdf, openPdf, rasterizePdfPage } from "./pdf";
import type { PdfDocument } from "./pdf";
import { initialOverlay, replacedOverlay } from "./placement";
import type { PlanRect } from "./placement";
import {
  OverlayImportError,
  overlaySourceKind,
  rasterizeImageFile,
} from "./rasterize";
import type { RasterOverlay } from "./rasterize";

export type OverlayImportState =
  | { status: "idle" }
  | { status: "working"; step: "reading" | "uploading" }
  | { status: "choosing-page"; pdf: PdfDocument; fileName: string }
  | { status: "error"; message: string };

const IDLE: OverlayImportState = { status: "idle" };

/**
 * Turns a dropped or picked file into the floor's calque: rasterize in the
 * browser, upload the pixels, then place them with one undoable operation.
 */
export function useOverlayImport() {
  const upload = useAction(api.floorOverlays.upload);
  const { commands, getDocument } = useMapDocumentActions();
  const flowStore = useStoreApi();
  const [state, setState] = useState<OverlayImportState>(IDLE);
  const openPdfRef = useRef<PdfDocument | null>(null);
  // The floor the import started on; a floor switch meanwhile cancels it.
  const floorIdRef = useRef<FloorId | null>(null);

  const closePdf = () => {
    if (openPdfRef.current) destroyPdf(openPdfRef.current);
    openPdfRef.current = null;
  };

  useEffect(() => closePdf, []);

  const visiblePlan = (): PlanRect => {
    const { width, height, transform } = flowStore.getState();
    const [x, y, zoom] = transform;
    return {
      x: -x / zoom,
      y: -y / zoom,
      width: width / zoom,
      height: height / zoom,
    };
  };

  const fail = (error: unknown) => {
    closePdf();
    setState({ status: "error", message: overlayImportMessage(error) });
  };

  const place = async (raster: RasterOverlay, fileName: string) => {
    setState({ status: "working", step: "uploading" });
    const uploaded = await upload({ bytes: raster.bytes, name: fileName });
    const file = { ...uploaded, fileId: uploaded.fileId as OverlayFileId };
    const document = getDocument();
    if (document.floorId !== floorIdRef.current) {
      setState({
        status: "error",
        message:
          "L'étage a changé pendant l'import : le calque n'a pas été placé.",
      });
      return;
    }
    const overlay = document.overlay
      ? replacedOverlay(document.overlay, file)
      : initialOverlay(document.floorId, file, visiblePlan());
    if (!commands.setOverlay(overlay)) {
      setState({
        status: "error",
        message: "Le calque n'a pas pu être placé sur cet étage.",
      });
      return;
    }
    setState(IDLE);
  };

  const importFile = async (file: File) => {
    closePdf();
    floorIdRef.current = getDocument().floorId;
    const kind = overlaySourceKind(file);
    try {
      if (!kind) throw new OverlayImportError("unsupported-file");
      setState({ status: "working", step: "reading" });
      if (kind !== "pdf") {
        await place(await rasterizeImageFile(file, kind), file.name);
        return;
      }
      const pdf = await openPdf(file);
      openPdfRef.current = pdf;
      if (pdf.numPages === 1) {
        await place(await rasterizePdfPage(pdf, 1), file.name);
        closePdf();
        return;
      }
      setState({ status: "choosing-page", pdf, fileName: file.name });
    } catch (error) {
      fail(error);
    }
  };

  const choosePage = async (pageNumber: number) => {
    const pdf = openPdfRef.current;
    if (state.status !== "choosing-page" || !pdf) return;
    const name = `${state.fileName} (page ${pageNumber})`;
    try {
      setState({ status: "working", step: "reading" });
      await place(await rasterizePdfPage(pdf, pageNumber), name);
    } catch (error) {
      fail(error);
    } finally {
      closePdf();
    }
  };

  const reset = () => {
    closePdf();
    setState(IDLE);
  };

  return { state, importFile, choosePage, reset };
}

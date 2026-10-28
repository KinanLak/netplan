import { useRef } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useQuery } from "convex/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Delete02Icon,
  FileImportIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import {
  useMapDocumentActions,
  useMapDocumentData,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useIsEditMode, useIsOverlayPanelOpen } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import { api } from "../../convex/_generated/api";
import { OverlayControls } from "./OverlayControls";
import { PdfPageDialog } from "./PdfPageDialog";
import { OVERLAY_FILE_ACCEPT } from "./rasterize";
import { useOverlayImport } from "./useOverlayImport";
import { formatDecimal, overlayWidthMetres } from "./units";

export function OverlayPanel() {
  const isOpen = useIsOverlayPanelOpen();
  const isEditMode = useIsEditMode();
  if (!isOpen || !isEditMode) return null;
  return <OverlayPanelContent />;
}

const workingLabels = {
  reading: "Conversion du fichier…",
  uploading: "Envoi du calque…",
} as const;

function OverlayPanelContent() {
  const { document } = useMapDocumentData();
  const isReady = useMapDocumentReady();
  const { commands } = useMapDocumentActions();
  const setOverlayPanelOpen = useMapStore((s) => s.setOverlayPanelOpen);
  const { state, importFile, choosePage, reset } = useOverlayImport();
  const inputRef = useRef<HTMLInputElement>(null);

  const overlay =
    document.overlay?.floorId === document.floorId ? document.overlay : null;
  const image = useQuery(
    api.floorOverlays.imageUrl,
    overlay ? { fileId: overlay.fileId } : "skip",
  );
  const isWorking = state.status === "working";
  const canChange = isReady && !isWorking && !overlay?.locked;

  const handleFile = (file: File | undefined) => {
    if (file && canChange) void importFile(file);
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0]);
    // Picking the same file again must fire `change` again.
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFile(event.dataTransfer.files[0]);
  };

  return (
    <div
      className="absolute top-4 right-4 z-20 flex w-72 flex-col gap-3 rounded-lg border bg-card p-3 text-sm shadow-lg"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      aria-label="Calque"
      role="region"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Calque</h2>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOverlayPanelOpen(false)}
          aria-label="Fermer le panneau du calque"
          title="Fermer"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      {overlay ? (
        <div className="min-w-0">
          <p className="truncate" title={image?.name}>
            {image?.name || "Calque"}
          </p>
          {/* Its size on the plan, not its pixels: a SVG has none (A26). */}
          <p className="text-xs text-muted-foreground">
            {formatDecimal(overlayWidthMetres(overlay))} ×{" "}
            {formatDecimal(
              overlayWidthMetres(overlay) *
                (overlay.imageHeight / overlay.imageWidth),
            )}
            {"\u00a0"}m
          </p>
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant={overlay ? "outline" : "default"}
          size="sm"
          className="flex-1"
          disabled={!canChange}
          onClick={() => inputRef.current?.click()}
        >
          <HugeiconsIcon icon={FileImportIcon} strokeWidth={2} />
          {overlay ? "Remplacer le calque…" : "Importer un calque…"}
        </Button>
        {overlay ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={!canChange}
            onClick={() => commands.setOverlay(null)}
            aria-label="Supprimer le calque"
            title="Supprimer le calque"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          </Button>
        ) : null}
      </div>

      {overlay ? <OverlayControls overlay={overlay} isReady={isReady} /> : null}

      {isWorking ? (
        <p className="text-xs text-muted-foreground" role="status">
          {workingLabels[state.step]}
        </p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {state.message}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={OVERLAY_FILE_ACCEPT}
        className="hidden"
        onChange={handleInputChange}
      />
      {state.status === "choosing-page" ? (
        <PdfPageDialog
          pdf={state.pdf}
          fileName={state.fileName}
          onChoose={(page) => void choosePage(page)}
          onCancel={reset}
        />
      ) : null}
    </div>
  );
}

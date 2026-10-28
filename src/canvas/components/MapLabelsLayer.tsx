import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { ViewportPortal, useReactFlow, useStore } from "@xyflow/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Delete02Icon } from "@hugeicons/core-free-icons";
import { MAX_LABEL_LENGTH, normalizeLabelText } from "@/map-engine/labels";
import {
  useMapDocumentActions,
  useMapDocumentData,
  useMapDocumentReady,
} from "@/map-session/useMapDocument";
import { useIsEditMode, useIsLabelToolActive } from "@/store/selectors";
import { useMapStore } from "@/store/useMapStore";
import type { LabelId, MapLabel, Position } from "@/types/map";
import { cn } from "@/lib/utils";
import { DRAWING_HELP_CLASS } from "./drawingHelp";

/** A press that moves less than this, on screen, is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;

const LABEL_TEXT_CLASS =
  "text-base font-semibold whitespace-nowrap text-muted-foreground";

/**
 * The floor's free text labels (C4, ADR 0029), seen by every role. In edit
 * mode, the « Texte » tool puts one where the plan is clicked; a label is
 * dragged to move it and double-clicked to rename it, and a label emptied,
 * or its bin, deletes it.
 */
export function MapLabelsLayer() {
  const { document } = useMapDocumentData();
  const isEditMode = useIsEditMode();
  const isReady = useMapDocumentReady();
  const isToolActive = useIsLabelToolActive();
  const setLabelToolActive = useMapStore((s) => s.setLabelToolActive);
  const canvas = useStore((s) => s.domNode);
  const reactFlow = useReactFlow();
  const { commands } = useMapDocumentActions();
  const [draft, setDraft] = useState<Position | null>(null);
  const [editing, setEditing] = useState<LabelId | null>(null);

  const canEdit = isEditMode && isReady;

  // React Flow has no pane click for a tool of its own; the layer listens.
  const placeDraftRef = useRef((_: MouseEvent) => {});
  useEffect(() => {
    placeDraftRef.current = (event: MouseEvent) => {
      if (!canEdit || !isToolActive) return;
      if (!(event.target as Element).classList.contains("react-flow__pane")) {
        return;
      }
      setDraft(
        reactFlow.screenToFlowPosition({ x: event.clientX, y: event.clientY }),
      );
    };
  });
  useEffect(() => {
    if (!canvas) return;
    const listener = (event: MouseEvent) => placeDraftRef.current(event);
    canvas.addEventListener("click", listener);
    return () => canvas.removeEventListener("click", listener);
  }, [canvas]);

  useEffect(() => {
    if (!canvas || !isToolActive || !canEdit) return;
    canvas.classList.add("label-cursor-text");
    return () => canvas.classList.remove("label-cursor-text");
  }, [canvas, isToolActive, canEdit]);

  const finishDraft = (text: string | null) => {
    if (draft && text !== null && normalizeLabelText(text)) {
      commands.createLabel(draft, text);
    }
    setDraft(null);
    setLabelToolActive(false);
  };

  const finishEdit = (label: MapLabel, text: string | null) => {
    setEditing(null);
    if (text === null) return;
    const next = normalizeLabelText(text);
    if (!next) commands.deleteLabel(label.id);
    else if (next !== label.text) commands.patchLabel(label.id, { text: next });
  };

  const labels = document.labels.filter(
    (label) => label.floorId === document.floorId,
  );
  if (labels.length === 0 && !draft && !isToolActive) return null;

  return (
    <>
      <ViewportPortal>
        {labels.map((label) =>
          editing === label.id && canEdit ? (
            <LabelInput
              key={label.id}
              position={label.position}
              initial={label.text}
              onDone={(text) => finishEdit(label, text)}
              onDelete={() => {
                setEditing(null);
                commands.deleteLabel(label.id);
              }}
            />
          ) : (
            <PlacedLabel
              key={label.id}
              label={label}
              canEdit={canEdit}
              onMove={(position) => commands.patchLabel(label.id, { position })}
              onEdit={() => setEditing(label.id)}
            />
          ),
        )}
        {draft && canEdit ? (
          <LabelInput position={draft} initial="" onDone={finishDraft} />
        ) : null}
      </ViewportPortal>
      {isToolActive && canEdit && !draft ? (
        <div className={cn(DRAWING_HELP_CLASS, "text-foreground")}>
          Cliquez sur le plan où poser le texte.
        </div>
      ) : null}
    </>
  );
}

function PlacedLabel({
  label,
  canEdit,
  onMove,
  onEdit,
}: {
  label: MapLabel;
  canEdit: boolean;
  onMove: (position: Position) => void;
  onEdit: () => void;
}) {
  const zoom = useStore((s) => s.transform[2]);
  const [offset, setOffset] = useState<Position | null>(null);
  const pressRef = useRef<{ x: number; y: number; moved: boolean } | null>(
    null,
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit || event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    pressRef.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const press = pressRef.current;
    if (!press) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    press.moved = true;
    setOffset({ x: dx / zoom, y: dy / zoom });
  };
  const onPointerUp = () => {
    const press = pressRef.current;
    pressRef.current = null;
    if (press?.moved && offset) {
      onMove({
        x: Math.round(label.position.x + offset.x),
        y: Math.round(label.position.y + offset.y),
      });
    }
    setOffset(null);
  };

  return (
    <div
      data-testid="map-label"
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 rounded-sm px-1 select-none",
        LABEL_TEXT_CLASS,
        canEdit
          ? "nopan nodrag nowheel pointer-events-auto cursor-move hover:bg-accent"
          : "pointer-events-none",
      )}
      style={{
        left: label.position.x + (offset?.x ?? 0),
        top: label.position.y + (offset?.y ?? 0),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        pressRef.current = null;
        setOffset(null);
      }}
      onDoubleClick={canEdit ? onEdit : undefined}
      title={
        canEdit
          ? "Glissez pour déplacer, double-cliquez pour renommer"
          : undefined
      }
    >
      {label.text}
    </div>
  );
}

function LabelInput({
  position,
  initial,
  onDone,
  onDelete,
}: {
  position: Position;
  initial: string;
  /** The text typed, or null when cancelled. */
  onDone: (text: string | null) => void;
  onDelete?: () => void;
}) {
  const [text, setText] = useState(initial);
  const doneRef = useRef(false);
  const finish = (value: string | null) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // The map's shortcuts stay out of the way while typing.
    event.stopPropagation();
    if (event.key === "Enter") finish(text);
    if (event.key === "Escape") finish(null);
  };

  return (
    <div
      className="nopan nodrag nowheel pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1"
      style={{ left: position.x, top: position.y }}
    >
      <input
        // oxlint-disable-next-line jsx-a11y/no-autofocus -- typing starts where the user clicked
        autoFocus
        value={text}
        maxLength={MAX_LABEL_LENGTH}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(text)}
        aria-label="Texte de l'étiquette"
        placeholder="Nom de la salle…"
        className={cn(
          "rounded-sm border border-ring bg-card px-1 text-center outline-none",
          LABEL_TEXT_CLASS,
          "text-foreground",
        )}
        size={Math.max(12, text.length + 1)}
      />
      {onDelete ? (
        <button
          type="button"
          // Pressing the bin must not blur the input into a save first.
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => {
            doneRef.current = true;
            onDelete();
          }}
          aria-label="Supprimer l'étiquette"
          title="Supprimer l'étiquette"
          className="rounded-sm p-1 text-muted-foreground hover:text-destructive"
        >
          <HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}

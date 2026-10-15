import { useEffect, useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LockKeyholeIcon,
  LockKeyholeOpenIcon,
  RulerIcon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutHintInline } from "@/components/ui/shortcut-hint";
import { useShortcutIntentEffect } from "@/hooks/use-shortcuts";
import { OVERLAY_MIN_OPACITY, normalizeRotation } from "@/map-engine/overlay";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import type { FloorOverlay } from "@/types/map";
import { OverlayCalibrationStep } from "./OverlayCalibrationStep";
import {
  formatDecimal,
  overlayWidthMetres,
  parseDecimal,
  scaleForWidthMetres,
} from "./units";

interface OverlayControlsProps {
  overlay: FloorOverlay;
  isReady: boolean;
}

/** Opacity, angle, width, scale calibration and lock of the floor's calque. */
export function OverlayControls({ overlay, isReady }: OverlayControlsProps) {
  const { commands } = useMapDocumentActions();
  const draftOpacity = useMapStore((s) => s.overlayDraft?.opacity);
  const setOverlayDraft = useMapStore((s) => s.setOverlayDraft);
  const calibration = useMapStore((s) => s.overlayCalibration);
  const setOverlayCalibration = useMapStore((s) => s.setOverlayCalibration);
  const opacityId = useId();
  const canPlace = isReady && !overlay.locked;
  // Points picked on a replaced image would not mean anything on the new one.
  const activeCalibration =
    canPlace && calibration?.fileId === overlay.fileId ? calibration : null;

  useEffect(
    () => () => {
      setOverlayDraft(null);
      setOverlayCalibration(null);
    },
    [setOverlayDraft, setOverlayCalibration],
  );

  const toggleLock = () => {
    if (!isReady) return;
    if (!overlay.locked) setOverlayCalibration(null);
    commands.patchOverlay({ locked: !overlay.locked });
  };
  useShortcutIntentEffect("toggle-overlay-lock", toggleLock, {
    enabled: isReady,
  });

  const toggleCalibration = () => {
    if (!canPlace) return;
    setOverlayCalibration(
      activeCalibration ? null : { fileId: overlay.fileId, points: [] },
    );
  };
  useShortcutIntentEffect("calibrate-overlay", toggleCalibration, {
    enabled: canPlace,
  });

  // The slider previews through the draft; letting go makes one undo step.
  const commitOpacity = () => {
    const opacity = useMapStore.getState().overlayDraft?.opacity;
    setOverlayDraft(null);
    if (opacity !== undefined && opacity !== overlay.opacity) {
      commands.patchOverlay({ opacity });
    }
  };

  const opacity = draftOpacity ?? overlay.opacity;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs">
          <label htmlFor={opacityId} className="text-muted-foreground">
            Opacité
          </label>
          <span className="tabular-nums">{Math.round(opacity * 100)} %</span>
        </div>
        <input
          id={opacityId}
          type="range"
          min={OVERLAY_MIN_OPACITY}
          max={1}
          step={0.05}
          value={opacity}
          disabled={!isReady}
          className="w-full accent-primary"
          onChange={(event) =>
            setOverlayDraft({ opacity: Number(event.target.value) })
          }
          onPointerUp={commitOpacity}
          onKeyUp={commitOpacity}
          onBlur={commitOpacity}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <OverlayNumberField
          label="Rotation"
          unit="°"
          value={overlay.rotation}
          disabled={!canPlace}
          onCommit={(degrees) => {
            const rotation = normalizeRotation(degrees);
            if (rotation !== overlay.rotation) {
              commands.patchOverlay({ rotation });
            }
          }}
        />
        <OverlayNumberField
          label="Largeur"
          unit="m"
          value={overlayWidthMetres(overlay)}
          disabled={!canPlace}
          onCommit={(metres) => {
            const scale = scaleForWidthMetres(overlay, metres);
            // The calque keeps its centre: it grows or shrinks around it.
            if (scale !== null && scale !== overlay.scale) {
              commands.patchOverlay({ scale });
            }
          }}
        />
      </div>

      {activeCalibration ? (
        <OverlayCalibrationStep
          overlay={overlay}
          calibration={activeCalibration}
        />
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={!canPlace}
          onClick={toggleCalibration}
          title="Cliquer deux points du plan et saisir leur distance réelle"
        >
          <HugeiconsIcon icon={RulerIcon} strokeWidth={2} />
          Étalonner l'échelle
          <ShortcutHintInline action="calibrate-overlay" size="sm" />
        </Button>
      )}

      <Button
        variant={overlay.locked ? "secondary" : "outline"}
        size="sm"
        disabled={!isReady}
        onClick={toggleLock}
        aria-pressed={overlay.locked}
      >
        <HugeiconsIcon
          icon={overlay.locked ? LockKeyholeIcon : LockKeyholeOpenIcon}
          strokeWidth={2}
        />
        {overlay.locked ? "Déverrouiller" : "Verrouiller"}
        <ShortcutHintInline action="toggle-overlay-lock" size="sm" />
      </Button>
    </div>
  );
}

interface OverlayNumberFieldProps {
  label: string;
  unit: string;
  value: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}

/** A decimal typed freely, applied on Enter or leaving the field. */
function OverlayNumberField({
  label,
  unit,
  value,
  disabled,
  onCommit,
}: OverlayNumberFieldProps) {
  const id = useId();
  // Null while not editing, so a change from elsewhere shows at once.
  const [text, setText] = useState<string | null>(null);
  const parsed = text === null ? null : parseDecimal(text);

  const commit = () => {
    if (text === null) return;
    setText(null);
    if (parsed !== null) onCommit(parsed);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") commit();
    if (event.key === "Escape") setText(null);
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          inputMode="decimal"
          className="h-8"
          value={text ?? formatDecimal(value)}
          disabled={disabled}
          aria-invalid={text !== null && parsed === null}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

import { useId, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMapDocumentActions } from "@/map-session/useMapDocument";
import { useMapStore } from "@/store/useMapStore";
import type { FloorOverlay, OverlayCalibration } from "@/types/map";
import {
  arePointsTooClose,
  calibrationMetres,
  calibrationPatch,
} from "./calibration";
import { formatDecimal, parseDecimal } from "./units";

interface OverlayCalibrationStepProps {
  overlay: FloorOverlay;
  calibration: OverlayCalibration;
}

const instructions = [
  "Cliquez sur le calque au début d'une longueur connue : une cote, l'échelle graphique, un mur.",
  "Cliquez à l'autre bout de cette longueur.",
];

/** The panel's half of a calibration: what to click, then the real length. */
export function OverlayCalibrationStep({
  overlay,
  calibration,
}: OverlayCalibrationStepProps) {
  const { commands } = useMapDocumentActions();
  const setOverlayCalibration = useMapStore((s) => s.setOverlayCalibration);
  const cancel = () => setOverlayCalibration(null);
  const a = calibration.points.at(0);
  const b = calibration.points.at(1);

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-primary p-2"
      role="group"
      aria-label="Étalonnage du calque"
    >
      <p className="text-xs font-medium">Étalonner l'échelle</p>
      {a && b ? (
        <CalibrationDistanceForm
          measured={calibrationMetres(overlay, a, b)}
          tooClose={arePointsTooClose(a, b)}
          onApply={(metres) => {
            const result = calibrationPatch(overlay, a, b, metres);
            if (!result.ok || !commands.patchOverlay(result.patch)) {
              return false;
            }
            setOverlayCalibration(null);
            return true;
          }}
          onCancel={cancel}
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground" role="status">
            {instructions[calibration.points.length]}
          </p>
          <Button variant="outline" size="sm" onClick={cancel}>
            Annuler
          </Button>
        </>
      )}
    </div>
  );
}

interface CalibrationDistanceFormProps {
  measured: number;
  tooClose: boolean;
  /** Applies the distance; false if the calque cannot take it. */
  onApply: (metres: number) => boolean;
  onCancel: () => void;
}

function CalibrationDistanceForm({
  measured,
  tooClose,
  onApply,
  onCancel,
}: CalibrationDistanceFormProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [refused, setRefused] = useState(false);
  const metres = parseDecimal(text);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (metres === null) return;
    setRefused(!onApply(metres));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Shortcuts are off while typing, so the field cancels by itself.
    if (event.key === "Escape") onCancel();
  };

  if (tooClose) {
    return (
      <>
        <p className="text-xs text-destructive" role="alert">
          Points trop proches pour mesurer : cliquez deux points plus éloignés.
        </p>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </>
    );
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
      <p className="text-xs text-muted-foreground">
        Mesuré sur le calque : {formatDecimal(measured)} m. Un clic sur le
        calque recommence.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-xs text-muted-foreground">
          Distance réelle
        </label>
        <div className="flex items-center gap-1.5">
          <Input
            id={id}
            inputMode="decimal"
            className="h-8"
            placeholder={formatDecimal(measured)}
            value={text}
            autoFocus
            aria-invalid={refused || (text !== "" && metres === null)}
            onChange={(event) => {
              setText(event.target.value);
              setRefused(false);
            }}
            onKeyDown={handleKeyDown}
          />
          <span className="text-xs text-muted-foreground">m</span>
        </div>
      </div>
      {refused ? (
        <p className="text-xs text-destructive" role="alert">
          Cette distance donnerait un calque trop grand ou trop petit.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button
          type="submit"
          size="sm"
          className="flex-1"
          disabled={metres === null}
        >
          Appliquer
        </Button>
      </div>
    </form>
  );
}

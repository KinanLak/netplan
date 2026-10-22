// The rules of a free text label (C4, ADR 0029), shared by the engine and the
// server. Imported by `convex/`, so relative imports only.
import type { MapLabel, Position } from "../types/map";

export const MAX_LABEL_LENGTH = 80;

export type LabelPatch = { text?: string; position?: Position };

/** A label's text as it is stored: one line, trimmed. */
export const normalizeLabelText = (text: string): string =>
  text.replace(/\s+/g, " ").trim();

/** Why a label cannot be stored, in French, or null. */
export const labelError = (
  label: Pick<MapLabel, "text" | "position">,
): string | null => {
  const text = normalizeLabelText(label.text);
  if (text.length === 0) return "Une étiquette a besoin d'un texte.";
  if (text.length > MAX_LABEL_LENGTH) {
    return `Une étiquette tient en ${MAX_LABEL_LENGTH} caractères.`;
  }
  if (text !== label.text)
    return "Le texte de l'étiquette n'est pas normalisé.";
  if (
    !Number.isFinite(label.position.x) ||
    !Number.isFinite(label.position.y)
  ) {
    return "La position de l'étiquette est invalide.";
  }
  return null;
};

export const applyLabelPatch = <T extends Pick<MapLabel, "text" | "position">>(
  label: T,
  patch: LabelPatch,
): T => ({
  ...label,
  ...(patch.text === undefined ? {} : { text: patch.text }),
  ...(patch.position === undefined ? {} : { position: patch.position }),
});

/** Whether `label` still has what an undo expects to replace. */
export const labelIsAsExpected = (
  label: Pick<MapLabel, "text" | "position">,
  expected: LabelPatch | undefined,
): boolean =>
  expected === undefined ||
  ((expected.text === undefined || expected.text === label.text) &&
    (expected.position === undefined ||
      (expected.position.x === label.position.x &&
        expected.position.y === label.position.y)));

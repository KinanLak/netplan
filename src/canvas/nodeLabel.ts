// How a device's name fits its node on the plan (ADR 0029): in capitals, at
// the largest size that fits its lines, down to a floor; past it the middle
// gives way, since the end of a name is what tells two devices apart.

/** The average width of a capital in the map's bold face, in em. */
const CAPITAL_WIDTH = 0.68;

export type LabelBox = {
  /** Room for the text, in flow units. */
  width: number;
  lines: number;
  /** Font sizes, in flow units. */
  max: number;
  min: number;
};

export type FittedLabel = {
  text: string;
  fontSize: number;
  /** The text was cut to fit, so it wraps at any letter to keep its end. */
  breaksAnywhere: boolean;
};

/** Pieces a line may break after: a hyphen, a dot, an underscore, a space. */
const pieces = (text: string): Array<string> =>
  text.split(/(?<=[-_.\s/])/).filter((piece) => piece.length > 0);

/** How many lines `text` takes when a line holds `perLine` characters. */
const linesFor = (text: string, perLine: number): number => {
  let lines = 1;
  let used = 0;
  for (const piece of pieces(text)) {
    const length = piece.trimEnd().length;
    if (length > perLine) return Number.POSITIVE_INFINITY;
    if (used + length > perLine) {
      lines += 1;
      used = piece.length;
    } else {
      used += piece.length;
    }
  }
  return lines;
};

const perLineAt = (box: LabelBox, fontSize: number) =>
  Math.max(1, Math.floor(box.width / (fontSize * CAPITAL_WIDTH)));

/** Keeps the start and the end of `text` within `length` characters. */
export const middleEllipsis = (text: string, length: number): string => {
  if (text.length <= length) return text;
  const kept = Math.max(1, length - 1);
  const tail = Math.ceil(kept / 2);
  return `${text.slice(0, kept - tail)}…${text.slice(text.length - tail)}`;
};

export const fitLabel = (name: string, box: LabelBox): FittedLabel => {
  const text = name.trim().toLocaleUpperCase("fr");
  for (let size = box.max; size >= box.min; size -= 0.5) {
    if (linesFor(text, perLineAt(box, size)) <= box.lines) {
      return { text, fontSize: size, breaksAnywhere: false };
    }
  }
  // At the floor, the text loses its middle and wraps at any letter, so the
  // lines hold exactly what was counted and the end stays in view.
  return {
    text: middleEllipsis(text, perLineAt(box, box.min) * box.lines),
    fontSize: box.min,
    breaksAnywhere: true,
  };
};

/**
 * A socket's icon already says it is a socket, so its label drops a leading
 * « Prise » (A105).
 */
export const socketLabel = (name: string): string => {
  const rest = name.replace(/^\s*prise\b[\s:-]*/iu, "");
  return rest.length > 0 ? rest : name;
};

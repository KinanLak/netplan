import { ConvexError } from "convex/values";
import { OverlayImportError } from "./rasterize";
import type { OverlayImportErrorCode } from "./rasterize";

const importMessages: Record<OverlayImportErrorCode, string> = {
  "unsupported-file": "Formats acceptés : PNG, JPG, SVG ou PDF.",
  "unreadable-file": "Ce fichier n'a pas pu être lu.",
  "pdf-password": "Ce PDF est protégé par un mot de passe.",
  "too-large":
    "Ce plan reste trop lourd même réduit : exportez-le en plus basse résolution.",
};

const serverMessages: Record<string, string> = {
  "overlay-file-too-large": "L'image dépasse 15 Mo une fois convertie.",
  "overlay-file-not-image":
    "Ce fichier n'est pas une image PNG ou JPEG valide.",
  "overlay-image-too-large": "L'image dépasse 16 384 pixels de côté.",
  forbidden:
    "Seuls les éditeurs et les administrateurs peuvent importer un calque.",
  unauthenticated: "Votre session a expiré : reconnectez-vous.",
};

export function overlayImportMessage(error: unknown): string {
  if (error instanceof OverlayImportError) return importMessages[error.code];
  if (error instanceof ConvexError) {
    const code = (error.data as { code?: unknown } | null)?.code;
    if (typeof code === "string" && Object.hasOwn(serverMessages, code)) {
      return serverMessages[code];
    }
  }
  return "L'import du calque a échoué. Réessayez.";
}

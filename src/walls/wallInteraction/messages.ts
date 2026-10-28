import type { WallCommandReason } from "@/types/map";

// Drawing over walls already there changes nothing the user cannot see, so
// it says nothing.

export const toLineFailureMessage = (
  reason: WallCommandReason,
): string | null => {
  switch (reason) {
    case "invalid-line":
      return "Segment de mur invalide.";
    case "collision-with-device":
      return COLLISION_LINE_MESSAGE;
    case "already-exists":
      return null;
    default:
      return "Impossible d'ajouter ce mur.";
  }
};

export const COLLISION_LINE_MESSAGE = "Ce mur traverse un équipement.";

export const toRoomFailureMessage = (
  reason: WallCommandReason,
): string | null => {
  switch (reason) {
    case "invalid-room":
      return "Cette salle est trop petite.";
    case "collision-with-device":
      return "Cette salle chevauche un équipement.";
    case "already-exists":
      return null;
    default:
      return "Impossible d'ajouter cette salle.";
  }
};

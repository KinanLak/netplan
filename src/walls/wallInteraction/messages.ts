import type { WallCommandReason } from "@/types/map";

export const toLineFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-line":
      return "Segment de mur invalide.";
    case "collision-with-device":
      return COLLISION_LINE_MESSAGE;
    case "already-exists":
      return "Aucun nouveau bloc de mur à ajouter.";
    default:
      return "Impossible d'ajouter ce mur.";
  }
};

export const COLLISION_LINE_MESSAGE = "Mur refusé : il traverse un équipement.";

export const toRoomFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-room":
      return "Salle refusée : rectangle vide.";
    case "collision-with-device":
      return "Salle refusée : elle chevauche un équipement.";
    case "already-exists":
      return "Aucun nouveau bloc de mur à ajouter.";
    default:
      return "Impossible d'ajouter cette salle.";
  }
};

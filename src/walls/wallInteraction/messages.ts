import type { WallCommandReason } from "@/types/map";

export const toLineFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-line":
      return "Segment de mur invalide.";
    case "collision-with-device":
      return "Mur refuse: collision avec un device.";
    case "already-exists":
      return "Aucun nouveau bloc de mur a ajouter.";
    default:
      return "Impossible d'ajouter ce mur.";
  }
};

export const toRoomFailureMessage = (reason: WallCommandReason): string => {
  switch (reason) {
    case "invalid-room":
      return "Salle refusée: rectangle vide.";
    case "collision-with-device":
      return "Salle refusée: collision avec un device.";
    case "already-exists":
      return "Aucun nouveau bloc de mur à ajouter.";
    default:
      return "Impossible d'ajouter cette salle.";
  }
};

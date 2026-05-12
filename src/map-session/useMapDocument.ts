import { useContext } from "react";
import { MapDocumentContext } from "./MapDocumentProvider";

export function useMapDocument() {
  const session = useContext(MapDocumentContext);
  if (!session) {
    throw new Error("useMapDocument must be used inside MapDocumentProvider");
  }
  return session;
}

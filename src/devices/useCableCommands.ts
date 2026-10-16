import { useMutation } from "convex/react";
import { toast } from "sonner";
import { failureMessage } from "@/lib/errors";
import { api } from "../../convex/_generated/api";

type CableEnd = { deviceId: string; portId: string };
type NewCable = { id: string; a: CableEnd; b: CableEnd };

const UNDO_TOAST_MS = 10_000;

/**
 * Cabling and unplugging, from the port table or the map (ADR 0025). Cables
 * stay outside the map's undo history (ADR 0022), so each change offers its
 * own "Annuler" on the toast that reports it.
 */
export const useCableCommands = () => {
  const connect = useMutation(api.cables.connect);
  const disconnect = useMutation(api.cables.disconnect);

  const toastFailure = (error: unknown) =>
    toast.error(failureMessage(error, "editor"));

  /**
   * Plugs `cable` in and reports it as `label`. Returns why the server
   * refused it, or `null` once it is plugged in.
   */
  const plug = async (cable: NewCable, label: string) => {
    try {
      await connect(cable);
    } catch (error) {
      return failureMessage(error, "editor");
    }
    toast(`Câblé : ${label}`, {
      action: {
        label: "Annuler",
        onClick: () =>
          void disconnect({ cableId: cable.id }).catch(toastFailure),
      },
      duration: UNDO_TOAST_MS,
    });
    return null;
  };

  /** Unplugs a manual cable and reports it as `label`. */
  const unplug = async (cableId: string, label: string) => {
    try {
      const removed = await disconnect({ cableId });
      if (!removed) return;
      toast(`${label} débranché`, {
        // The same id and ends bring the cable back as it was.
        action: {
          label: "Annuler",
          onClick: () => void connect(removed).catch(toastFailure),
        },
        duration: UNDO_TOAST_MS,
      });
    } catch (error) {
      toastFailure(error);
    }
  };

  return { plug, unplug };
};

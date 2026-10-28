import { useOnlineMutation } from "@/hooks/use-online-mutation";
import { toast } from "sonner";
import { failureMessage } from "@/lib/errors";
import { forgetCableChange, rememberCableChange } from "./cableUndo";
import { api } from "../../convex/_generated/api";

type CableEnd = { deviceId: string; portId: string };
type NewCable = { id: string; a: CableEnd; b: CableEnd };

const UNDO_TOAST_MS = 10_000;
/** Cable toasts replace each other rather than piling up (B14). */
const CABLE_TOAST_ID = "cable-change";

/**
 * Cabling and unplugging, from the port table or the map (ADR 0025). Cables
 * stay outside the map's undo history (ADR 0022), so each change offers its
 * own "Annuler" on the toast that reports it, which Ctrl+Z shows again.
 */
export const useCableCommands = () => {
  const connect = useOnlineMutation(api.cables.connect);
  const disconnect = useOnlineMutation(api.cables.disconnect);

  const toastFailure = (error: unknown) =>
    toast.error(failureMessage(error, "editor"));

  /**
   * Plugs `cable` in and reports it as « Câblé `label` », so `label` reads
   * « A à B ». Returns why the server refused it, or `null` once it is
   * plugged in.
   */
  const plug = async (cable: NewCable, label: string) => {
    try {
      await connect(cable);
    } catch (error) {
      return failureMessage(error, "editor");
    }
    const show = () =>
      toast(`Câblé ${label}`, {
        id: CABLE_TOAST_ID,
        action: {
          label: "Annuler",
          onClick: () => {
            forgetCableChange();
            void disconnect({ cableId: cable.id }).catch(toastFailure);
          },
        },
        duration: UNDO_TOAST_MS,
      });
    show();
    rememberCableChange(show);
    return null;
  };

  /** Unplugs a manual cable and reports it as `label`. */
  const unplug = async (cableId: string, label: string) => {
    try {
      const removed = await disconnect({ cableId });
      if (!removed) return;
      const show = () =>
        toast(`${label} débranché`, {
          id: CABLE_TOAST_ID,
          // The same id and ends bring the cable back as it was.
          action: {
            label: "Annuler",
            onClick: () => {
              forgetCableChange();
              void connect(removed).catch(toastFailure);
            },
          },
          duration: UNDO_TOAST_MS,
        });
      show();
      rememberCableChange(show);
    } catch (error) {
      toastFailure(error);
    }
  };

  return { plug, unplug };
};

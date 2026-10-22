import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { ShortcutAction } from "@/lib/shortcuts";
import { isMac } from "@/lib/shortcuts";
import {
  isShortcutInputTarget,
  isShortcutMapTarget,
  isShortcutWidgetTarget,
  resolveShortcutIntent,
} from "@/lib/shortcut-intents";
import type { ShortcutIntentRegistration } from "@/lib/shortcut-intents";
import {
  OVERLAY_MODIFIER_KEY_BY_PLATFORM,
  OVERLAY_VISIBILITY_DELAY_MS,
} from "@/lib/constants";
import { useConnectionStore } from "@/store/useConnectionStore";
import { useMapStore } from "@/store/useMapStore";
import { useCanEdit } from "@/hooks/use-current-user";

type ShortcutEffect = ShortcutIntentRegistration & {
  run: (event: KeyboardEvent) => void;
};

type ShortcutIntentRegistry = {
  register: (effect: ShortcutEffect) => () => void;
};

type ShortcutIntentProviderProps = {
  children: ReactNode;
};

type UseShortcutIntentEffectOptions = {
  enabled?: boolean;
};

type ShortcutIntentEffectAdapter = {
  action: ShortcutAction;
  enabled?: boolean;
  run: (event: KeyboardEvent) => void;
};

const ShortcutIntentContext = createContext<ShortcutIntentRegistry | null>(
  null,
);

const DEFAULT_SHORTCUT_INTENT_EFFECT_OPTIONS: UseShortcutIntentEffectOptions =
  {};

const OVERLAY_MODIFIER_KEY = isMac
  ? OVERLAY_MODIFIER_KEY_BY_PLATFORM.mac
  : OVERLAY_MODIFIER_KEY_BY_PLATFORM.nonMac;

export function ShortcutIntentProvider({
  children,
}: ShortcutIntentProviderProps) {
  const effectsRef = useRef(new Map<string, ShortcutEffect>());
  const canEdit = useCanEdit();

  const register = useCallback((effect: ShortcutEffect) => {
    effectsRef.current.set(effect.id, effect);

    return () => {
      effectsRef.current.delete(effect.id);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const state = useMapStore.getState();
      const effects = Array.from(effectsRef.current.values());
      const match = resolveShortcutIntent({
        event,
        registrations: effects,
        runtime: {
          activeDrawTool: state.activeDrawTool,
          canEdit,
          currentFloorId: state.currentFloorId,
          isEditMode:
            state.isEditMode &&
            canEdit &&
            !useConnectionStore.getState().isMapFrozen,
          isInputFocused: isShortcutInputTarget(event.target),
          isWidgetFocused: isShortcutWidgetTarget(event.target),
          selectedDeviceId: state.selectedDeviceId,
          selectionCount: state.selectedDeviceIds.length,
          isMapFocused: isShortcutMapTarget(event.target),
        },
      });

      if (!match) {
        return;
      }

      const effect = effectsRef.current.get(match.registrationId);
      if (!effect?.enabled) {
        return;
      }

      event.preventDefault();
      effect.run(event);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [canEdit]);

  const contextValue = useMemo(() => ({ register }), [register]);

  return (
    <ShortcutIntentContext.Provider value={contextValue}>
      {children}
    </ShortcutIntentContext.Provider>
  );
}

export function useShortcutIntentEffect(
  action: ShortcutAction,
  run: (event: KeyboardEvent) => void,
  options: UseShortcutIntentEffectOptions = DEFAULT_SHORTCUT_INTENT_EFFECT_OPTIONS,
) {
  const registry = useContext(ShortcutIntentContext);
  const id = useId();
  const enabled = options.enabled ?? true;

  if (!registry) {
    throw new Error(
      "useShortcutIntentEffect must be used within ShortcutIntentProvider.",
    );
  }

  useEffect(() => {
    return registry.register({ action, enabled, id, run });
  }, [action, enabled, id, registry, run]);
}

export function useShortcutIntentEffects(
  effects: Array<ShortcutIntentEffectAdapter>,
) {
  const registry = useContext(ShortcutIntentContext);
  const idPrefix = useId();

  if (!registry) {
    throw new Error(
      "useShortcutIntentEffects must be used within ShortcutIntentProvider.",
    );
  }

  useEffect(() => {
    const unregister = effects.map((effect, index) =>
      registry.register({
        action: effect.action,
        enabled: effect.enabled ?? true,
        id: `${idPrefix}-${index}`,
        run: effect.run,
      }),
    );

    return () => {
      unregister.forEach((unregisterEffect) => unregisterEffect());
    };
  }, [effects, idPrefix, registry]);
}

/**
 * Whether the shortcut badges show: Ctrl (Cmd on macOS) held alone for
 * `delay`. Any other key, a click or the wheel cancels them until the
 * modifier is pressed again, so Ctrl+wheel and Ctrl+Z never flash them.
 *
 * Kept as native addEventListener — this tracks modifier hold state, not a hotkey.
 */
export function useOptionHeld(delay = OVERLAY_VISIBILITY_DELAY_MS) {
  const [isHeld, setIsHeld] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const clearPending = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const cancel = () => {
      clearPending();
      setIsVisible(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== OVERLAY_MODIFIER_KEY) {
        cancel();
        return;
      }
      if (event.repeat) return;
      setIsHeld(true);
      clearPending();
      timeoutId = setTimeout(() => {
        timeoutId = null;
        setIsVisible(true);
      }, delay);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === OVERLAY_MODIFIER_KEY) {
        setIsHeld(false);
        cancel();
      }
    };

    const handleBlur = () => {
      setIsHeld(false);
      cancel();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pointerdown", cancel, true);
    window.addEventListener("wheel", cancel, { capture: true, passive: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pointerdown", cancel, true);
      window.removeEventListener("wheel", cancel, { capture: true });
      clearPending();
    };
  }, [delay]);

  return { isHeld, isVisible };
}

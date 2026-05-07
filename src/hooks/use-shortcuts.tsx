import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { ShortcutAction } from "@/lib/shortcuts";
import { isMac } from "@/lib/shortcuts";
import {
  isShortcutInputTarget,
  isShortcutModalTarget,
  resolveShortcutIntent,
} from "@/lib/shortcut-intents";
import type { ShortcutIntentRegistration } from "@/lib/shortcut-intents";
import {
  OVERLAY_MODIFIER_KEY_BY_PLATFORM,
  OVERLAY_VISIBILITY_DELAY_MS,
} from "@/lib/constants";
import { useMapStore } from "@/store/useMapStore";

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
          currentFloorId: state.currentFloorId,
          isEditMode: state.isEditMode,
          isInputFocused: isShortcutInputTarget(event.target),
          isModalFocused: isShortcutModalTarget(event.target),
          selectedDeviceId: state.selectedDeviceId,
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
  }, []);

  return (
    <ShortcutIntentContext.Provider value={{ register }}>
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
 * Hook to track if the overlay modifier key is held.
 * Ctrl on Windows/Linux, Cmd on macOS.
 * Used for showing shortcuts overlay (Linear-style).
 *
 * Kept as native addEventListener — this tracks modifier hold state, not a hotkey.
 */
export function useOptionHeld(delay = OVERLAY_VISIBILITY_DELAY_MS) {
  const [isHeld, setIsHeld] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === OVERLAY_MODIFIER_KEY && !event.repeat) {
        setIsHeld(true);
        timeoutId = setTimeout(() => {
          setIsVisible(true);
        }, delay);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === OVERLAY_MODIFIER_KEY) {
        setIsHeld(false);
        setIsVisible(false);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      }
    };

    const handleBlur = () => {
      setIsHeld(false);
      setIsVisible(false);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [delay]);

  return { isHeld, isVisible };
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { ShortcutAction } from "@/lib/shortcuts";
import { matchesAction } from "@/lib/shortcuts";

type ShortcutHandler = () => void;

type ShortcutsContextValue = {
  /** Whether the Option key is being held down */
  isOptionHeld: boolean;
  /** Register a shortcut handler */
  registerShortcut: (action: ShortcutAction, handler: ShortcutHandler) => void;
  /** Unregister a shortcut handler */
  unregisterShortcut: (action: ShortcutAction) => void;
};

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

type ShortcutsProviderProps = {
  children: ReactNode;
};

export function ShortcutsProvider({ children }: ShortcutsProviderProps) {
  const [isOptionHeld, setIsOptionHeld] = useState(false);
  const [handlers] = useState(() => new Map<ShortcutAction, ShortcutHandler>());

  const registerShortcut = useCallback(
    (action: ShortcutAction, handler: ShortcutHandler) => {
      handlers.set(action, handler);
    },
    [handlers],
  );

  const unregisterShortcut = useCallback(
    (action: ShortcutAction) => {
      handlers.delete(action);
    },
    [handlers],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Track Option key state
      if (event.key === "Alt") {
        setIsOptionHeld(true);
        return;
      }

      // Ignore if user is typing in an input
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Check registered handlers
      // Pass ignoreAlt=true so shortcuts work even when Option is held (for showing hints)
      for (const [action, handler] of handlers.entries()) {
        if (matchesAction(event, action, true)) {
          event.preventDefault();
          handler();
          return;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") {
        setIsOptionHeld(false);
      }
    };

    // Handle window blur (user switched away while holding Option)
    const handleBlur = () => {
      setIsOptionHeld(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [handlers]);

  return (
    <ShortcutsContext.Provider
      value={{ isOptionHeld, registerShortcut, unregisterShortcut }}
    >
      {children}
    </ShortcutsContext.Provider>
  );
}

export function useShortcuts() {
  const context = useContext(ShortcutsContext);
  if (!context) {
    throw new Error("useShortcuts must be used within a ShortcutsProvider");
  }
  return context;
}

/**
 * Hook to register a shortcut handler for the component's lifecycle
 */
export function useShortcut(
  action: ShortcutAction,
  handler: ShortcutHandler,
  enabled = true,
) {
  const { registerShortcut, unregisterShortcut } = useShortcuts();

  useEffect(() => {
    if (!enabled) return;

    registerShortcut(action, handler);
    return () => unregisterShortcut(action);
  }, [action, handler, enabled, registerShortcut, unregisterShortcut]);
}

/**
 * Hook to check if option key is held (for showing shortcuts)
 */
export function useOptionHeld() {
  const { isOptionHeld } = useShortcuts();
  return isOptionHeld;
}

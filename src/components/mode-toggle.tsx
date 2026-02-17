import { HugeiconsIcon } from "@hugeicons/react";
import {
  ComputerPhoneSyncIcon,
  Moon01Icon,
  Sun01Icon,
} from "@hugeicons/core-free-icons";
import { Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShortcutHint } from "@/components/ui/shortcut-hint";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <div className="flex items-center gap-1.5">
        <ShortcutHint size="sm" action="cycle-theme" />
        <DropdownMenuTrigger className="flex h-8 w-8 items-center justify-center rounded-md ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:outline-hidden">
          {/* Light mode icon */}
          <HugeiconsIcon
            icon={Sun01Icon}
            className={cn(
              "h-4 w-4 transition-all",
              theme === "light"
                ? "scale-100 rotate-0"
                : theme === "dark"
                  ? "absolute scale-0 -rotate-90"
                  : "absolute scale-0 -rotate-90",
            )}
            strokeWidth={1.5}
          />
          {/* Dark mode icon */}
          <HugeiconsIcon
            icon={Moon01Icon}
            className={cn(
              "h-4 w-4 transition-all",
              theme === "dark"
                ? "scale-100 rotate-0"
                : "absolute scale-0 rotate-90",
            )}
            strokeWidth={1.5}
          />
          {/* System mode icon */}
          <HugeiconsIcon
            icon={ComputerPhoneSyncIcon}
            className={cn(
              "h-4 w-4 transition-all",
              theme === "system"
                ? "scale-100 rotate-0"
                : "absolute scale-0 rotate-90",
            )}
            strokeWidth={1.5}
          />
          <span className="sr-only">Changer le thème</span>
        </DropdownMenuTrigger>
      </div>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Sun01Icon}
              className="h-4 w-4"
              strokeWidth={1.5}
            />
            Clair
          </span>
          {theme === "light" ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              icon={Moon01Icon}
              className="h-4 w-4"
              strokeWidth={1.5}
            />
            Sombre
          </span>
          {theme === "dark" ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex items-center justify-between"
        >
          <span className="flex items-center gap-2">
            <HugeiconsIcon
              icon={ComputerPhoneSyncIcon}
              className="h-4 w-4"
              strokeWidth={1.5}
            />
            Système
          </span>
          {theme === "system" ? <Check className="h-4 w-4" /> : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

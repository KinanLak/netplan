import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Long enough to see the check mark, short enough to copy the next value.
const COPIED_MS = 1_200;

/**
 * Copies through the Clipboard API, or through a selection where the page is
 * served over plain HTTP, which a self-hosted install may well be.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    // Deprecated, but the only way left without the Clipboard API.
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
}

/**
 * A value with a copy button that shows on hover or focus and turns into a
 * check mark once copied: the confirmation is in place, never a toast.
 */
export function CopyValue({
  value,
  label,
  className,
}: {
  value: string;
  /** What is copied, for the button's name: « l'adresse IP ». */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    if (await copyText(value)) setCopied(true);
  };

  return (
    <span
      className={cn(
        "group/copy inline-flex min-w-0 items-center gap-1",
        className,
      )}
    >
      <span className="truncate font-mono" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? "Copié" : `Copier ${label}`}
        title={copied ? "Copié" : `Copier ${label}`}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-hidden hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          copied
            ? "text-up"
            : "pointer-fine:opacity-0 group-hover/copy:opacity-100 focus-visible:opacity-100",
        )}
      >
        <HugeiconsIcon
          icon={copied ? Tick02Icon : Copy01Icon}
          size={14}
          strokeWidth={1.75}
          className={cn(copied && "animate-in zoom-in-50")}
        />
      </button>
    </span>
  );
}

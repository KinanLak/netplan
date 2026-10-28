import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { cn } from "@/lib/utils";

/**
 * One short line led by an icon: what stays of a sentence once the interface
 * stops explaining itself (ADR 0041). Several stack as a list.
 */
export function IconNote({
  icon,
  tone = "muted",
  className,
  children,
}: {
  icon: IconSvgElement;
  tone?: "muted" | "warning" | "destructive";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "flex items-start gap-2 text-sm",
        tone === "muted" && "text-muted-foreground",
        tone === "warning" && "text-warning",
        tone === "destructive" && "text-destructive",
        className,
      )}
    >
      <HugeiconsIcon
        icon={icon}
        size={16}
        strokeWidth={1.5}
        className="mt-0.5 shrink-0"
      />
      <span>{children}</span>
    </p>
  );
}

export function IconNotes({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>{children}</div>
  );
}

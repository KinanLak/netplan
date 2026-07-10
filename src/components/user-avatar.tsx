import type { CSSProperties } from "react";
import { colorForHue } from "@/lib/identity";
import { cn } from "@/lib/utils";

const initialsForName = (displayName: string): string => {
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? (parts[1]?.[0] ?? "") : "";
  return `${first}${second}`.toUpperCase();
};

interface UserAvatarProps {
  displayName: string;
  colorHue: number;
  className?: string;
  style?: CSSProperties;
}

export function UserAvatar({
  displayName,
  colorHue,
  className,
  style,
}: UserAvatarProps) {
  return (
    <span
      className={cn(
        "flex items-center justify-center rounded-full border border-sidebar-border font-bold tracking-wide text-white shadow-sm",
        className,
      )}
      style={{ backgroundColor: colorForHue(colorHue, "label"), ...style }}
      title={displayName}
      aria-label={displayName}
    >
      {initialsForName(displayName)}
    </span>
  );
}

const SIZE_CLASSES = {
  md: "size-8 text-[10px]",
  sm: "size-6 text-[9px]",
} as const;

interface UserAvatarStackProps {
  users: ReadonlyArray<{
    clientId: string;
    displayName: string;
    colorHue: number;
  }>;
  max?: number;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export function UserAvatarStack({
  users,
  max = 5,
  size = "md",
  className,
}: UserAvatarStackProps) {
  const visible = users.slice(0, max);
  const hiddenCount = users.length - visible.length;
  const sizeClass = SIZE_CLASSES[size];

  return (
    <span
      className={cn(
        "flex flex-row-reverse items-center justify-end",
        className,
      )}
    >
      {hiddenCount > 0 ? (
        <span
          className={cn(
            "-ml-1.5 flex items-center justify-center rounded-full border border-sidebar-border bg-muted font-semibold text-muted-foreground shadow-sm",
            sizeClass,
          )}
          title={`${hiddenCount} autre${hiddenCount > 1 ? "s" : ""}`}
        >
          +{hiddenCount}
        </span>
      ) : null}
      {visible.toReversed().map((user, index) => (
        <UserAvatar
          key={user.clientId}
          displayName={user.displayName}
          colorHue={user.colorHue}
          className={cn("-ml-1.5", sizeClass)}
          style={{ zIndex: index + 1 }}
        />
      ))}
    </span>
  );
}

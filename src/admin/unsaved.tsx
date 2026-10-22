import { useBlocker } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Report = (section: string, dirty: boolean) => void;

const UnsavedContext = createContext<{
  report: Report;
  dirty: ReadonlySet<string>;
}>({ report: () => {}, dirty: new Set() });

/**
 * Holds which sections of a page have changes not saved yet, and asks before
 * leaving the page, by a link or by closing the tab, while one has.
 */
export function UnsavedChanges({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState<ReadonlySet<string>>(new Set());
  // One function for the page's life, so a section's effect runs only when
  // its own state changes.
  const [report] = useState<Report>(
    () => (section: string, isDirty: boolean) =>
      setDirty((current) => {
        if (current.has(section) === isDirty) return current;
        const next = new Set(current);
        if (isDirty) next.add(section);
        else next.delete(section);
        return next;
      }),
  );
  const blocker = useBlocker({
    shouldBlockFn: () => dirty.size > 0,
    enableBeforeUnload: () => dirty.size > 0,
    withResolver: true,
  });
  const sections = [...dirty].map((key) => `« ${labelOf(key)} »`);

  return (
    <UnsavedContext value={{ report, dirty }}>
      {children}
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitter sans enregistrer ?</AlertDialogTitle>
            <AlertDialogDescription>
              {sections.length > 1
                ? `Les modifications de ${sections.slice(0, -1).join(", ")} et ${sections.at(-1)} ne sont pas enregistrées.`
                : `Les modifications de ${sections[0] ?? "cette page"} ne sont pas enregistrées.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Rester</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => blocker.proceed?.()}
            >
              Quitter sans enregistrer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </UnsavedContext>
  );
}

// A key names the page's part (its anchor) and the section's own label.
const keyOf = (part: string, label: string) => `${part}\u0000${label}`;
const labelOf = (key: string) => key.split("\u0000")[1] ?? key;

/**
 * Tells the page whether the section `label`, in the part of the page whose
 * anchor is `part`, has changes not saved yet.
 */
export function useUnsavedSection(
  part: string,
  label: string,
  dirty: boolean,
): void {
  const { report } = useContext(UnsavedContext);
  const key = keyOf(part, label);
  useEffect(() => {
    report(key, dirty);
    return () => report(key, false);
  }, [report, key, dirty]);
}

/** Whether a section in the part of the page `part` has unsaved changes. */
export function useUnsavedPart(part: string): boolean {
  const { dirty } = useContext(UnsavedContext);
  return [...dirty].some((key) => key.startsWith(`${part}\u0000`));
}

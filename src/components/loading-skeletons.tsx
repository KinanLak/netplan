import { Skeleton } from "@/components/ui/skeleton";

/** Rows standing in for a list or a table while its query loads. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy className="space-y-3">
      <span className="sr-only">Chargement…</span>
      {Array.from({ length: rows }, (_, row) => (
        <Skeleton key={row} className="h-10 w-full" />
      ))}
    </div>
  );
}

/**
 * The map's frame while its site and buildings load: the sidebar's place and
 * an empty plan, so the page does not open white and then jump.
 */
export function MapSkeleton() {
  return (
    <div aria-busy className="flex h-screen w-screen bg-background">
      <span className="sr-only">Chargement du plan…</span>
      <div className="flex w-(--sidebar-width) shrink-0 flex-col gap-4 border-r bg-sidebar p-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-28" />
        <div className="mt-4 space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
          <Skeleton className="h-6 w-4/6" />
        </div>
      </div>
      <div className="flex-1" />
    </div>
  );
}

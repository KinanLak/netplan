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
      {/* The server renders it outside the sidebar's provider too. */}
      <div className="flex w-[var(--sidebar-width,16rem)] shrink-0 flex-col gap-4 border-r bg-sidebar p-4">
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

/**
 * A list page's frame (inventory, history) before its code runs: the server
 * renders it, so a slow link shows the page's shape instead of white.
 */
export function ListPageSkeleton() {
  return (
    <div className="flex h-svh flex-col bg-background">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-sidebar px-4">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="mx-auto w-full max-w-6xl p-4 md:p-8">
        <ListSkeleton />
      </div>
    </div>
  );
}

/** The administration's frame before its code runs: its menu and a list. */
export function AdminSkeleton() {
  return (
    <div className="flex h-svh flex-col bg-background md:flex-row">
      <div className="flex shrink-0 gap-2 border-b bg-sidebar p-2 md:w-56 md:flex-col md:border-r md:border-b-0 md:p-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="hidden h-6 w-full md:block" />
        <Skeleton className="hidden h-6 w-full md:block" />
      </div>
      <div className="mx-auto w-full max-w-4xl p-4 md:p-8">
        <ListSkeleton />
      </div>
    </div>
  );
}

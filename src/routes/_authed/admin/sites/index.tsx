import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { failureMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useNow } from "@/hooks/use-now";
import { FRESHNESS_DOT } from "@/sites/CollectionFreshness";
import { describeFreshness } from "@/sites/freshness";
import { INTEGRATION_LABELS } from "@/sites/integrations";
import { TimeZoneField } from "@/admin/TimeZoneField";
import { DEFAULT_TIMEZONE, siteNameError } from "@/sites/settings";
import { Pending } from "@/components/pending";
import { api } from "../../../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/admin/sites/")({
  head: () => ({ meta: [{ title: "Sites · Administration" }] }),
  // `?create` opens « Créer un site », for the links that offer it.
  validateSearch: (search: Record<string, unknown>): { create?: true } =>
    search.create === true || search.create === "true" ? { create: true } : {},
  component: SitesPage,
});

const count = (n: number, one: string, many: string) =>
  `${n} ${n > 1 ? many : one}`;

type SiteListing = FunctionReturnType<typeof api.sites.listSettings>[number];

/** A site at a glance: how fresh its data is, what it holds and reads. */
function SiteRow({ site, now }: { site: SiteListing; now: number }) {
  const freshness = useQuery(api.collection.freshness, { siteId: site.id });
  // An archived site is not collected: its age would only alarm.
  const status =
    freshness && !site.archived ? describeFreshness(freshness, now) : null;
  const tools = site.integrations.map(
    ({ kind, enabled }) =>
      `${INTEGRATION_LABELS[kind]}${enabled ? "" : " (suspendu)"}`,
  );
  return (
    <Link
      to="/admin/sites/$siteId"
      params={{ siteId: site.id }}
      className="flex items-center gap-4 rounded-lg px-4 py-3 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="flex items-center gap-2">
            <span className="font-medium">{site.name}</span>
            {site.archived ? <Badge variant="secondary">Archivé</Badge> : null}
          </span>
          {status ? (
            <span className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  FRESHNESS_DOT[status.tone],
                )}
              />
              <span className={cn(status.tone === "late" && "text-down")}>
                {status.headline}
              </span>
            </span>
          ) : null}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {/* An empty count says nothing a missing one would not. */}
          {site.buildingCount > 0 ? (
            <span>
              {[
                count(site.buildingCount, "bâtiment", "bâtiments"),
                site.floorCount > 0
                  ? count(site.floorCount, "étage", "étages")
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </span>
          ) : null}
          {tools.length > 0 ? <span>{tools.join(", ")}</span> : null}
          {tools.length > 0 && !site.automaticRefresh ? (
            <span>Collecte manuelle</span>
          ) : null}
          <span>{site.timezone}</span>
        </p>
      </div>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={16}
        strokeWidth={1.5}
        className="shrink-0 text-muted-foreground"
      />
    </Link>
  );
}

function SitesPage() {
  const sites = useQuery(api.sites.listSettings);
  const now = useNow(30_000);
  const { create } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const [creating, setCreating] = useState(create === true);
  // Opened once: the address stops asking, so a reload does not reopen it.
  useEffect(() => {
    if (create) void navigate({ search: {}, replace: true });
  }, [create, navigate]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Sites</h1>
        <Button onClick={() => setCreating(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          Créer un site
        </Button>
      </header>

      {sites === undefined ? (
        <Pending />
      ) : sites.length === 0 ? null : (
        <ul className="divide-y rounded-lg border">
          {/* Archived sites last: they are kept, not used. */}
          {sites
            .toSorted((a, b) => Number(a.archived) - Number(b.archived))
            .map((site) => (
              <li key={site.id}>
                <SiteRow site={site} now={now} />
              </li>
            ))}
        </ul>
      )}

      <CreateSiteDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function CreateSiteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createSite = useOnlineMutation(api.sites.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setTimezone(DEFAULT_TIMEZONE);
      setError(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = siteNameError(name);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const siteId = await createSite({ name, timezone });
      close(false);
      await navigate({ to: "/admin/sites/$siteId", params: { siteId } });
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form noValidate onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Créer un site</DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="new-site-name">Nom</FieldLabel>
              <Input
                id="new-site-name"
                value={name}
                autoFocus
                onChange={(event) => {
                  setName(event.target.value);
                  setError(null);
                }}
              />
            </Field>
            <TimeZoneField
              id="new-site-timezone"
              value={timezone}
              onChange={setTimezone}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Création…" : "Créer le site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

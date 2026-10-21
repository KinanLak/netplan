import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { api } from "../../../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/admin/sites/")({
  head: () => ({ meta: [{ title: "Sites · Administration" }] }),
  component: SitesPage,
});

const count = (n: number, one: string, many: string) =>
  n === 0 ? `Aucun ${one}` : n === 1 ? `1 ${one}` : `${n} ${many}`;

type SiteListing = FunctionReturnType<typeof api.sites.listSettings>[number];
type Freshness = FunctionReturnType<
  typeof api.health.overview
>[number]["freshness"];

/** A site at a glance: how fresh its data is, what it holds and reads. */
function SiteRow({
  site,
  freshness,
  now,
}: {
  site: SiteListing;
  freshness: Freshness | undefined;
  now: number;
}) {
  const status = freshness ? describeFreshness(freshness, now) : null;
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
          <span className="font-medium">{site.name}</span>
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
          <span>
            {count(site.buildingCount, "bâtiment", "bâtiments")},{" "}
            {count(site.floorCount, "étage", "étages").toLowerCase()}
          </span>
          <span>{count(site.deviceCount, "équipement", "équipements")}</span>
          <span>
            {tools.length === 0 ? "Aucune intégration" : tools.join(", ")}
          </span>
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
  const health = useQuery(api.health.overview);
  const now = useNow(30_000);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Sites</h1>
          <p className="text-sm text-muted-foreground">
            Chaque site a ses bâtiments, son fuseau horaire et ses intégrations.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          Nouveau site
        </Button>
      </header>

      {sites === undefined ? null : sites.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Aucun site. Créez-en un pour commencer son plan.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {sites.map((site) => (
            <li key={site.id}>
              <SiteRow
                site={site}
                freshness={health?.find((row) => row.id === site.id)?.freshness}
                now={now}
              />
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
  const createSite = useMutation(api.sites.create);
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
            <DialogTitle>Nouveau site</DialogTitle>
            <DialogDescription>
              Ses horaires de collecte suivent son fuseau horaire.
            </DialogDescription>
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

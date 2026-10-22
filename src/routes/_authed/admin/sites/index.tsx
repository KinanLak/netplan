import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
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
import { TimeZoneField } from "@/admin/TimeZoneField";
import { DEFAULT_TIMEZONE, siteNameError } from "@/sites/settings";
import { api } from "../../../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/admin/sites/")({
  head: () => ({ meta: [{ title: "Sites · Administration" }] }),
  component: SitesPage,
});

function SitesPage() {
  const sites = useQuery(api.sites.listSettings);
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
              <Link
                to="/admin/sites/$siteId"
                params={{ siteId: site.id }}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-muted sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              >
                <span className="font-medium">{site.name}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span>{site.timezone}</span>
                  <span>
                    {site.buildingCount === 0
                      ? "Aucun bâtiment"
                      : site.buildingCount === 1
                        ? "1 bâtiment"
                        : `${site.buildingCount} bâtiments`}
                  </span>
                  <span>
                    {site.automaticRefresh
                      ? "Collecte automatique"
                      : "Collecte manuelle"}
                  </span>
                </span>
              </Link>
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
        <form onSubmit={(event) => void submit(event)}>
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

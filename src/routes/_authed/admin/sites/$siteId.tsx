import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
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
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CollectionSection } from "@/admin/CollectionSection";
import { failureMessage } from "@/lib/errors";
import { IntegrationsSection } from "@/admin/IntegrationsSection";
import { NetBoxSettingsSection } from "@/admin/NetBoxSettingsSection";
import { LibreNMSSettingsSection } from "@/admin/LibreNMSSettingsSection";
import { TimeZoneField } from "@/admin/TimeZoneField";
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  WEEKDAYS,
  formatMinuteOfDay,
  parseMinuteOfDay,
  siteSettingsError,
} from "@/sites/settings";
import type { SiteSettings } from "@/sites/settings";
import { api } from "../../../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/admin/sites/$siteId")({
  head: () => ({ meta: [{ title: "Site · Administration" }] }),
  component: SitePage,
});

type Site = NonNullable<FunctionReturnType<typeof api.sites.getSettings>>;

function SitePage() {
  const { siteId } = Route.useParams();
  const site = useQuery(api.sites.getSettings, { siteId });

  if (site === undefined) return null;
  if (site === null) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Site introuvable</h1>
        <p className="text-sm text-muted-foreground">
          Ce site n'existe pas ou a été supprimé.
        </p>
        <Link
          to="/admin/sites"
          className="text-sm text-primary underline underline-offset-4"
        >
          Retour aux sites
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <Link
          to="/admin/sites"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Sites
        </Link>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{site.name}</h1>
          <Link
            to="/"
            search={{ site: site.id }}
            className={buttonVariants({ variant: "outline" })}
          >
            Voir le plan
          </Link>
        </div>
      </header>
      <SiteSettingsForm key={site.id} site={site} />
      <IntegrationsSection siteId={site.id} />
      <NetBoxSettingsSection siteId={site.id} />
      <LibreNMSSettingsSection siteId={site.id} />
      <CollectionSection siteId={site.id} />
      <DeleteSite site={site} />
    </div>
  );
}

type Draft = Omit<SiteSettings, "cadence"> & {
  businessIntervalMinutes: string;
  otherIntervalMinutes: string;
  businessStart: string;
  businessEnd: string;
  businessDays: Array<number>;
};

const toDraft = (site: Site): Draft => ({
  name: site.name,
  timezone: site.timezone,
  automaticRefresh: site.automaticRefresh,
  manualRefresh: site.manualRefresh,
  businessIntervalMinutes: String(site.cadence.businessIntervalMinutes),
  otherIntervalMinutes: String(site.cadence.otherIntervalMinutes),
  businessStart: formatMinuteOfDay(site.cadence.businessStartMinute),
  businessEnd: formatMinuteOfDay(site.cadence.businessEndMinute),
  businessDays: site.cadence.businessDays,
});

const fromDraft = (draft: Draft): SiteSettings | string => {
  const businessStartMinute = parseMinuteOfDay(draft.businessStart);
  const businessEndMinute = parseMinuteOfDay(draft.businessEnd);
  if (businessStartMinute === null || businessEndMinute === null) {
    return "Les heures ouvrées s'écrivent HH:MM.";
  }
  const settings: SiteSettings = {
    name: draft.name,
    timezone: draft.timezone,
    automaticRefresh: draft.automaticRefresh,
    manualRefresh: draft.manualRefresh,
    cadence: {
      businessIntervalMinutes: Number(draft.businessIntervalMinutes),
      otherIntervalMinutes: Number(draft.otherIntervalMinutes),
      businessStartMinute,
      businessEndMinute,
      businessDays: [...draft.businessDays].sort((a, b) => a - b),
    },
  };
  return siteSettingsError(settings) ?? settings;
};

function SiteSettingsForm({ site }: { site: Site }) {
  const update = useMutation(api.sites.update);
  const [draft, setDraft] = useState(() => toDraft(site));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setSaved(false);
    setError(null);
  };

  const toggleDay = (day: number) =>
    change({
      businessDays: draft.businessDays.includes(day)
        ? draft.businessDays.filter((other) => other !== day)
        : [...draft.businessDays, day],
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const settings = fromDraft(draft);
    if (typeof settings === "string") {
      setError(settings);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await update({ siteId: site.id, ...settings });
      setSaved(true);
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  return (
    // The form checks itself, so its errors read in French whatever the
    // browser's language.
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="space-y-8"
    >
      <FieldSet>
        <FieldLegend>Général</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="site-name">Nom</FieldLabel>
            <Input
              id="site-name"
              value={draft.name}
              onChange={(event) => change({ name: event.target.value })}
            />
          </Field>
          <TimeZoneField
            id="site-timezone"
            value={draft.timezone}
            onChange={(timezone) => change({ timezone })}
          />
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Collecte</FieldLegend>
        <FieldDescription>
          NetPlan interroge les intégrations du site à ce rythme, à l'heure du
          site.
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <input
              id="site-automatic"
              type="checkbox"
              className="size-4 accent-primary"
              checked={draft.automaticRefresh}
              onChange={(event) =>
                change({ automaticRefresh: event.target.checked })
              }
            />
            <FieldLabel htmlFor="site-automatic">
              Collecte automatique
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <input
              id="site-manual"
              type="checkbox"
              className="size-4 accent-primary"
              checked={draft.manualRefresh}
              onChange={(event) =>
                change({ manualRefresh: event.target.checked })
              }
            />
            <FieldLabel htmlFor="site-manual">
              Les éditeurs peuvent lancer une actualisation
            </FieldLabel>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="site-business-start">
                Début des heures ouvrées
              </FieldLabel>
              <Input
                id="site-business-start"
                type="time"
                value={draft.businessStart}
                onChange={(event) =>
                  change({ businessStart: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="site-business-end">
                Fin des heures ouvrées
              </FieldLabel>
              <Input
                id="site-business-end"
                type="time"
                value={draft.businessEnd}
                onChange={(event) =>
                  change({ businessEnd: event.target.value })
                }
              />
            </Field>
          </div>

          <Field>
            <FieldLabel>Jours ouvrés</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ day, label, short }) => {
                const on = draft.businessDays.includes(day);
                return (
                  <Button
                    key={day}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    aria-pressed={on}
                    aria-label={label}
                    onClick={() => toggleDay(day)}
                  >
                    {short}
                  </Button>
                );
              })}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="site-business-interval">
                Intervalle en heures ouvrées (minutes)
              </FieldLabel>
              <Input
                id="site-business-interval"
                type="number"
                min={MIN_INTERVAL_MINUTES}
                max={MAX_INTERVAL_MINUTES}
                value={draft.businessIntervalMinutes}
                onChange={(event) =>
                  change({ businessIntervalMinutes: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="site-other-interval">
                Intervalle le reste du temps (minutes)
              </FieldLabel>
              <Input
                id="site-other-interval"
                type="number"
                min={MIN_INTERVAL_MINUTES}
                max={MAX_INTERVAL_MINUTES}
                value={draft.otherIntervalMinutes}
                onChange={(event) =>
                  change({ otherIntervalMinutes: event.target.value })
                }
              />
            </Field>
          </div>
        </FieldGroup>
      </FieldSet>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {saved ? (
          <span role="status" className="text-sm text-muted-foreground">
            Enregistré.
          </span>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </form>
  );
}

function DeleteSite({ site }: { site: Site }) {
  const remove = useMutation(api.sites.remove);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blocked = site.buildingCount > 0;

  const confirm = async () => {
    setError(null);
    try {
      await remove({ siteId: site.id });
      setOpen(false);
      await navigate({ to: "/admin/sites" });
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    }
  };

  return (
    <section className="space-y-2 border-t pt-6">
      <h2 className="font-medium">Supprimer le site</h2>
      <p className="text-sm text-muted-foreground">
        {blocked
          ? "Ce site a encore des bâtiments. Supprimez-les d'abord : un site ne part jamais avec son plan."
          : "Le site n'a aucun bâtiment ; le supprimer ne retire rien du plan."}
      </p>
      <Button
        variant="destructive"
        disabled={blocked}
        onClick={() => setOpen(true)}
      >
        Supprimer le site
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {site.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le site disparaît du sélecteur de tous les utilisateurs, avec ses
              intégrations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirm()}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

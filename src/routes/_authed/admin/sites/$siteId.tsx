import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
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
import { BuildingsSection } from "@/admin/BuildingsSection";
import { SITE_PARTS, SiteNav } from "@/admin/SiteNav";
import { SiteSetupSteps } from "@/admin/SiteSetupSteps";
import { UnsavedChanges, useUnsavedSection } from "@/admin/unsaved";
import { useFlash } from "@/hooks/use-flash";
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  WEEKDAYS,
  formatMinuteOfDay,
  INTERVAL_RANGE,
  SITE_NAME_TAKEN,
  parseMinuteOfDay,
  siteSettingsProblem,
} from "@/sites/settings";
import type { SiteField, SiteProblem, SiteSettings } from "@/sites/settings";
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
    <UnsavedChanges>
      <SiteContent site={site} />
    </UnsavedChanges>
  );
}

function SiteContent({ site }: { site: Site }) {
  const integrations = useQuery(api.integrations.listForSite, {
    siteId: site.id,
  });
  // Correspondances only exist for a connected tool.
  const parts = SITE_PARTS.filter(
    (part) => part.id !== "correspondances" || (integrations?.length ?? 0) > 0,
  );
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
      <SiteNav parts={parts} />
      <SiteSetupSteps siteId={site.id} buildingCount={site.buildingCount} />
      <div id="general" className="scroll-mt-14">
        <SiteSettingsForm key={site.id} site={site} />
      </div>
      <div id="integrations" className="scroll-mt-14">
        <IntegrationsSection siteId={site.id} />
      </div>
      <div id="correspondances" className="scroll-mt-14 space-y-8">
        <NetBoxSettingsSection siteId={site.id} />
        <LibreNMSSettingsSection siteId={site.id} />
      </div>
      <BuildingsSection siteId={site.id} />
      <div id="collections" className="scroll-mt-14">
        <CollectionSection siteId={site.id} />
      </div>
      <div id="danger" className="scroll-mt-14">
        <DeleteSite site={site} />
      </div>
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

const fromDraft = (draft: Draft): SiteSettings | SiteProblem => {
  const businessStartMinute = parseMinuteOfDay(draft.businessStart);
  const businessEndMinute = parseMinuteOfDay(draft.businessEnd);
  if (businessStartMinute === null || businessEndMinute === null) {
    return {
      field: "businessHours",
      message: "Les heures ouvrées s'écrivent HH:MM.",
    };
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
  return siteSettingsProblem(settings) ?? settings;
};

// The field that takes focus for each problem.
const FIELD_INPUT: Record<SiteField, string> = {
  name: "site-name",
  timezone: "site-timezone",
  businessIntervalMinutes: "site-business-interval",
  otherIntervalMinutes: "site-other-interval",
  businessHours: "site-business-start",
  businessDays: "site-day-1",
};

const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify({ ...a, businessDays: a.businessDays.toSorted() }) ===
  JSON.stringify({ ...b, businessDays: b.businessDays.toSorted() });

function SiteSettingsForm({ site }: { site: Site }) {
  const update = useMutation(api.sites.update);
  const [draft, setDraft] = useState(() => toDraft(site));
  // What the form last read or saved. A draft left untouched follows another
  // admin's save; a touched one is theirs to keep or drop.
  const [baseline, setBaseline] = useState(() => toDraft(site));
  const live = toDraft(site);
  if (!sameDraft(live, baseline) && sameDraft(draft, baseline)) {
    setBaseline(live);
    setDraft(live);
  }
  const [problem, setProblem] = useState<
    (SiteProblem | { field: null; message: string }) | null
  >(null);
  const [saved, flashSaved] = useFlash();
  const [pending, setPending] = useState(false);
  const dirty = !sameDraft(draft, baseline);
  useUnsavedSection("general", "Général", dirty);

  const change = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setProblem(null);
  };

  const toggleDay = (day: number) =>
    change({
      businessDays: draft.businessDays.includes(day)
        ? draft.businessDays.filter((other) => other !== day)
        : [...draft.businessDays, day],
    });

  // A field refused while saving is focused once the form is enabled again:
  // a disabled field takes no focus.
  const focusAfterSave = useRef<SiteField | null>(null);
  useEffect(() => {
    if (pending || focusAfterSave.current === null) return;
    document.getElementById(FIELD_INPUT[focusAfterSave.current])?.focus();
    focusAfterSave.current = null;
  }, [pending]);

  const refuse = (found: SiteProblem, whileSaving = false) => {
    setProblem(found);
    if (whileSaving) focusAfterSave.current = found.field;
    else document.getElementById(FIELD_INPUT[found.field])?.focus();
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const settings = fromDraft(draft);
    if ("field" in settings) {
      refuse(settings);
      return;
    }
    setPending(true);
    setProblem(null);
    try {
      await update({ siteId: site.id, ...settings });
      // As the server stores it: a trimmed name, intervals as numbers.
      const stored = toDraft({
        ...site,
        ...settings,
        name: settings.name.trim(),
      });
      setBaseline(stored);
      setDraft(stored);
      flashSaved();
    } catch (failure) {
      const message = failureMessage(failure, "admin");
      if (message === SITE_NAME_TAKEN) refuse({ field: "name", message }, true);
      else setProblem({ field: null, message });
    } finally {
      setPending(false);
    }
  };

  const errorOf = (field: SiteField) =>
    problem?.field === field ? problem.message : null;
  const invalid = (field: SiteField, id: string) => ({
    "aria-invalid": errorOf(field) !== null,
    "aria-describedby": errorOf(field) ? `${id}-error` : undefined,
  });
  const error = (field: SiteField, id: string) =>
    errorOf(field) ? (
      <FieldError id={`${id}-error`}>{errorOf(field)}</FieldError>
    ) : null;

  return (
    // The form checks itself, so its errors read in French whatever the
    // browser's language.
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="space-y-8"
    >
      {/* Locked while saving: the answer resets the form to what it sent. */}
      <FieldSet disabled={pending}>
        <FieldLegend>Général</FieldLegend>
        <FieldGroup>
          <Field data-invalid={errorOf("name") !== null}>
            <FieldLabel htmlFor="site-name">Nom</FieldLabel>
            <Input
              id="site-name"
              value={draft.name}
              {...invalid("name", "site-name")}
              onChange={(event) => change({ name: event.target.value })}
            />
            {error("name", "site-name")}
          </Field>
          <TimeZoneField
            id="site-timezone"
            value={draft.timezone}
            error={errorOf("timezone")}
            onChange={(timezone) => change({ timezone })}
          />
        </FieldGroup>
      </FieldSet>

      <FieldSet disabled={pending}>
        <FieldLegend>Collecte</FieldLegend>
        <FieldDescription>
          NetPlan interroge les intégrations du site à ce rythme, à l'heure du
          site.
        </FieldDescription>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox
              id="site-automatic"
              disabled={pending}
              checked={draft.automaticRefresh}
              onCheckedChange={(checked) =>
                change({ automaticRefresh: checked })
              }
            />
            <FieldLabel htmlFor="site-automatic">
              Collecte automatique
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="site-manual"
              disabled={pending}
              checked={draft.manualRefresh}
              onCheckedChange={(checked) => change({ manualRefresh: checked })}
            />
            <FieldLabel htmlFor="site-manual">
              Les éditeurs peuvent lancer une actualisation
            </FieldLabel>
          </Field>

          <div className="space-y-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={errorOf("businessHours") !== null}>
                <FieldLabel htmlFor="site-business-start">
                  Début des heures ouvrées
                </FieldLabel>
                <Input
                  id="site-business-start"
                  type="time"
                  value={draft.businessStart}
                  {...invalid("businessHours", "site-business-hours")}
                  onChange={(event) =>
                    change({ businessStart: event.target.value })
                  }
                />
              </Field>
              <Field data-invalid={errorOf("businessHours") !== null}>
                <FieldLabel htmlFor="site-business-end">
                  Fin des heures ouvrées
                </FieldLabel>
                <Input
                  id="site-business-end"
                  type="time"
                  value={draft.businessEnd}
                  {...invalid("businessHours", "site-business-hours")}
                  onChange={(event) =>
                    change({ businessEnd: event.target.value })
                  }
                />
              </Field>
            </div>
            {error("businessHours", "site-business-hours")}
          </div>

          <Field data-invalid={errorOf("businessDays") !== null}>
            <FieldLabel>Jours ouvrés</FieldLabel>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map(({ day, label, short }) => {
                const on = draft.businessDays.includes(day);
                return (
                  <Button
                    key={day}
                    id={`site-day-${day}`}
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
            {error("businessDays", "site-days")}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [
                  "businessIntervalMinutes",
                  "site-business-interval",
                  "Intervalle en heures ouvrées (minutes)",
                ],
                [
                  "otherIntervalMinutes",
                  "site-other-interval",
                  "Intervalle le reste du temps (minutes)",
                ],
              ] as const
            ).map(([field, id, label]) => (
              <Field key={field} data-invalid={errorOf(field) !== null}>
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
                <Input
                  id={id}
                  type="number"
                  min={MIN_INTERVAL_MINUTES}
                  max={MAX_INTERVAL_MINUTES}
                  value={draft[field]}
                  {...invalid(field, id)}
                  onChange={(event) => change({ [field]: event.target.value })}
                />
                {error(field, id) ?? (
                  <FieldDescription>
                    {INTERVAL_RANGE.charAt(0).toUpperCase()}
                    {INTERVAL_RANGE.slice(1)}.
                  </FieldDescription>
                )}
              </Field>
            ))}
          </div>
        </FieldGroup>
      </FieldSet>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || (!dirty && !problem)}>
          {pending
            ? "Enregistrement…"
            : saved && !dirty
              ? "Enregistré"
              : "Enregistrer"}
        </Button>
        {problem?.field === null ? (
          <FieldError>{problem.message}</FieldError>
        ) : null}
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
      // The page it leaves is gone: nothing unsaved is left to warn about.
      await navigate({ to: "/admin/sites", ignoreBlocker: true });
      // The list it lands on no longer names it.
      toast.success(`Site « ${site.name} » supprimé.`);
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    }
  };

  return (
    <section className="space-y-2 border-t pt-6">
      <h2 className="font-medium">Supprimer le site</h2>
      {blocked ? (
        <p className="text-sm text-muted-foreground">
          Ce site a encore{" "}
          {site.buildingCount === 1
            ? "un bâtiment"
            : `${site.buildingCount} bâtiments`}
          , listés plus haut. Supprimez-les d'abord{" "}
          <Link
            to="/"
            search={{ site: site.id }}
            className="underline underline-offset-4 hover:text-foreground"
          >
            sur le plan
          </Link>{" "}
          : un site ne part jamais avec son plan.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Le site n'a aucun bâtiment ; le supprimer ne retire rien du plan.
        </p>
      )}
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

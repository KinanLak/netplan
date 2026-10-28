import {
  Link,
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { Archive02Icon, LockIcon } from "@hugeicons/core-free-icons";
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
import { IconNote } from "@/components/icon-note";
import {
  Field,
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
import { useNow } from "@/hooks/use-now";
import { Time } from "@/components/time";
import {
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  SITE_NAME_TAKEN,
  siteSettingsProblem,
} from "@/sites/settings";
import type { SiteField, SiteProblem, SiteSettings } from "@/sites/settings";
import { Pending } from "@/components/pending";
import { api } from "../../../../../convex/_generated/api";

export const Route = createFileRoute("/_authed/admin/sites/$siteId")({
  head: () => ({ meta: [{ title: "Site · Administration" }] }),
  component: SitePage,
});

type Site = NonNullable<FunctionReturnType<typeof api.sites.getSettings>>;

function SitePage() {
  const { siteId } = Route.useParams();
  const site = useQuery(api.sites.getSettings, { siteId });

  if (site === undefined) return <Pending />;
  if (site === null) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Site introuvable</h1>
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
  const { hash } = useLocation();
  // A link from Santé names a part of the page; its sections, and the setup
  // card above them, load after the router's own scroll.
  const setupQueries = [
    useQuery(api.netbox.settings, { siteId: site.id }),
    useQuery(api.librenms.settings, { siteId: site.id }),
    useQuery(api.collection.freshness, { siteId: site.id }),
  ];
  const loaded =
    integrations !== undefined &&
    setupQueries.every((answer) => answer !== undefined);
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash)?.scrollIntoView();
  }, [loaded, hash]);
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
      {site.archived ? <ArchivedNotice site={site} /> : null}
      <SiteNav parts={parts} />
      {site.archived ? null : (
        <SiteSetupSteps siteId={site.id} buildingCount={site.buildingCount} />
      )}
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
        <DangerZone site={site} />
      </div>
    </div>
  );
}

type Draft = Omit<SiteSettings, "intervalMinutes"> & {
  intervalMinutes: string;
};

const toDraft = (site: Site): Draft => ({
  name: site.name,
  timezone: site.timezone,
  automaticRefresh: site.automaticRefresh,
  manualRefresh: site.manualRefresh,
  intervalMinutes: String(site.intervalMinutes),
});

const fromDraft = (draft: Draft): SiteSettings | SiteProblem => {
  const settings: SiteSettings = {
    ...draft,
    intervalMinutes: Number(draft.intervalMinutes),
  };
  return siteSettingsProblem(settings) ?? settings;
};

// The field that takes focus for each problem.
const FIELD_INPUT: Record<SiteField, string> = {
  name: "site-name",
  timezone: "site-timezone",
  intervalMinutes: "site-interval",
};

const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify(a) === JSON.stringify(b);

function SiteSettingsForm({ site }: { site: Site }) {
  const update = useOnlineMutation(api.sites.update);
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
              Autoriser les éditeurs à actualiser
            </FieldLabel>
          </Field>

          <Field
            data-invalid={errorOf("intervalMinutes") !== null}
            className="max-w-xs"
          >
            <FieldLabel htmlFor="site-interval">
              Intervalle (minutes)
            </FieldLabel>
            <Input
              id="site-interval"
              type="number"
              min={MIN_INTERVAL_MINUTES}
              max={MAX_INTERVAL_MINUTES}
              value={draft.intervalMinutes}
              {...invalid("intervalMinutes", "site-interval")}
              onChange={(event) =>
                change({ intervalMinutes: event.target.value })
              }
            />
            {error("intervalMinutes", "site-interval")}
          </Field>
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

/** An archived site, at the top of its page, with the way back. */
function ArchivedNotice({ site }: { site: Site }) {
  const now = useNow(60_000);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning bg-warning-background p-3">
      <IconNote icon={Archive02Icon} className="text-foreground">
        Site archivé{" "}
        {site.archivedAt === null ? null : (
          <Time at={site.archivedAt} now={now} format="age" />
        )}
      </IconNote>
      <SetArchivedButton site={site} archived={false} />
    </div>
  );
}

function SetArchivedButton({
  site,
  archived,
}: {
  site: Site;
  archived: boolean;
}) {
  const setArchived = useOnlineMutation(api.sites.setArchived);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const run = async () => {
    setPending(true);
    setError(null);
    try {
      await setArchived({ siteId: site.id, archived });
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={archived ? "default" : "sm"}
        disabled={pending}
        onClick={() => (archived ? setConfirming(true) : void run())}
      >
        {archived ? "Archiver le site" : "Désarchiver le site"}
      </Button>
      {error ? <FieldError>{error}</FieldError> : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver « {site.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Plus personne ne peut modifier son plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void run();
              }}
            >
              Archiver le site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Archiving keeps a site that is no longer used, plan and all (C8); deleting
 * waits for its buildings to be gone.
 */
function DangerZone({ site }: { site: Site }) {
  return (
    <section
      aria-label="Archivage et suppression"
      className="space-y-3 border-t pt-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        {site.archived ? null : <SetArchivedButton site={site} archived />}
        <DeleteSite site={site} />
      </div>
      {site.buildingCount > 0 ? (
        <IconNote icon={LockIcon}>
          Supprimez d'abord{" "}
          {site.buildingCount === 1
            ? "son bâtiment"
            : `ses ${site.buildingCount} bâtiments`}{" "}
          <Link
            to="/"
            search={{ site: site.id }}
            className="ms-1 text-primary underline-offset-4 hover:underline"
          >
            Ouvrir le plan
          </Link>
        </IconNote>
      ) : null}
    </section>
  );
}

function DeleteSite({ site }: { site: Site }) {
  const remove = useOnlineMutation(api.sites.remove);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setError(null);
    try {
      await remove({ siteId: site.id });
      setOpen(false);
      // The page it leaves is gone: nothing unsaved is left to warn about.
      await navigate({ to: "/admin/sites", ignoreBlocker: true });
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    }
  };

  return (
    <>
      <Button
        variant="destructive"
        disabled={site.buildingCount > 0}
        onClick={() => setOpen(true)}
      >
        Supprimer le site
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {site.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le site et ses intégrations sont définitivement supprimés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* In the dialog, which a refusal keeps open. */}
          {error ? <FieldError>{error}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirm()}
            >
              Supprimer le site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

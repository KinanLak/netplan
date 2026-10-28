import { useAction, useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import { Fragment, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { Alert02Icon, Key01Icon, TextIcon } from "@hugeicons/core-free-icons";
import { IconNote, IconNotes } from "@/components/icon-note";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { failureMessage } from "@/lib/errors";
import { useUnsavedSection } from "@/admin/unsaved";
import { getDeviceKindLabel } from "@/devices/deviceKindRegistry";
import { NETBOX_ROLE_TYPES } from "@/sites/netbox";
import { PUSH_FIELDS } from "@/sites/netboxPush";
import type {
  NetBoxRoleType,
  NetBoxSettings,
  NetBoxSite,
} from "@/sites/netbox";
import { api } from "../../convex/_generated/api";

type Options = Exclude<
  FunctionReturnType<typeof api.sources.netboxChoices>,
  { error: string }
>;

const IGNORE = "ignore";
const NO_SITE = "none";
type RoleChoice = NetBoxRoleType | typeof IGNORE;

const typeItems: Array<{ value: RoleChoice; label: string }> = [
  { value: IGNORE, label: "Ignorer" },
  ...NETBOX_ROLE_TYPES.map((type) => ({
    value: type,
    label: getDeviceKindLabel(type),
  })),
];

/** The NetBox site a site imports and the Netplan type of each role. */
export function NetBoxSettingsSection({ siteId }: { siteId: string }) {
  const settings = useQuery(api.netbox.settings, { siteId });
  const loadOptions = useAction(api.sources.netboxChoices);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!settings) return null;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const answer = await loadOptions({ siteId });
      if ("error" in answer) setError(answer.error);
      else setOptions(answer);
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="space-y-4 border-t pt-6">
      <h2 className="font-medium">Import NetBox</h2>
      {options ? (
        <SettingsForm
          siteId={siteId}
          settings={settings}
          options={options}
          onDone={() => setOptions(null)}
        />
      ) : (
        <>
          <Summary settings={settings} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading
                ? "Lecture de NetBox…"
                : settings.site === null
                  ? "Choisir le site NetBox"
                  : settings.roles.length === 0
                    ? "Choisir les rôles à importer"
                    : "Modifier l'import"}
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        </>
      )}
      <PushSetting
        siteId={siteId}
        push={settings.push === true}
        ready={settings.site !== null && settings.roles.length > 0}
      />
    </section>
  );
}

/**
 * The push of observed locations to NetBox custom fields (ADR 0027). It
 * writes to a real NetBox, so turning it on is confirmed, and it waits for a
 * NetBox site and role: without them nothing is imported, so nothing written.
 */
function PushSetting({
  siteId,
  push,
  ready,
}: {
  siteId: string;
  push: boolean;
  ready: boolean;
}) {
  const setPush = useOnlineMutation(api.netbox.setPush);
  const imported = useQuery(api.netbox.importedCount, { siteId });
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const change = async (next: boolean) => {
    setPending(true);
    setError(null);
    try {
      await setPush({ siteId, push: next });
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  // Nothing is imported yet, so nothing could be written: the import's own
  // button above is the way in.
  if (!push && !ready) return null;

  return (
    <div className="space-y-2 border-t pt-4">
      <Field orientation="horizontal">
        <Checkbox
          id="netbox-push"
          checked={push}
          disabled={pending}
          onCheckedChange={(checked) => {
            if (checked) setConfirming(true);
            else void change(false);
          }}
        />
        <FieldLabel htmlFor="netbox-push">
          Écrire dans NetBox où le réseau voit chaque équipement
        </FieldLabel>
      </Field>
      {error ? <FieldError>{error}</FieldError> : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Écrire dans NetBox ?</AlertDialogTitle>
            <AlertDialogDescription>
              {imported === undefined || imported === 0
                ? "NetPlan modifiera les équipements importés de NetBox."
                : imported === 1
                  ? "NetPlan modifiera l'équipement importé de NetBox."
                  : `NetPlan modifiera les ${imported} équipements importés de NetBox.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {/* Without them every write is refused. */}
          <IconNotes>
            <IconNote icon={Key01Icon}>
              Requiert un jeton qui peut modifier les équipements
            </IconNote>
            <IconNote icon={TextIcon}>
              Requiert les champs personnalisés{" "}
              {PUSH_FIELDS.map((field, index) => (
                <Fragment key={field.name}>
                  {index > 0 ? ", " : null}
                  <code className="font-mono text-xs">{field.name}</code>
                </Fragment>
              ))}
            </IconNote>
          </IconNotes>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void change(true);
              }}
            >
              Écrire dans NetBox
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** What is imported; the button under it says what is missing. */
function Summary({ settings }: { settings: NetBoxSettings }) {
  if (!settings.site) return null;
  return (
    <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Site NetBox</dt>
      <dd>{settings.site.name}</dd>
      {settings.roles.map((role) => (
        <Fragment key={role.id}>
          <dt className="text-muted-foreground">{role.name}</dt>
          <dd>{getDeviceKindLabel(role.type)}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SettingsForm({
  siteId,
  settings,
  options,
  onDone,
}: {
  siteId: string;
  settings: NetBoxSettings;
  options: Options;
  onDone: () => void;
}) {
  const save = useOnlineMutation(api.netbox.saveSettings);
  const [site, setSite] = useState<NetBoxSite | null>(
    options.sites.find((choice) => choice.id === settings.site?.id) ?? null,
  );
  const [types, setTypes] = useState<Record<number, RoleChoice>>(() =>
    Object.fromEntries(settings.roles.map((role) => [role.id, role.type])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTypes = new Map<number, RoleChoice>(
    settings.roles.map((role) => [role.id, role.type]),
  );
  // Against what the form opened on: a site gone from NetBox opens empty.
  const [openedSiteId] = useState(() => site?.id ?? null);
  useUnsavedSection(
    "correspondances",
    "Import NetBox",
    (site?.id ?? null) !== openedSiteId ||
      options.roles.some(
        (role) =>
          (types[role.id] ?? IGNORE) !== (savedTypes.get(role.id) ?? IGNORE),
      ),
  );

  const listed = new Set(options.roles.map((role) => role.id));
  const gone = settings.roles.filter((role) => !listed.has(role.id));
  const siteGone =
    settings.site !== null &&
    !options.sites.some((choice) => choice.id === settings.site?.id);
  const siteItems = [
    { value: NO_SITE, label: "Aucun" },
    ...options.sites.map((choice) => ({
      value: String(choice.id),
      label: choice.name,
    })),
  ];

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await save({
        siteId,
        baseUrl: options.baseUrl,
        settings: {
          site,
          roles: options.roles.flatMap((role) => {
            const type = types[role.id] ?? IGNORE;
            return type === IGNORE
              ? []
              : [{ id: role.id, name: role.name, type }];
          }),
        },
      });
      onDone();
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      noValidate
      className="space-y-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field>
        <FieldLabel htmlFor="netbox-site">Site NetBox</FieldLabel>
        <Select
          items={siteItems}
          value={site ? String(site.id) : NO_SITE}
          onValueChange={(value) =>
            setSite(
              options.sites.find((choice) => String(choice.id) === value) ??
                null,
            )
          }
        >
          <SelectTrigger id="netbox-site" className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {siteItems.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {siteGone ? (
          <IconNote icon={Alert02Icon} tone="destructive">
            « {settings.site?.name} » n'existe plus dans NetBox
          </IconNote>
        ) : null}
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Rôles NetBox</legend>
        {options.roles.map((role) => (
          <div
            key={role.id}
            className="flex items-center justify-between gap-4 text-sm"
          >
            <span
              // Each level of the role tree is indented.
              style={{ paddingInlineStart: `${role.depth * 1.25}rem` }}
            >
              {role.name}
            </span>
            <Select
              items={typeItems}
              value={types[role.id] ?? IGNORE}
              onValueChange={(value) => {
                if (value) setTypes((all) => ({ ...all, [role.id]: value }));
              }}
            >
              <SelectTrigger
                aria-label={`Type des équipements « ${role.name} »`}
                className="w-48"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {typeItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        {/* Saving drops them: a mapping lost without a word. */}
        {gone.length > 0 ? (
          <IconNote icon={Alert02Icon} tone="warning">
            {gone.map((role) => `« ${role.name} »`).join(", ")}{" "}
            {gone.length > 1
              ? "n'existent plus dans NetBox"
              : "n'existe plus dans NetBox"}
          </IconNote>
        ) : null}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onDone}
        >
          Annuler
        </Button>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </form>
  );
}

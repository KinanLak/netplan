import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { failureMessage } from "@/lib/errors";
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
  FunctionReturnType<typeof api.netbox.options>,
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
  const loadOptions = useAction(api.netbox.options);
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
      <div className="space-y-1">
        <h2 className="font-medium">Import NetBox</h2>
        <p className="text-sm text-muted-foreground">
          Netplan importe les équipements du site NetBox choisi dont le rôle a
          un type ; les autres rôles sont ignorés.
        </p>
      </div>
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
              {loading ? "Lecture de NetBox…" : "Modifier"}
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        </>
      )}
      <PushSetting siteId={siteId} push={settings.push === true} />
    </section>
  );
}

/** The push of observed locations to NetBox custom fields (ADR 0027). */
function PushSetting({ siteId, push }: { siteId: string; push: boolean }) {
  const setPush = useMutation(api.netbox.setPush);
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

  return (
    <div className="space-y-2 border-t pt-4">
      <Field orientation="horizontal">
        <input
          id="netbox-push"
          type="checkbox"
          className="size-4 accent-primary"
          checked={push}
          disabled={pending}
          onChange={(event) => void change(event.target.checked)}
        />
        <FieldLabel htmlFor="netbox-push">
          Écrire dans NetBox où le réseau voit chaque équipement
        </FieldLabel>
      </Field>
      <FieldDescription>
        Après chaque collecte, Netplan écrit la prise, l'étage, le port de
        switch et la dernière observation des équipements importés de NetBox
        dans leurs champs personnalisés{" "}
        {PUSH_FIELDS.map((field, index) => (
          <span key={field.name}>
            {index > 0 ? ", " : null}
            <code className="font-mono text-xs">{field.name}</code>
          </span>
        ))}
        . Ces champs doivent exister et le jeton doit pouvoir modifier les
        équipements. Netplan n'écrit rien d'autre et n'efface jamais ce qu'il a
        écrit.
      </FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </div>
  );
}

function Summary({ settings }: { settings: NetBoxSettings }) {
  if (!settings.site) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun site NetBox choisi : rien n'est importé.
      </p>
    );
  }
  return (
    <div className="space-y-1 text-sm">
      <p>Site NetBox : {settings.site.name}</p>
      {settings.roles.length === 0 ? (
        <p className="text-muted-foreground">
          Aucun rôle n'a de type : rien n'est importé.
        </p>
      ) : (
        <ul className="space-y-0.5 text-muted-foreground">
          {settings.roles.map((role) => (
            <li key={role.id}>
              {role.name} → {getDeviceKindLabel(role.type)}
            </li>
          ))}
        </ul>
      )}
    </div>
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
  const save = useMutation(api.netbox.saveSettings);
  const [site, setSite] = useState<NetBoxSite | null>(
    options.sites.find((choice) => choice.id === settings.site?.id) ?? null,
  );
  const [types, setTypes] = useState<Record<number, RoleChoice>>(() =>
    Object.fromEntries(settings.roles.map((role) => [role.id, role.type])),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <p className="text-sm text-destructive">
            Le site « {settings.site?.name} » n'existe plus dans NetBox.
          </p>
        ) : null}
      </Field>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Rôles NetBox</legend>
        {options.roles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            NetBox ne liste aucun rôle d'équipement.
          </p>
        ) : null}
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
        {gone.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            Plus dans NetBox, retirés à l'enregistrement :{" "}
            {gone.map((role) => role.name).join(", ")}.
          </p>
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

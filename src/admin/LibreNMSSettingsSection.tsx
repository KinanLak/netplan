import { useAction, useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import { Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { FieldError } from "@/components/ui/field";
import { failureMessage } from "@/lib/errors";
import { useUnsavedSection } from "@/admin/unsaved";
import { polledSwitches, suggestDevice } from "@/sites/librenms";
import type { LibreNMSDevice } from "@/sites/librenms";
import { api } from "../../convex/_generated/api";

type Saved = NonNullable<FunctionReturnType<typeof api.librenms.settings>>;
type Options = Exclude<
  FunctionReturnType<typeof api.sources.librenmsDevices>,
  { error: string }
>;
type DeviceItem = { value: number; label: string };

const itemOf = (device: LibreNMSDevice): DeviceItem => ({
  value: device.id,
  label: device.name,
});

/** The LibreNMS device each of the site's switches stands for. */
export function LibreNMSSettingsSection({ siteId }: { siteId: string }) {
  const saved = useQuery(api.librenms.settings, { siteId });
  const loadOptions = useAction(api.sources.librenmsDevices);
  const [options, setOptions] = useState<Options | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!saved) return null;

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
      <h2 className="font-medium">Switchs LibreNMS</h2>
      {saved.switches.length === 0 ? (
        // Nothing to pair until the site has a switch.
        <Link
          to="/inventory"
          search={{ site: siteId }}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Ouvrir l'inventaire
        </Link>
      ) : options ? (
        <SettingsForm
          siteId={siteId}
          saved={saved}
          options={options}
          onDone={() => setOptions(null)}
        />
      ) : (
        <>
          <Summary saved={saved} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading
                ? "Lecture de LibreNMS…"
                : polledSwitches(saved.settings).length === 0
                  ? "Associer les switchs"
                  : "Modifier les associations"}
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        </>
      )}
    </section>
  );
}

/** Each switch and its LibreNMS device, once one is associated. */
function Summary({ saved }: { saved: Saved }) {
  const deviceOf = new Map(
    polledSwitches(saved.settings).map(({ switchId, device }) => [
      switchId,
      device,
    ]),
  );
  if (deviceOf.size === 0) return null;
  return (
    <dl className="grid max-w-md grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {saved.switches.map((device) => (
        <Fragment key={device.id}>
          <dt className="text-muted-foreground">{device.name}</dt>
          <dd
            className={
              deviceOf.has(device.id) ? undefined : "text-muted-foreground"
            }
          >
            {deviceOf.get(device.id)?.name ?? "Non interrogé"}
          </dd>
        </Fragment>
      ))}
    </dl>
  );
}

function SettingsForm({
  siteId,
  saved,
  options,
  onDone,
}: {
  siteId: string;
  saved: Saved;
  options: Options;
  onDone: () => void;
}) {
  const save = useOnlineMutation(api.librenms.saveSettings);
  const items = options.devices.map(itemOf);
  const listed = new Map(options.devices.map((device) => [device.id, device]));
  const savedOf = new Map(
    saved.settings.switches.map(({ switchId, device }) => [switchId, device]),
  );
  // Each switch starts on what was saved. A switch never configured gets the
  // device named like it as a suggestion, which the admin applies: a guess
  // must not read as a saved choice.
  const initial = Object.fromEntries(
    saved.switches.map((device) => [
      device.id,
      savedOf.get(device.id)?.id ?? null,
    ]),
  );
  const [chosen, setChosen] = useState<Record<string, number | null>>(initial);
  const suggestions = new Map(
    saved.switches.flatMap((device) => {
      if (savedOf.has(device.id)) return [];
      const suggested = suggestDevice(device, options.devices);
      return suggested ? [[device.id, suggested] as const] : [];
    }),
  );
  const pendingSuggestions = [...suggestions].filter(
    ([switchId, device]) => chosen[switchId] !== device.id,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useUnsavedSection(
    "correspondances",
    "Switchs LibreNMS",
    saved.switches.some(
      (device) => (chosen[device.id] ?? null) !== (initial[device.id] ?? null),
    ),
  );
  // Switches sharing a device: normal for a stack, worth a word otherwise.
  const sharing = (switchId: string, deviceId: number | null) =>
    deviceId === null
      ? []
      : saved.switches.filter(
          (other) => other.id !== switchId && chosen[other.id] === deviceId,
        );

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      await save({
        siteId,
        baseUrl: options.baseUrl,
        settings: {
          switches: saved.switches.map((device) => ({
            switchId: device.id,
            device: listed.get(chosen[device.id] ?? -1) ?? null,
          })),
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
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Switchs du site</legend>
        <div className="flex justify-end">
          {pendingSuggestions.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setChosen((all) => ({
                  ...all,
                  ...Object.fromEntries(
                    pendingSuggestions.map(([switchId, device]) => [
                      switchId,
                      device.id,
                    ]),
                  ),
                }))
              }
            >
              {pendingSuggestions.length === 1
                ? "Appliquer la suggestion"
                : `Appliquer les ${pendingSuggestions.length} suggestions`}
            </Button>
          ) : null}
        </div>
        {saved.switches.map((device) => {
          const id = chosen[device.id] ?? null;
          const picked = id === null ? undefined : listed.get(id);
          const gone = savedOf.get(device.id);
          const suggestion = suggestions.get(device.id);
          const others = sharing(device.id, id);
          const where = [device.hostname, device.floor].filter(Boolean);
          return (
            <div
              key={device.id}
              className="flex flex-col gap-1 text-sm sm:flex-row sm:items-start sm:justify-between sm:gap-4"
            >
              <div className="min-w-0 sm:pt-2">
                <p>{device.name}</p>
                {where.length > 0 ? (
                  <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    {where.map((part, index) => (
                      // A hostname and a floor may read the same.
                      <span key={index}>{part}</span>
                    ))}
                  </p>
                ) : null}
              </div>
              <div className="space-y-1 sm:w-80">
                <Combobox
                  items={items}
                  value={picked ? itemOf(picked) : null}
                  isItemEqualToValue={(item, value) =>
                    item.value === value.value
                  }
                  onValueChange={(next) =>
                    setChosen((all) => ({
                      ...all,
                      [device.id]: next?.value ?? null,
                    }))
                  }
                >
                  <ComboboxInput
                    aria-label={`Équipement LibreNMS de « ${device.name} »`}
                    placeholder="Non interrogé"
                    showClear
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>
                      Aucun équipement ne correspond.
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(item: DeviceItem) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                {suggestion && id !== suggestion.id ? (
                  <button
                    type="button"
                    className="text-xs text-primary underline-offset-4 hover:underline"
                    onClick={() =>
                      setChosen((all) => ({
                        ...all,
                        [device.id]: suggestion.id,
                      }))
                    }
                  >
                    Utiliser {suggestion.name}
                  </button>
                ) : null}
                {/* Normal for a stack, a slip otherwise. */}
                {others.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Aussi choisi pour{" "}
                    {others.map((other) => other.name).join(", ")}
                  </p>
                ) : null}
                {gone && !listed.has(gone.id) && id === gone.id ? (
                  <p className="text-destructive">
                    « {gone.name} » n'est plus dans LibreNMS.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
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

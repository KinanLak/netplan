import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
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
import { polledSwitches, suggestDevice } from "@/sites/librenms";
import type { LibreNMSDevice } from "@/sites/librenms";
import { api } from "../../convex/_generated/api";

type Saved = NonNullable<FunctionReturnType<typeof api.librenms.settings>>;
type Options = Exclude<
  FunctionReturnType<typeof api.librenms.options>,
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
  const loadOptions = useAction(api.librenms.options);
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
      <div className="space-y-1">
        <h2 className="font-medium">Switchs LibreNMS</h2>
        <p className="text-sm text-muted-foreground">
          Netplan interroge dans LibreNMS l'équipement choisi pour chaque switch
          ; plusieurs switchs d'une pile partagent le même. Un switch sans
          équipement n'est pas interrogé.
        </p>
      </div>
      {options ? (
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
              disabled={loading || saved.switches.length === 0}
              onClick={() => void load()}
            >
              {loading ? "Lecture de LibreNMS…" : "Modifier"}
            </Button>
            {error ? <FieldError>{error}</FieldError> : null}
          </div>
        </>
      )}
    </section>
  );
}

function Summary({ saved }: { saved: Saved }) {
  if (saved.switches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun switch dans l'inventaire de ce site.
      </p>
    );
  }
  const deviceOf = new Map(
    polledSwitches(saved.settings).map(({ switchId, device }) => [
      switchId,
      device,
    ]),
  );
  const polled = saved.switches.filter((device) => deviceOf.has(device.id));
  if (polled.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucun switch n'a d'équipement LibreNMS : rien n'est interrogé.
      </p>
    );
  }
  const left = saved.switches.length - polled.length;
  return (
    <div className="space-y-1 text-sm">
      <ul className="space-y-0.5 text-muted-foreground">
        {polled.map((device) => (
          <li key={device.id}>
            {device.name} → {deviceOf.get(device.id)?.name}
          </li>
        ))}
      </ul>
      {left > 0 ? (
        <p className="text-muted-foreground">
          {left === 1
            ? "1 switch n'est pas interrogé."
            : `${left} switchs ne sont pas interrogés.`}
        </p>
      ) : null}
    </div>
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
  const save = useMutation(api.librenms.saveSettings);
  const items = options.devices.map(itemOf);
  const listed = new Map(options.devices.map((device) => [device.id, device]));
  const savedOf = new Map(
    saved.settings.switches.map(({ switchId, device }) => [switchId, device]),
  );
  // A switch never configured starts on the device named like it, if one
  // is; one an admin chose not to poll stays so.
  const [chosen, setChosen] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      saved.switches.map((device) => [
        device.id,
        savedOf.has(device.id)
          ? (savedOf.get(device.id)?.id ?? null)
          : (suggestDevice(device, options.devices)?.id ?? null),
      ]),
    ),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Switchs du site</legend>
        {saved.switches.map((device) => {
          const id = chosen[device.id] ?? null;
          const picked = id === null ? undefined : listed.get(id);
          const gone = savedOf.get(device.id);
          return (
            <div
              key={device.id}
              className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <span>{device.name}</span>
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

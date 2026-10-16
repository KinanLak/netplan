// What a site polls in LibreNMS (ADR 0023): for each Netplan switch, the
// LibreNMS device it stands for. Several switches may share one device, as
// the members of a stack do; a switch left out is not polled.

/** A LibreNMS device as the settings name it. */
export type LibreNMSDevice = { id: number; name: string };

export type LibreNMSSwitch = { switchId: string; device: LibreNMSDevice };

export type LibreNMSSettings = { switches: Array<LibreNMSSwitch> };

export const EMPTY_LIBRENMS_SETTINGS: LibreNMSSettings = { switches: [] };

const isId = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Why LibreNMS settings cannot be saved, in French, or `null`. */
export const librenmsSettingsError = (
  settings: LibreNMSSettings,
): string | null => {
  if (!settings.switches.every(({ device }) => isId(device.id))) {
    return "Cet équipement LibreNMS n'existe pas.";
  }
  const ids = settings.switches.map(({ switchId }) => switchId);
  if (new Set(ids).size !== ids.length) {
    return "Chaque switch ne correspond qu'à un équipement LibreNMS.";
  }
  return null;
};

/**
 * A name without its domain, ignoring case: `SW-01.corp` is `sw-01`. An IPv4
 * address, which LibreNMS often names a device by, stays whole.
 */
const shortName = (name: string) => {
  const lower = name.trim().toLowerCase();
  return /^[\d.]+$/.test(lower) ? lower : lower.replace(/\..*$/, "");
};

/**
 * The LibreNMS device a switch most likely is: the only one whose name is
 * the switch's hostname or name, domains ignored. `null` when none or
 * several are.
 */
export const suggestDevice = (
  netplanSwitch: { name: string; hostname?: string },
  devices: ReadonlyArray<LibreNMSDevice>,
): LibreNMSDevice | null => {
  const names = new Set(
    [netplanSwitch.hostname, netplanSwitch.name]
      .filter((name) => name !== undefined)
      .map(shortName)
      .filter(Boolean),
  );
  const found = devices.filter((device) => names.has(shortName(device.name)));
  return found.length === 1 ? (found.at(0) ?? null) : null;
};

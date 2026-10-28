import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { browserTimeZone, displayLocale } from "@/lib/time";

const TIME_ZONES: ReadonlyArray<string> = Intl.supportedValuesOf("timeZone");

const offsets = new Map<string, string>();

/** `UTC+2`: a zone's offset now, computed once per zone and page. */
const offsetOf = (zone: string): string => {
  let offset = offsets.get(zone);
  if (offset === undefined) {
    offset =
      new Intl.DateTimeFormat(displayLocale.current, {
        timeZone: zone,
        timeZoneName: "shortOffset",
      })
        .formatToParts(Date.now())
        .find((part) => part.type === "timeZoneName")?.value ?? "";
    offsets.set(zone, offset);
  }
  return offset;
};

export function TimeZoneField({
  id,
  value,
  error = null,
  onChange,
}: {
  id: string;
  value: string;
  error?: string | null;
  onChange: (timezone: string) => void;
}) {
  // Alphabetical, as the owner asked (A91), with the browser's own zone
  // first; a zone saved under an alias this browser does not list stays
  // choosable.
  const own = browserTimeZone();
  const zones = [
    ...new Set([
      ...(TIME_ZONES.includes(value) ? [] : [value]),
      own,
      ...TIME_ZONES,
    ]),
  ];
  return (
    <Field data-invalid={error !== null}>
      <FieldLabel htmlFor={id}>Fuseau horaire</FieldLabel>
      <Combobox
        items={zones}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <ComboboxInput
          id={id}
          placeholder="Europe/Paris"
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <ComboboxContent>
          <ComboboxEmpty>Aucun fuseau ne correspond.</ComboboxEmpty>
          <ComboboxList>
            {(zone: string) => (
              <ComboboxItem key={zone} value={zone}>
                <span className="min-w-0 flex-1 truncate">
                  {zone}
                  {zone === own ? (
                    <span className="ml-3 text-muted-foreground">
                      ce navigateur
                    </span>
                  ) : null}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {offsetOf(zone)}
                </span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

const TIME_ZONES: ReadonlyArray<string> = Intl.supportedValuesOf("timeZone");

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
  // A zone saved under an alias this browser does not list stays choosable.
  const zones = TIME_ZONES.includes(value)
    ? TIME_ZONES
    : [value, ...TIME_ZONES];
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
                {zone}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";

const TIME_ZONES: ReadonlyArray<string> = Intl.supportedValuesOf("timeZone");

export function TimeZoneField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (timezone: string) => void;
}) {
  // A zone saved under an alias this browser does not list stays choosable.
  const zones = TIME_ZONES.includes(value)
    ? TIME_ZONES
    : [value, ...TIME_ZONES];
  return (
    <Field>
      <FieldLabel htmlFor={id}>Fuseau horaire</FieldLabel>
      <Combobox
        items={zones}
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next);
        }}
      >
        <ComboboxInput id={id} placeholder="Europe/Paris" />
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
    </Field>
  );
}

import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { ComponentProps } from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";

/** A password field whose value can be shown while typing. */
export function PasswordInput(
  props: Omit<ComponentProps<typeof InputGroupInput>, "type">,
) {
  const [shown, setShown] = useState(false);
  const label = shown ? "Masquer le mot de passe" : "Afficher le mot de passe";
  return (
    <InputGroup>
      <InputGroupInput {...props} type={shown ? "text" : "password"} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          size="icon-xs"
          aria-label={label}
          title={label}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          <HugeiconsIcon icon={shown ? ViewOffIcon : ViewIcon} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

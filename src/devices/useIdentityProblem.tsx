import { useState } from "react";
import { FieldError } from "@/components/ui/field";
import type { IdentityField } from "@/devices/identity";

/**
 * A refusal shown under the field at fault, which takes the focus (A30); one
 * without a field, such as the server's, shows beside the buttons.
 *
 * `inputId(field)` must be the id of that field's control.
 */
export function useIdentityProblem(inputId: (field: IdentityField) => string) {
  const [problem, setProblem] = useState<{
    field: IdentityField | null;
    message: string;
  } | null>(null);

  const messageFor = (field: IdentityField) =>
    problem?.field === field ? problem.message : null;

  return {
    refuse: (field: IdentityField | null, message: string) => {
      setProblem({ field, message });
      if (field) document.getElementById(inputId(field))?.focus();
    },
    clear: () => setProblem(null),
    isInvalid: (field: IdentityField) => messageFor(field) !== null,
    /** Spread on a field's control. */
    invalid: (field: IdentityField) => ({
      "aria-invalid": messageFor(field) !== null,
      "aria-describedby": messageFor(field)
        ? `${inputId(field)}-error`
        : undefined,
    }),
    /** The refusal under a field, when it is about that field. */
    errorUnder: (field: IdentityField) => {
      const message = messageFor(field);
      return message ? (
        <FieldError id={`${inputId(field)}-error`}>{message}</FieldError>
      ) : null;
    },
    /** A refusal about no field in particular. */
    formError:
      problem && problem.field === null ? (
        <FieldError>{problem.message}</FieldError>
      ) : null,
  };
}

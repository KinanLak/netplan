import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import {
  MIN_PASSWORD_LENGTH,
  requestFailure,
  resetPasswordErrorMessage,
} from "@/lib/login";

// The mailed link goes through better-auth, which checks the token and lands
// here with `?token=` or, once it has expired, `?error=INVALID_TOKEN`.
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  head: () => ({ meta: [{ title: "Choisir un mot de passe · Netplan" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError } = Route.useSearch();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || linkError || expired) {
    return (
      <AuthCard
        title="Lien expiré"
        description="Ce lien n'est plus valable : il a déjà servi ou a expiré."
      >
        <Link
          to="/forgot-password"
          className={buttonVariants({ className: "w-full" })}
        >
          Demander un nouveau lien
        </Link>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title="Mot de passe enregistré"
        description="Connectez-vous avec votre nouveau mot de passe. Vos autres sessions ont été fermées."
      >
        <Link to="/login" className={buttonVariants({ className: "w-full" })}>
          Se connecter
        </Link>
      </AuthCard>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setPending(true);
    setError(null);
    const failure = await requestFailure(
      authClient.resetPassword({ newPassword: password, token }),
    );
    setPending(false);
    if (failure?.code === "INVALID_TOKEN") {
      setExpired(true);
    } else if (failure) {
      setError(resetPasswordErrorMessage(failure));
    } else {
      setDone(true);
    }
  };

  return (
    <AuthCard title="Choisir un mot de passe">
      <form onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">Nouveau mot de passe</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={MIN_PASSWORD_LENGTH}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldDescription>
              {MIN_PASSWORD_LENGTH} caractères au moins.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmation">Confirmation</FieldLabel>
            <Input
              id="confirmation"
              name="confirmation"
              type="password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}

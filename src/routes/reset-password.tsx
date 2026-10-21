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
import { PasswordInput } from "@/components/password-input";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import {
  MIN_PASSWORD_LENGTH,
  requestFailure,
  resetPasswordErrorMessage,
} from "@/lib/login";

// `1` in the mailed link; `true` once the router has read it.
const isInvitation = (value: unknown) =>
  value === true || value === 1 || value === "1";

// The mailed link goes through better-auth, which checks the token and lands
// here with `?token=` or, once it has expired, `?error=INVALID_TOKEN`. The
// link also carries the account's address as `login`, for password managers.
export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
    login: typeof search.login === "string" ? search.login : undefined,
    // An invitation's link: the account is new, so nothing was "changed".
    invitation: isInvitation(search.invitation),
  }),
  head: () => ({ meta: [{ title: "Choisir un mot de passe" }] }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error: linkError, login, invitation } = Route.useSearch();
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || linkError || expired) {
    return (
      <AuthCard
        title="Lien expiré"
        description={
          invitation
            ? "Ce lien d'invitation n'est plus valable : demandez à un administrateur de vous renvoyer l'invitation."
            : "Ce lien n'est plus valable : il a déjà servi ou a expiré."
        }
      >
        {invitation ? null : (
          <Link
            to="/forgot-password"
            className={buttonVariants({ className: "w-full" })}
          >
            Demander un nouveau lien
          </Link>
        )}
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title={invitation ? "Votre compte est prêt" : "Mot de passe enregistré"}
        description={
          invitation
            ? "Connectez-vous avec le mot de passe que vous venez de choisir."
            : "Connectez-vous avec votre nouveau mot de passe. Vos autres sessions ont été fermées."
        }
      >
        <Link
          to="/login"
          search={login ? { login } : {}}
          className={buttonVariants({ className: "w-full" })}
        >
          Se connecter
        </Link>
      </AuthCard>
    );
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // From the form: a password manager may fill it before hydration.
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
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
    <AuthCard
      title={invitation ? "Bienvenue sur NetPlan" : "Choisir un mot de passe"}
      description={
        invitation ? "Choisissez le mot de passe de votre compte." : undefined
      }
    >
      <form method="post" onSubmit={(event) => void submit(event)}>
        {/* Tells a password manager which account the new password is for. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={login ?? ""}
          readOnly
          hidden
        />
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="password">Nouveau mot de passe</FieldLabel>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="new-password"
              autoFocus
              required
              minLength={MIN_PASSWORD_LENGTH}
              onChange={() => setError(null)}
            />
            <FieldDescription>
              {MIN_PASSWORD_LENGTH} caractères au moins.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmation">
              Confirmer le mot de passe
            </FieldLabel>
            <PasswordInput
              id="confirmation"
              name="confirmation"
              autoComplete="new-password"
              required
              onChange={() => setError(null)}
            />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
          </Button>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}

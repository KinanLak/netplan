import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { getSignInOptions } from "@/lib/auth-server";
import {
  SESSION_LOST_MESSAGES,
  isEmail,
  isSessionLostReason,
  keycloakErrorMessage,
  loginErrorMessage,
  requestFailure,
  safeRedirect,
} from "@/lib/login";
import type { SessionLostReason } from "@/lib/login";

const signInOptions = createServerFn({ method: "GET" }).handler(
  getSignInOptions,
);

export const Route = createFileRoute("/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    redirect?: string;
    error?: string;
    reason?: SessionLostReason;
    login?: string;
  } => ({
    redirect: safeRedirect(search.redirect),
    // Set by a failed Keycloak sign-in on its way back.
    error: typeof search.error === "string" ? search.error : undefined,
    // Set when a session ended while a page was open.
    reason: isSessionLostReason(search.reason) ? search.reason : undefined,
    // Set once a password has been chosen, to fill the identifier in.
    login: typeof search.login === "string" ? search.login : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.token) throw redirect({ href: search.redirect ?? "/" });
  },
  loader: () => signInOptions(),
  head: () => ({ meta: [{ title: "Connexion" }] }),
  component: LoginPage,
});

function LoginPage() {
  const {
    redirect: target,
    error: keycloakError,
    reason,
    login: knownLogin,
  } = Route.useSearch();
  const { keycloak } = Route.useLoaderData();
  // Before hydration the form would submit natively, which is no sign-in.
  const hydrated = useHydrated();
  const [error, setError] = useState<string | null>(
    keycloakError ? keycloakErrorMessage(keycloakError) : null,
  );
  const [pending, setPending] = useState(false);

  const signInWithKeycloak = async () => {
    setPending(true);
    setError(null);
    const back = target ? `?redirect=${encodeURIComponent(target)}` : "";
    // On success the client follows the redirect to Keycloak.
    const failure = await requestFailure(
      authClient.signIn.oauth2({
        providerId: "keycloak",
        callbackURL: target ?? "/",
        errorCallbackURL: `/login${back}`,
      }),
    );
    if (failure) {
      setError(loginErrorMessage(failure));
      setPending(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    // Read from the form, not from state: a password manager may fill the
    // fields before React hydrates, and React never hears of it.
    const form = new FormData(event.currentTarget);
    const login = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const failure = await requestFailure(
      isEmail(login)
        ? authClient.signIn.email({ email: login, password })
        : authClient.signIn.username({ username: login, password }),
    );
    if (failure) {
      setError(loginErrorMessage(failure));
      setPending(false);
      return;
    }
    // A full load, so the server renders the page with the new session.
    window.location.assign(target ?? "/");
  };

  return (
    <AuthCard
      title="Connexion à NetPlan"
      description="Utilisez le compte que votre administrateur vous a créé."
    >
      {/* POST, so a submission before hydration never puts the password in
          the address. */}
      <form method="post" onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          {reason ? (
            <p role="status" className="rounded-md border p-3 text-sm">
              {SESSION_LOST_MESSAGES[reason]}
            </p>
          ) : null}
          <Field>
            <FieldLabel htmlFor="identifier">Identifiant ou e-mail</FieldLabel>
            <Input
              id="identifier"
              name="username"
              autoComplete="username"
              autoFocus={!knownLogin}
              required
              defaultValue={knownLogin}
              onChange={() => setError(null)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              autoFocus={Boolean(knownLogin)}
              required
              onChange={() => setError(null)}
            />
            <FieldDescription>
              <Link to="/forgot-password">Mot de passe oublié ?</Link>
            </FieldDescription>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Connexion…" : "Se connecter"}
          </Button>
          {keycloak ? (
            <>
              <FieldSeparator>ou</FieldSeparator>
              <Button
                type="button"
                variant="outline"
                disabled={!hydrated || pending}
                onClick={() => void signInWithKeycloak()}
              >
                Se connecter avec Keycloak
              </Button>
            </>
          ) : null}
        </FieldGroup>
      </form>
    </AuthCard>
  );
}

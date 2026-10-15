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
import { authClient } from "@/lib/auth-client";
import { getSignInOptions } from "@/lib/auth-server";
import {
  isEmail,
  keycloakErrorMessage,
  loginErrorMessage,
  requestFailure,
  safeRedirect,
} from "@/lib/login";

const signInOptions = createServerFn({ method: "GET" }).handler(
  getSignInOptions,
);

export const Route = createFileRoute("/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; error?: string } => ({
    redirect: safeRedirect(search.redirect),
    // Set by a failed Keycloak sign-in on its way back.
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  beforeLoad: ({ context, search }) => {
    if (context.token) throw redirect({ href: search.redirect ?? "/" });
  },
  loader: () => signInOptions(),
  head: () => ({ meta: [{ title: "Connexion · Netplan" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target, error: keycloakError } = Route.useSearch();
  const { keycloak } = Route.useLoaderData();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
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
    const login = identifier.trim();
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
      title="Connexion à Netplan"
      description="Utilisez le compte que votre administrateur vous a créé."
    >
      <form onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="identifier">Identifiant ou e-mail</FieldLabel>
            <Input
              id="identifier"
              name="username"
              autoComplete="username"
              autoFocus
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Mot de passe</FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <FieldDescription>
              <Link to="/forgot-password">Mot de passe oublié ?</Link>
            </FieldDescription>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Connexion…" : "Se connecter"}
          </Button>
          {keycloak ? (
            <>
              <FieldSeparator>ou</FieldSeparator>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
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

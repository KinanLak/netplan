import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { NetplanLogo } from "@/components/netplan-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { isEmail, loginErrorMessage, safeRedirect } from "@/lib/login";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: ({ context, search }) => {
    if (context.token) throw redirect({ href: search.redirect ?? "/" });
  },
  head: () => ({ meta: [{ title: "Connexion · Netplan" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target } = Route.useSearch();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const login = identifier.trim();
    const { error: failure } = isEmail(login)
      ? await authClient.signIn.email({ email: login, password })
      : await authClient.signIn.username({ username: login, password });
    if (failure) {
      setError(loginErrorMessage(failure));
      setPending(false);
      return;
    }
    // A full load, so the server renders the page with the new session.
    window.location.assign(target ?? "/");
  };

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <NetplanLogo size={52} />
          <CardTitle className="text-xl">Connexion à Netplan</CardTitle>
          <CardDescription>
            Utilisez le compte que votre administrateur vous a créé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(event) => void submit(event)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="identifier">
                  Identifiant ou e-mail
                </FieldLabel>
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
              </Field>
              {error ? <FieldError>{error}</FieldError> : null}
              <Button type="submit" disabled={pending}>
                {pending ? "Connexion…" : "Se connecter"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

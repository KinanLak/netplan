import { Link, createFileRoute } from "@tanstack/react-router";
import { Mail01Icon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import type { FormEvent } from "react";
import { AuthCard } from "@/components/auth-card";
import { IconNote } from "@/components/icon-note";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { forgotPasswordErrorMessage, requestFailure } from "@/lib/login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Mot de passe oublié" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const hydrated = useHydrated();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // From the form: the browser may fill it before hydration.
    const address = String(
      new FormData(event.currentTarget).get("email") ?? "",
    ).trim();
    setEmail(address);
    setPending(true);
    setError(null);
    const failure = await requestFailure(
      authClient.requestPasswordReset({
        email: address,
        redirectTo: "/reset-password",
      }),
    );
    setPending(false);
    if (failure) {
      setError(forgotPasswordErrorMessage(failure));
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthCard title="Vérifiez vos e-mails">
        <FieldGroup>
          {/* The same answer whether or not the address has an account. */}
          <IconNote icon={Mail01Icon}>
            Si {email} a un compte NetPlan, un lien vient de lui être envoyé
          </IconNote>
          <Link to="/login" className={buttonVariants({ variant: "outline" })}>
            Retour à la connexion
          </Link>
        </FieldGroup>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Mot de passe oublié">
      <form method="post" onSubmit={(event) => void submit(event)}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Adresse e-mail</FieldLabel>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoFocus
              required
              onChange={() => setError(null)}
            />
            <IconNote icon={SquareLock02Icon}>
              Un compte Keycloak change son mot de passe dans Keycloak
            </IconNote>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Envoi…" : "Envoyer le lien"}
          </Button>
          <FieldDescription className="text-center">
            <Link to="/login">Retour à la connexion</Link>
          </FieldDescription>
        </FieldGroup>
      </form>
    </AuthCard>
  );
}

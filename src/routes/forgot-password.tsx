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
import { forgotPasswordErrorMessage, requestFailure } from "@/lib/login";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Mot de passe oublié" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const failure = await requestFailure(
      authClient.requestPasswordReset({
        email: email.trim(),
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
          <FieldDescription className="text-center">
            Si un compte NetPlan avec mot de passe utilise l'adresse {email}, un
            lien pour en choisir un nouveau vient de lui être envoyé. Il est
            valable une heure.
          </FieldDescription>
          <Link to="/login" className={buttonVariants({ variant: "outline" })}>
            Retour à la connexion
          </Link>
        </FieldGroup>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Mot de passe oublié"
      description="Saisissez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe."
    >
      <form onSubmit={(event) => void submit(event)}>
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
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <FieldDescription>
              Un compte qui se connecte avec Keycloak change son mot de passe
              dans Keycloak.
            </FieldDescription>
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          <Button type="submit" disabled={pending}>
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

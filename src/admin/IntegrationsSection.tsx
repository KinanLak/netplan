import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { failureMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  INTEGRATION_KINDS,
  INTEGRATION_LABELS,
  normalizeBaseUrl,
  tokenError,
} from "@/sites/integrations";
import type { IntegrationKind } from "@/sites/integrations";
import { api } from "../../convex/_generated/api";

type Integration = FunctionReturnType<
  typeof api.integrations.listForSite
>[number];

const PLACEHOLDERS: Record<IntegrationKind, string> = {
  netbox: "https://netbox.exemple.fr",
  librenms: "https://librenms.exemple.fr",
};

const checkedAt = (at: number) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(at);

/** The NetBox and LibreNMS connections of a site. */
export function IntegrationsSection({ siteId }: { siteId: string }) {
  const integrations = useQuery(api.integrations.listForSite, { siteId });
  if (integrations === undefined) return null;
  return (
    <section className="space-y-6 border-t pt-6">
      <div className="space-y-1">
        <h2 className="font-medium">Intégrations</h2>
        <p className="text-sm text-muted-foreground">
          Les jetons sont chiffrés sur le serveur et ne sont jamais réaffichés.
        </p>
      </div>
      {INTEGRATION_KINDS.map((kind) => {
        const integration = integrations.find((row) => row.kind === kind);
        return (
          <IntegrationForm
            // A saved connection starts a fresh draft.
            key={`${kind}:${integration?.baseUrl ?? ""}`}
            siteId={siteId}
            kind={kind}
            integration={integration ?? null}
          />
        );
      })}
    </section>
  );
}

function IntegrationForm({
  siteId,
  kind,
  integration,
}: {
  siteId: string;
  kind: IntegrationKind;
  integration: Integration | null;
}) {
  const save = useAction(api.sources.saveIntegration);
  const test = useAction(api.sources.testIntegration);
  const label = INTEGRATION_LABELS[kind];
  const [baseUrl, setBaseUrl] = useState(integration?.baseUrl ?? "");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(integration?.enabled ?? true);
  const [ignoreCertificateErrors, setIgnoreCertificateErrors] = useState(
    integration?.ignoreCertificateErrors ?? false,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const id = (field: string) => `integration-${kind}-${field}`;

  const changed = () => setError(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeBaseUrl(kind, baseUrl);
    if ("error" in normalized) {
      setError(normalized.error);
      return;
    }
    const keepToken = integration !== null && token === "";
    const refused = keepToken ? null : tokenError(token);
    if (refused) {
      setError(refused);
      return;
    }
    setPending("save");
    setError(null);
    try {
      await save({
        siteId,
        kind,
        baseUrl,
        enabled,
        ignoreCertificateErrors,
        token: keepToken ? undefined : token,
      });
      setToken("");
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(null);
    }
  };

  const retest = async () => {
    setPending("test");
    setError(null);
    try {
      await test({ siteId, kind });
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(null);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-lg border p-4"
    >
      <FieldSet>
        <div className="flex items-center justify-between gap-4">
          <FieldLegend>{label}</FieldLegend>
          {integration ? (
            <RemoveIntegration siteId={siteId} kind={kind} />
          ) : null}
        </div>
        {integration?.lastCheck ? (
          <p
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <span
              aria-hidden
              className={cn(
                "size-2 shrink-0 rounded-full",
                integration.lastCheck.ok ? "bg-up" : "bg-down",
              )}
            />
            <span>
              {integration.lastCheck.message}{" "}
              <span className="whitespace-nowrap">
                ({checkedAt(integration.lastCheck.at)})
              </span>
            </span>
          </p>
        ) : integration ? (
          <FieldDescription>Connexion pas encore testée.</FieldDescription>
        ) : (
          <FieldDescription>Non configuré.</FieldDescription>
        )}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id("url")}>Adresse</FieldLabel>
            <Input
              id={id("url")}
              type="url"
              placeholder={PLACEHOLDERS[kind]}
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                changed();
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={id("token")}>Jeton d'API</FieldLabel>
            <Input
              id={id("token")}
              type="password"
              autoComplete="off"
              placeholder={
                integration
                  ? "Jeton enregistré : laissez vide pour le garder"
                  : undefined
              }
              value={token}
              onChange={(event) => {
                setToken(event.target.value);
                changed();
              }}
            />
            {kind === "netbox" ? (
              <FieldDescription>
                Un jeton en lecture seule suffit.
              </FieldDescription>
            ) : null}
          </Field>
          <Field orientation="horizontal">
            <input
              id={id("enabled")}
              type="checkbox"
              className="size-4 accent-primary"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
                changed();
              }}
            />
            <FieldLabel htmlFor={id("enabled")}>
              Utiliser {label} dans la collecte
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <input
              id={id("insecure")}
              type="checkbox"
              className="size-4 accent-primary"
              checked={ignoreCertificateErrors}
              onChange={(event) => {
                setIgnoreCertificateErrors(event.target.checked);
                changed();
              }}
            />
            <FieldLabel htmlFor={id("insecure")}>
              Ignorer les erreurs de certificat TLS
            </FieldLabel>
          </Field>
          {ignoreCertificateErrors ? (
            <p
              role="note"
              className="rounded-lg border border-down bg-down-background p-3 text-sm"
            >
              Rien ne prouve plus que le serveur qui répond à cette adresse est
              bien {label} : le jeton lui est envoyé quand même. À réserver à un
              réseau de confiance, le temps de corriger le certificat.
            </p>
          ) : null}
        </FieldGroup>
      </FieldSet>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending !== null}>
          {pending === "save" ? "Enregistrement…" : "Enregistrer et tester"}
        </Button>
        {integration ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void retest()}
          >
            {pending === "test" ? "Test en cours…" : "Tester la connexion"}
          </Button>
        ) : null}
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    </form>
  );
}

function RemoveIntegration({
  siteId,
  kind,
}: {
  siteId: string;
  kind: IntegrationKind;
}) {
  const remove = useMutation(api.integrations.remove);
  const [open, setOpen] = useState(false);
  const label = INTEGRATION_LABELS[kind];
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        Retirer
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {label} de ce site ?</AlertDialogTitle>
            <AlertDialogDescription>
              Netplan oublie l'adresse et le jeton ; la collecte ne l'interroge
              plus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void remove({ siteId, kind })}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

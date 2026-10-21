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
import { Checkbox } from "@/components/ui/checkbox";
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
import { useFlash } from "@/hooks/use-flash";
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
            // A created or removed connection starts a fresh draft; a saved
            // one keeps the form, and its pending test, mounted.
            key={`${kind}:${integration ? "saved" : "new"}`}
            siteId={siteId}
            kind={kind}
            integration={integration ?? null}
          />
        );
      })}
    </section>
  );
}

type Check = { ok: boolean; message: string };

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
  const [error, setError] = useState<{
    field: "url" | "token" | null;
    text: string;
  } | null>(null);
  // The answer to the last test of what the form shows, and what became of
  // the draft when it was not saved.
  const [result, setResult] = useState<(Check & { note?: string }) | null>(
    null,
  );
  const [saved, flashSaved] = useFlash();
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const id = (field: string) => `integration-${kind}-${field}`;

  const normalized = normalizeBaseUrl(kind, baseUrl);
  const connectionChanged =
    integration === null ||
    token !== "" ||
    !("url" in normalized) ||
    normalized.url !== integration.baseUrl ||
    ignoreCertificateErrors !== integration.ignoreCertificateErrors;
  const dirty = connectionChanged || enabled !== integration.enabled;

  const changed = () => {
    setError(null);
    setResult(null);
  };

  // What the server would refuse, caught before the request.
  const draftError = (): typeof error => {
    if ("error" in normalized) return { field: "url", text: normalized.error };
    if (token !== "") {
      const refused = tokenError(token);
      if (refused) return { field: "token", text: refused };
    } else if (integration === null) {
      return { field: "token", text: "Saisissez le jeton." };
    } else if (normalized.url !== integration.baseUrl) {
      return {
        field: "token",
        text: "Saisissez à nouveau le jeton : il n'est envoyé qu'à l'adresse pour laquelle il a été saisi.",
      };
    }
    return null;
  };

  const draft = () => ({
    siteId,
    kind,
    baseUrl,
    ignoreCertificateErrors,
    token: token === "" ? undefined : token,
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = draftError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(connectionChanged ? "test" : "save");
    setError(null);
    setResult(null);
    try {
      const check = await save({ ...draft(), enabled });
      if (check === null || check.ok) {
        setToken("");
        if ("url" in normalized) setBaseUrl(normalized.url);
        flashSaved();
      }
      setResult(
        check && {
          ...check,
          ...(!check.ok && { note: "Rien n'a été enregistré." }),
        },
      );
    } catch (failure) {
      setError({ field: null, text: failureMessage(failure, "admin") });
    } finally {
      setPending(null);
    }
  };

  const runTest = async () => {
    const invalid = draftError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending("test");
    setError(null);
    setResult(null);
    try {
      const check = await test(draft());
      setResult({
        ...check,
        ...(connectionChanged && { note: "Pas encore enregistré." }),
      });
    } catch (failure) {
      setError({ field: null, text: failureMessage(failure, "admin") });
    } finally {
      setPending(null);
    }
  };

  const fieldError = (field: "url" | "token") =>
    error?.field === field ? error.text : null;

  return (
    <form
      noValidate
      onSubmit={(event) => void submit(event)}
      className="space-y-4 rounded-lg border p-4"
    >
      {/* The answer belongs to the draft that was sent, so it stays put. */}
      <FieldSet disabled={pending !== null}>
        <div className="flex items-center justify-between gap-4">
          <FieldLegend>{label}</FieldLegend>
          {integration ? (
            <RemoveIntegration siteId={siteId} kind={kind} />
          ) : null}
        </div>
        <ConnectionStatus
          integration={integration}
          result={result}
          connectionChanged={connectionChanged}
          pending={pending === "test"}
        />
        <FieldGroup>
          <Field data-invalid={fieldError("url") !== null}>
            <FieldLabel htmlFor={id("url")}>Adresse</FieldLabel>
            <Input
              id={id("url")}
              type="url"
              placeholder={PLACEHOLDERS[kind]}
              value={baseUrl}
              aria-invalid={fieldError("url") !== null}
              aria-describedby={fieldError("url") ? id("url-error") : undefined}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                changed();
              }}
            />
            {fieldError("url") ? (
              <FieldError id={id("url-error")}>{fieldError("url")}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={fieldError("token") !== null}>
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
              aria-invalid={fieldError("token") !== null}
              aria-describedby={
                fieldError("token") ? id("token-error") : undefined
              }
              onChange={(event) => {
                setToken(event.target.value);
                changed();
              }}
            />
            {fieldError("token") ? (
              <FieldError id={id("token-error")}>
                {fieldError("token")}
              </FieldError>
            ) : kind === "netbox" ? (
              <FieldDescription>
                Un jeton en lecture seule suffit.
              </FieldDescription>
            ) : null}
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={id("enabled")}
              disabled={pending !== null}
              checked={enabled}
              onCheckedChange={(checked) => {
                setEnabled(checked);
                changed();
              }}
            />
            <FieldLabel htmlFor={id("enabled")}>
              Utiliser {label} dans la collecte
            </FieldLabel>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id={id("insecure")}
              disabled={pending !== null}
              checked={ignoreCertificateErrors}
              onCheckedChange={(checked) => {
                setIgnoreCertificateErrors(checked);
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
        <Button type="submit" disabled={pending !== null || !dirty}>
          {pending === "save"
            ? "Enregistrement…"
            : saved && !dirty
              ? "Enregistré"
              : connectionChanged
                ? "Enregistrer et tester"
                : "Enregistrer"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null || baseUrl.trim() === ""}
          onClick={() => void runTest()}
        >
          Tester
        </Button>
        {error?.field === null ? <FieldError>{error.text}</FieldError> : null}
      </div>
    </form>
  );
}

/**
 * The state of the connection the form shows: a test running, the answer to
 * the last test of this draft, or the saved connection's last check.
 */
function ConnectionStatus({
  integration,
  result,
  connectionChanged,
  pending,
}: {
  integration: Integration | null;
  result: (Check & { note?: string }) | null;
  connectionChanged: boolean;
  pending: boolean;
}) {
  if (pending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Test en cours…
      </p>
    );
  }
  const lastCheck = connectionChanged ? null : (integration?.lastCheck ?? null);
  const shown = result ?? lastCheck;
  if (!shown) {
    return (
      <FieldDescription>
        {integration === null
          ? "Non configuré."
          : connectionChanged
            ? "Connexion modifiée, pas encore testée."
            : "Connexion pas encore testée."}
      </FieldDescription>
    );
  }
  return (
    <p
      role="status"
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          shown.ok ? "bg-up" : "bg-down",
        )}
      />
      <span>
        {shown.message}
        {result === null && lastCheck ? (
          <span className="whitespace-nowrap">
            {" "}
            ({checkedAt(lastCheck.at)})
          </span>
        ) : null}
        {result?.note ? ` ${result.note}` : null}
      </span>
    </p>
  );
}

// What removing a connection erases, beyond its address and token
// (`releaseNetBox` and `releaseLibreNMS`).
const LOSSES: Record<IntegrationKind, string> = {
  netbox:
    "NetPlan oublie l'adresse, le jeton, le site NetBox et les rôles choisis. Les équipements et les câbles importés restent dans NetPlan, mais ne sont plus liés à NetBox : leurs champs redeviennent modifiables, les imports à revoir sont effacés et l'écriture dans NetBox s'arrête.",
  librenms:
    "NetPlan oublie l'adresse, le jeton et l'équipement LibreNMS de chaque switch. Ce que le réseau a observé est effacé : où chaque adresse MAC a été vue, les statuts en ligne et hors ligne, l'état des ports.",
};

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
            <AlertDialogDescription>{LOSSES[kind]}</AlertDialogDescription>
            <AlertDialogDescription>
              Pour seulement suspendre la collecte, décochez plutôt « Utiliser{" "}
              {label} dans la collecte » et enregistrez.
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

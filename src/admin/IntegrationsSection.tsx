import { useAction, useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
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
import { Time } from "@/components/time";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert02Icon } from "@hugeicons/core-free-icons";
import { IconNote } from "@/components/icon-note";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useFlash } from "@/hooks/use-flash";
import { useUnsavedSection } from "@/admin/unsaved";
import { failureMessage } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  INTEGRATION_KINDS,
  INTEGRATION_LABELS,
  normalizeBaseUrl,
  TOKEN_FOR_NEW_ADDRESS,
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

/** The NetBox and LibreNMS connections of a site. */
export function IntegrationsSection({ siteId }: { siteId: string }) {
  const integrations = useQuery(api.integrations.listForSite, { siteId });
  if (integrations === undefined) return null;
  return (
    <section className="space-y-6 border-t pt-6">
      <h2 className="font-medium">Intégrations</h2>
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
  // Linked devices that a new NetBox address, reaching another instance,
  // would make absent: the admin confirms first (ADR 0039).
  const [otherInstance, setOtherInstance] = useState<number | null>(null);
  const [pending, setPending] = useState<"save" | "test" | null>(null);
  const id = (field: string) => `integration-${kind}-${field}`;

  const normalized = normalizeBaseUrl(kind, baseUrl);
  const connectionChanged =
    integration === null ||
    token !== "" ||
    !("url" in normalized) ||
    normalized.url !== integration.baseUrl ||
    ignoreCertificateErrors !== integration.ignoreCertificateErrors;
  const dirty =
    integration === null
      ? baseUrl.trim() !== "" || token !== ""
      : connectionChanged || enabled !== integration.enabled;
  useUnsavedSection("integrations", label, dirty);

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
      return { field: "token", text: TOKEN_FOR_NEW_ADDRESS };
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const invalid = draftError();
    if (invalid) {
      setError(invalid);
      return;
    }
    void send(false);
  };

  const send = async (confirmOtherInstance: boolean) => {
    setPending(connectionChanged ? "test" : "save");
    setError(null);
    setResult(null);
    try {
      const check = await save({
        ...draft(),
        enabled,
        ...(confirmOtherInstance && { confirmOtherInstance }),
      });
      if (check?.confirmOtherInstance !== undefined) {
        setOtherInstance(check.confirmOtherInstance);
        return;
      }
      if (check === null || check.ok) {
        setToken("");
        if ("url" in normalized) setBaseUrl(normalized.url);
        flashSaved();
      }
      // A refused test leaves the form as typed, which reads as saved.
      setResult(
        check && { ...check, ...(!check.ok && { note: "Non enregistré." }) },
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
      setResult(await test(draft()));
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
      onSubmit={submit}
      className="space-y-4 rounded-lg border p-4"
    >
      {/* The answer belongs to the draft that was sent, so it stays put. */}
      <FieldSet disabled={pending !== null}>
        <div className="flex items-center justify-between gap-4">
          <FieldLegend>{label}</FieldLegend>
          {integration ? (
            <RemoveIntegration
              siteId={siteId}
              integration={integration}
              onSuspend={async () => {
                // The saved connection as it is, collection off: no test.
                await save({
                  siteId,
                  kind,
                  baseUrl: integration.baseUrl,
                  ignoreCertificateErrors: integration.ignoreCertificateErrors,
                  enabled: false,
                });
                setEnabled(false);
              }}
            />
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
              placeholder={integration ? "Jeton enregistré" : undefined}
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
              Collecter depuis {label}
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
            <IconNote icon={Alert02Icon} tone="warning">
              Le jeton peut partir vers un autre serveur que {label}
            </IconNote>
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
          Tester la connexion
        </Button>
        {error?.field === null ? <FieldError>{error.text}</FieldError> : null}
      </div>
      <OtherNetBoxInstance
        devices={otherInstance}
        onCancel={() => setOtherInstance(null)}
        onConfirm={() => {
          setOtherInstance(null);
          void send(true);
        }}
      />
    </form>
  );
}

/**
 * Asks before a new NetBox address that reaches another instance makes the
 * linked devices absent (ADR 0039).
 */
function OtherNetBoxInstance({
  devices,
  onCancel,
  onConfirm,
}: {
  devices: number | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const many = (devices ?? 0) > 1;
  return (
    <AlertDialog
      open={devices !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Changer d'instance NetBox ?</AlertDialogTitle>
          <AlertDialogDescription>
            {/* The purge spares a device on a floor (ADR 0039). */}
            {many
              ? `Hors plan, les ${devices} équipements liés à NetBox seront supprimés dans 30 jours si ce NetBox ne les renvoie pas.`
              : "Hors plan, l'équipement lié à NetBox sera supprimé dans 30 jours si ce NetBox ne le renvoie pas."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            Changer d'instance
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
  // An empty form, or « Enregistrer et tester », already says it is untested.
  if (!shown) return null;
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
            (<Time at={lastCheck.at} />)
          </span>
        ) : null}
        {result?.note ? ` ${result.note}` : null}
      </span>
    </p>
  );
}

// The most critical loss of removing a connection (`releaseNetBox` and
// `releaseLibreNMS` say all of it).
const LOSSES: Record<IntegrationKind, string> = {
  netbox: "Les équipements importés perdent leur lien avec NetBox.",
  librenms:
    "Les adresses MAC vues, les statuts et l'état des ports sont effacés.",
};

function RemoveIntegration({
  siteId,
  integration,
  onSuspend,
}: {
  siteId: string;
  integration: Integration;
  /** Turns collection off instead, the way that keeps everything. */
  onSuspend: () => Promise<void>;
}) {
  const remove = useOnlineMutation(api.integrations.remove);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind } = integration;
  const label = INTEGRATION_LABELS[kind];

  // A refusal keeps the dialog open and says why (A79); success unmounts it
  // with the card's « Retirer ».
  const run = async (action: () => Promise<unknown>) => {
    setPending(true);
    setError(null);
    try {
      await action();
      setOpen(false);
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        Retirer {label}
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setError(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {label} de ce site ?</AlertDialogTitle>
            <AlertDialogDescription>{LOSSES[kind]}</AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <FieldError>{error}</FieldError> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            {integration.enabled ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => void run(onSuspend)}
              >
                Suspendre la collecte
              </Button>
            ) : null}
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => void run(() => remove({ siteId, kind }))}
            >
              Retirer {label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

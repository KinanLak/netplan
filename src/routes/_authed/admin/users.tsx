import { HugeiconsIcon } from "@hugeicons/react";
import { MailSend01Icon, UserAdd01Icon } from "@hugeicons/core-free-icons";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { FormEvent } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { failureMessage } from "@/lib/errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import { ROLE_LABELS } from "@/lib/roles";
import { api } from "../../../../convex/_generated/api";
import { ROLES } from "../../../../convex/lib/roles";
import type { Role } from "../../../../convex/lib/roles";
import { invitationError } from "../../../../convex/lib/userAccounts";

export const Route = createFileRoute("/_authed/admin/users")({
  head: () => ({
    meta: [{ title: "Utilisateurs · Administration" }],
  }),
  component: UsersPage,
});

type UserRow = FunctionReturnType<typeof api.users.list>[number];

const roleItems = ROLES.map((role) => ({
  value: role,
  label: ROLE_LABELS[role],
}));

function UsersPage() {
  const users = useQuery(api.users.list);
  const me = useCurrentUser();
  const [inviting, setInviting] = useState(false);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Utilisateurs</h1>
          <p className="text-sm text-muted-foreground">
            Qui peut ouvrir NetPlan, et avec quel rôle.
          </p>
        </div>
        <Button onClick={() => setInviting(true)}>
          <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
          Inviter
        </Button>
      </header>

      {users === undefined ? null : (
        <ul className="divide-y rounded-lg border">
          {users.map((user) => (
            <UserItem key={user.id} user={user} isMe={user.id === me?.id} />
          ))}
        </ul>
      )}

      <KeycloakSettings />
      <TestMail />
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </div>
  );
}

function UserItem({ user, isMe }: { user: UserRow; isMe: boolean }) {
  const setRole = useMutation(api.users.setRole);
  const setDisabled = useMutation(api.users.setDisabled);
  const resend = useAction(api.users.resendInvitation);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();

  const run = async (change: () => Promise<unknown>, done?: string) => {
    setPending(true);
    setNotice(undefined);
    try {
      await change();
      if (done) setNotice({ error: false, text: done });
    } catch (failure) {
      setNotice({ error: true, text: failureMessage(failure, "admin") });
    } finally {
      setPending(false);
    }
  };

  // A Keycloak account's role follows the role mapping at each login, and
  // an admin keeps their own role so the site always has one.
  const roleLocked = isMe || user.kind === "sso";

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{user.name}</span>
          {isMe ? <Badge variant="secondary">Vous</Badge> : null}
          {user.kind === "sso" ? (
            <Badge variant="outline">Keycloak</Badge>
          ) : null}
          {user.kind === "invited" ? (
            <Badge variant="outline">Invitation en attente</Badge>
          ) : null}
          {user.disabled ? (
            <Badge variant="destructive">Désactivé</Badge>
          ) : null}
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {user.email}
          {user.username ? ` · ${user.username}` : null}
        </p>
        {notice ? (
          notice.error ? (
            <FieldError>{notice.text}</FieldError>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {notice.text}
            </p>
          )
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {user.kind === "invited" && !user.disabled ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              void run(
                () => resend({ userId: user.id }),
                `Invitation renvoyée à ${user.email}.`,
              )
            }
          >
            Renvoyer l'invitation
          </Button>
        ) : null}
        {isMe ? null : user.disabled ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() =>
              void run(() => setDisabled({ userId: user.id, disabled: false }))
            }
          >
            Réactiver
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming(true)}
          >
            Désactiver
          </Button>
        )}
        <Select
          items={roleItems}
          value={user.role}
          disabled={roleLocked || pending}
          onValueChange={(role) => {
            if (role && role !== user.role) {
              void run(() => setRole({ userId: user.id, role }));
            }
          }}
        >
          <SelectTrigger
            aria-label={`Rôle de ${user.name}`}
            className="w-32"
            title={
              user.kind === "sso"
                ? "Suit la correspondance des rôles Keycloak"
                : undefined
            }
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roleItems.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Désactiver « {user.name} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Ses sessions se ferment tout de suite et le compte ne peut plus se
              connecter jusqu'à sa réactivation. Rien de ce qu'il a fait sur le
              plan ne disparaît.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirming(false);
                void run(() =>
                  setDisabled({ userId: user.id, disabled: true }),
                );
              }}
            >
              Désactiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function KeycloakSettings() {
  const settings = useQuery(api.authSettings.keycloak);
  return (
    <section className="space-y-2 border-t pt-6">
      <h2 className="font-medium">Keycloak</h2>
      {settings === undefined ? null : settings.issuer === null ? (
        <p className="text-sm text-muted-foreground">
          La connexion avec Keycloak est désactivée. Pour l'activer, définissez
          KEYCLOAK_ISSUER, KEYCLOAK_CLIENT_ID et KEYCLOAK_CLIENT_SECRET sur le
          serveur.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            La page de connexion propose Keycloak ({settings.issuer}, client{" "}
            {settings.clientId}). Adresse de redirection à déclarer sur le
            client : <code className="break-all">{settings.redirectUri}</code>
          </p>
          <RoleMappingForm settings={settings} />
        </>
      )}
    </section>
  );
}

function RoleMappingForm({
  settings,
}: {
  settings: FunctionReturnType<typeof api.authSettings.keycloak>;
}) {
  const save = useMutation(api.authSettings.setKeycloakRoleMapping);
  const [editorRole, setEditorRole] = useState(settings.editorRole ?? "");
  const [adminRole, setAdminRole] = useState(settings.adminRole ?? "");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setNotice(undefined);
    try {
      await save({ editorRole, adminRole });
      setNotice({
        error: false,
        text: "Correspondance enregistrée. Elle s'applique à la prochaine connexion de chaque compte Keycloak.",
      });
    } catch (failure) {
      setNotice({ error: true, text: failureMessage(failure, "admin") });
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="max-w-md">
      <FieldGroup>
        <FieldDescription>
          Un compte Keycloak est Lecteur, sauf s'il porte l'un des rôles ou
          groupes ci-dessous ; Admin l'emporte. Son rôle est relu à chaque
          connexion.
        </FieldDescription>
        <Field>
          <FieldLabel htmlFor="keycloak-editor-role">
            Rôle Keycloak des Éditeurs
          </FieldLabel>
          <Input
            id="keycloak-editor-role"
            placeholder="Aucun"
            value={editorRole}
            onChange={(event) => setEditorRole(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="keycloak-admin-role">
            Rôle Keycloak des Admins
          </FieldLabel>
          <Input
            id="keycloak-admin-role"
            placeholder="Aucun"
            value={adminRole}
            onChange={(event) => setAdminRole(event.target.value)}
          />
        </Field>
        {notice ? (
          notice.error ? (
            <FieldError>{notice.text}</FieldError>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              {notice.text}
            </p>
          )
        ) : null}
        <div>
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

function TestMail() {
  const send = useAction(api.users.sendTestMail);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();

  const submit = async () => {
    setPending(true);
    setNotice(undefined);
    try {
      const to = await send({});
      setNotice({ error: false, text: `E-mail de test envoyé à ${to}.` });
    } catch (failure) {
      setNotice({ error: true, text: failureMessage(failure, "admin") });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-2 border-t pt-6">
      <h2 className="font-medium">Messagerie</h2>
      <p className="text-sm text-muted-foreground">
        Invitations et mots de passe oubliés partent par le relais SMTP
        configuré sur le serveur. Un e-mail de test vous est adressé pour le
        vérifier.
      </p>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => void submit()}
      >
        <HugeiconsIcon icon={MailSend01Icon} strokeWidth={2} />
        {pending ? "Envoi…" : "Envoyer un e-mail de test"}
      </Button>
      {notice ? (
        notice.error ? (
          <FieldError>{notice.text}</FieldError>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            {notice.text}
          </p>
        )
      ) : null}
    </section>
  );
}

function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const invite = useAction(api.users.invite);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<Role>("reader");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setName("");
      setEmail("");
      setUsername("");
      setRole("reader");
      setError(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      username: username.trim() || undefined,
    };
    const invalid = invitationError(fields);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await invite({ ...fields, role });
      close(false);
    } catch (failure) {
      setError(failureMessage(failure, "admin"));
    } finally {
      setPending(false);
    }
  };

  const edit = (set: (value: string) => void) => (value: string) => {
    set(value);
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <form onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Inviter un utilisateur</DialogTitle>
            <DialogDescription>
              Un lien valable sept jours lui permet de choisir son mot de passe.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="invite-name">Nom</FieldLabel>
              <Input
                id="invite-name"
                value={name}
                autoFocus
                autoComplete="off"
                onChange={(event) => edit(setName)(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-email">Adresse e-mail</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={email}
                autoComplete="off"
                onChange={(event) => edit(setEmail)(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-username">Identifiant</FieldLabel>
              <Input
                id="invite-username"
                value={username}
                autoComplete="off"
                onChange={(event) => edit(setUsername)(event.target.value)}
              />
              <FieldDescription>
                Facultatif : la personne pourra aussi se connecter avec son
                adresse e-mail.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Rôle</FieldLabel>
              <Select
                items={roleItems}
                value={role}
                onValueChange={(next) => {
                  if (next) setRole(next);
                }}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleItems.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Envoi…" : "Envoyer l'invitation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

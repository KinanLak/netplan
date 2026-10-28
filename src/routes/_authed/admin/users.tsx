import { HugeiconsIcon } from "@hugeicons/react";
import {
  MailSend01Icon,
  MoreHorizontalIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useOnlineMutation } from "@/hooks/use-online-mutation";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NO_FILTER, describeUntil, matchesFilter } from "@/admin/users";
import type { UserFilter, UserStatus } from "@/admin/users";
import { Time } from "@/components/time";
import { failureMessage } from "@/lib/errors";
import { ageHint } from "@/lib/time";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useFlash } from "@/hooks/use-flash";
import { useNow } from "@/hooks/use-now";
import { PRESENCE_STALE_AFTER_MS, activePresences } from "@/lib/presence";
import { ROLE_LABELS } from "@/lib/roles";
import { api } from "../../../../convex/_generated/api";
import { ROLES } from "../../../../convex/lib/roles";
import type { Role } from "../../../../convex/lib/roles";
import { invitationProblem } from "../../../../convex/lib/userAccounts";
import type { InvitationField } from "../../../../convex/lib/userAccounts";

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

const roleFilterItems: Array<{ value: Role | "all"; label: string }> = [
  { value: "all", label: "Tous les rôles" },
  ...roleItems,
];

const statusFilterItems: Array<{ value: UserStatus | "all"; label: string }> = [
  { value: "all", label: "Tous les statuts" },
  { value: "active", label: "Actifs" },
  { value: "invited", label: "Invitations en attente" },
  { value: "disabled", label: "Désactivés" },
];

function UsersPage() {
  const users = useQuery(api.users.list);
  const presences = useQuery(api.presences.list);
  const keycloak = useQuery(api.authSettings.keycloak);
  const me = useCurrentUser();
  const now = useNow(PRESENCE_STALE_AFTER_MS);
  const online = new Set(
    activePresences(presences ?? [], null, now).map(({ userId }) => userId),
  );
  const [inviting, setInviting] = useState(false);
  const [filter, setFilter] = useState<UserFilter>(NO_FILTER);
  const shown = users?.filter((user) => matchesFilter(user, filter));
  const filtered =
    filter.search.trim() !== "" ||
    filter.role !== "all" ||
    filter.status !== "all";

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            Utilisateurs
            {users ? (
              <span className="ms-2 font-normal text-muted-foreground tabular-nums">
                {filtered && shown
                  ? `${shown.length} sur ${users.length}`
                  : users.length}
              </span>
            ) : null}
          </h1>
          <p className="text-sm text-muted-foreground">
            Qui peut ouvrir NetPlan, et avec quel rôle.
          </p>
        </div>
        <Button onClick={() => setInviting(true)}>
          <HugeiconsIcon icon={UserAdd01Icon} strokeWidth={2} />
          Inviter
        </Button>
      </header>

      <EmptyRoleMappingNotice />

      {users === undefined || shown === undefined ? null : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              aria-label="Rechercher un utilisateur"
              placeholder="Nom, adresse e-mail ou identifiant"
              className="w-full sm:w-72"
              value={filter.search}
              onChange={(event) =>
                setFilter({ ...filter, search: event.target.value })
              }
            />
            <Select
              items={roleFilterItems}
              value={filter.role}
              onValueChange={(role) => {
                if (role) setFilter({ ...filter, role });
              }}
            >
              <SelectTrigger aria-label="Rôle" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleFilterItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={statusFilterItems}
              value={filter.status}
              onValueChange={(status) => {
                if (status) setFilter({ ...filter, status });
              }}
            >
              <SelectTrigger aria-label="Statut" className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusFilterItems.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {shown.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              <p>Aucun utilisateur ne correspond.</p>
              <Button
                variant="link"
                size="sm"
                onClick={() => setFilter(NO_FILTER)}
              >
                Effacer les filtres
              </Button>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {shown.map((user) => (
                <UserItem
                  key={user.id}
                  user={user}
                  isMe={user.id === me?.id}
                  online={online.has(user.id)}
                  now={now}
                  keycloakEnabled={Boolean(keycloak?.issuer)}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <KeycloakSettings />
      <TestMail />
      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </div>
  );
}

/**
 * On the plan now (presence is per floor, C9), the last sign-in, or how long
 * the invitation link holds.
 */
function Activity({
  user,
  online,
  now,
}: {
  user: UserRow;
  online: boolean;
  now: number;
}) {
  if (online) {
    return (
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-2 rounded-full bg-up" />
        Sur le plan
      </span>
    );
  }
  if (user.kind === "invited") {
    if (user.disabled) {
      return <span>Réactivez le compte pour renvoyer l'invitation.</span>;
    }
    // The query reruns when data changes, not when a link runs out.
    return user.invitationExpiresAt === null ||
      user.invitationExpiresAt <= now ? (
      <span>Aucun lien valable : renvoyez l'invitation.</span>
    ) : (
      <span>
        Lien valable encore{" "}
        <time
          dateTime={new Date(user.invitationExpiresAt).toISOString()}
          title={ageHint(user.invitationExpiresAt, now)}
        >
          {describeUntil(user.invitationExpiresAt, now)}
        </time>
      </span>
    );
  }
  if (user.kind === "awaiting-keycloak") {
    return <span>En attente de sa première connexion avec Keycloak.</span>;
  }
  return user.lastSignInAt === null ? null : (
    <span>
      Dernière connexion <Time at={user.lastSignInAt} now={now} format="age" />
    </span>
  );
}

function UserItem({
  user,
  isMe,
  online,
  now,
  keycloakEnabled,
}: {
  user: UserRow;
  isMe: boolean;
  online: boolean;
  now: number;
  keycloakEnabled: boolean;
}) {
  const setRole = useOnlineMutation(api.users.setRole);
  const setDisabled = useOnlineMutation(api.users.setDisabled);
  const cancelInvitation = useOnlineMutation(api.users.cancelInvitation);
  const signOutEverywhere = useOnlineMutation(api.users.signOutEverywhere);
  const handOver = useOnlineMutation(api.users.handOverToKeycloak);
  const cancelHandover = useOnlineMutation(api.users.cancelHandover);
  const resend = useAction(api.users.resendInvitation);
  const [confirming, setConfirming] = useState<
    "disable" | "cancel" | "sign-out" | "hand-over" | { role: Role } | null
  >(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();
  const [roleSaved, flashRoleSaved] = useFlash();

  const run = async (
    change: () => Promise<unknown>,
    done?: string | (() => void),
  ) => {
    setPending(true);
    setNotice(undefined);
    try {
      await change();
      if (typeof done === "string") setNotice({ error: false, text: done });
      else done?.();
    } catch (failure) {
      setNotice({ error: true, text: failureMessage(failure, "admin") });
    } finally {
      setPending(false);
    }
  };

  const changeRole = (role: Role) =>
    void run(() => setRole({ userId: user.id, role }), flashRoleSaved);

  // A Keycloak account's role follows the role mapping at each login, and
  // an admin keeps their own role so the site always has one.
  const roleLock = isMe
    ? "Un autre administrateur doit changer votre rôle."
    : user.kind === "sso"
      ? "Suit la correspondance des rôles Keycloak, relue à chaque connexion et toutes les heures."
      : user.kind === "awaiting-keycloak"
        ? "Suivra la correspondance des rôles Keycloak dès sa première connexion."
        : null;

  const roleSelect = (
    <Select
      items={roleItems}
      value={user.role}
      disabled={roleLock !== null || pending}
      onValueChange={(role) => {
        if (!role || role === user.role) return;
        // Admin opens users, sites and integrations: giving or taking it
        // is confirmed.
        if (role === "admin" || user.role === "admin") {
          setConfirming({ role });
        } else changeRole(role);
      }}
    >
      <SelectTrigger aria-label={`Rôle de ${user.name}`} className="w-32">
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
  );

  const confirmation =
    confirming === null
      ? null
      : confirming === "disable"
        ? {
            title: `Désactiver « ${user.name} » ?`,
            text: "Ses sessions se ferment tout de suite et le compte ne peut plus se connecter jusqu'à sa réactivation. Rien de ce qu'il a fait sur le plan ne disparaît.",
            action: "Désactiver",
            destructive: true,
            run: () =>
              void run(() => setDisabled({ userId: user.id, disabled: true })),
          }
        : confirming === "sign-out"
          ? {
              title: `Déconnecter « ${user.name} » partout ?`,
              text:
                user.kind === "sso"
                  ? "Ses sessions se ferment tout de suite. Le compte reste actif : à sa prochaine connexion, Keycloak donne à nouveau son rôle."
                  : "Ses sessions se ferment tout de suite. Le compte reste actif et peut se reconnecter aussitôt.",
              action: "Déconnecter partout",
              destructive: false,
              run: () =>
                void run(async () =>
                  setNotice({
                    error: false,
                    text: sessionsEnded(
                      await signOutEverywhere({ userId: user.id }),
                    ),
                  }),
                ),
            }
          : confirming === "hand-over"
            ? {
                title: `Passer « ${user.name} » sur Keycloak ?`,
                text: `Son mot de passe est supprimé et ses sessions se ferment. Sa prochaine connexion avec Keycloak sous ${user.email} retrouvera ce compte, son historique et ses actions ; son rôle suivra alors Keycloak.`,
                action: "Passer sur Keycloak",
                destructive: true,
                run: () => void run(() => handOver({ userId: user.id })),
              }
            : confirming === "cancel"
              ? {
                  title: `Annuler l'invitation de « ${user.name} » ?`,
                  text: "Le compte, qui n'a jamais servi, est supprimé et son lien ne fonctionne plus. Vous pourrez inviter cette adresse à nouveau.",
                  action: "Annuler l'invitation",
                  destructive: true,
                  run: () =>
                    void run(
                      () => cancelInvitation({ userId: user.id }),
                      () =>
                        toast.success(`Invitation de ${user.email} annulée.`),
                    ),
                }
              : {
                  title:
                    confirming.role === "admin"
                      ? `Donner le rôle Admin à « ${user.name} » ?`
                      : `Retirer le rôle Admin à « ${user.name} » ?`,
                  text:
                    confirming.role === "admin"
                      ? "Il pourra gérer les utilisateurs, les sites et leurs intégrations, et changer le rôle des autres administrateurs."
                      : `Il devient ${ROLE_LABELS[confirming.role]} : il ne verra plus l'administration.`,
                  action:
                    confirming.role === "admin"
                      ? "Donner le rôle Admin"
                      : "Retirer le rôle Admin",
                  destructive: false,
                  run: () => changeRole(confirming.role),
                };

  // Rare actions, kept out of the row: only those that apply.
  const moreActions = [
    !user.disabled && (user.kind === "local" || user.kind === "sso")
      ? {
          label: "Déconnecter partout",
          act: () => setConfirming("sign-out"),
        }
      : null,
    keycloakEnabled && (user.kind === "local" || user.kind === "invited")
      ? {
          label: "Passer ce compte sur Keycloak",
          act: () => setConfirming("hand-over"),
        }
      : null,
    user.kind === "awaiting-keycloak"
      ? {
          label: "Annuler le passage sur Keycloak",
          act: () => void run(() => cancelHandover({ userId: user.id })),
        }
      : null,
  ].filter((action) => action !== null);

  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{user.name}</span>
          {isMe ? <Badge variant="secondary">Vous</Badge> : null}
          {user.kind === "sso" || user.kind === "awaiting-keycloak" ? (
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
        <p className="text-xs text-muted-foreground">
          <Activity user={user} online={online} now={now} />
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
        {/* An account that has signed in was used, even without a password
            now: it is disabled, not deleted. */}
        {user.kind === "invited" && user.lastSignInAt === null ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setConfirming("cancel")}
          >
            Annuler l'invitation
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
            onClick={() => setConfirming("disable")}
          >
            Désactiver
          </Button>
        )}
        {isMe || moreActions.length === 0 ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
              aria-label={`Autres actions pour ${user.name}`}
              disabled={pending}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {moreActions.map(({ label, act }) => (
                <DropdownMenuItem key={label} onClick={act}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {roleSaved ? (
          <span role="status" className="text-sm text-muted-foreground">
            Enregistré
          </span>
        ) : null}
        {roleLock ? (
          <Tooltip>
            {/* A disabled select gets no pointer events: the wrapper does. */}
            <TooltipTrigger render={<span tabIndex={0} />}>
              {roleSelect}
            </TooltipTrigger>
            <TooltipContent>{roleLock}</TooltipContent>
          </Tooltip>
        ) : (
          roleSelect
        )}
      </div>
      <AlertDialog
        open={confirmation !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.text}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation?.destructive ? "destructive" : "default"}
              onClick={() => {
                confirmation?.run();
                setConfirming(null);
              }}
            >
              {confirmation?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function sessionsEnded(count: number): string {
  if (count === 0) return "Aucune session n'était ouverte.";
  return count === 1 ? "1 session fermée." : `${count} sessions fermées.`;
}

// An empty mapping is easy to miss: every Keycloak account then arrives as
// a Lecteur, which looks like a fault to them.
function EmptyRoleMappingNotice() {
  const settings = useQuery(api.authSettings.keycloak);
  if (
    !settings ||
    settings.issuer === null ||
    settings.editorRole !== null ||
    settings.adminRole !== null
  ) {
    return null;
  }
  return (
    <p className="rounded-lg border p-3 text-sm">
      Aucune correspondance de rôles Keycloak : tous les comptes Keycloak sont
      Lecteurs.{" "}
      <a
        href="#keycloak"
        className="underline underline-offset-2 hover:text-foreground"
      >
        Choisir les rôles
      </a>
    </p>
  );
}

function KeycloakSettings() {
  const settings = useQuery(api.authSettings.keycloak);
  return (
    <section id="keycloak" className="space-y-2 border-t pt-6">
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
  const save = useOnlineMutation(api.authSettings.setKeycloakRoleMapping);
  const [editorRole, setEditorRole] = useState(settings.editorRole ?? "");
  const [adminRole, setAdminRole] = useState(settings.adminRole ?? "");
  const [acceptGroups, setAcceptGroups] = useState(settings.acceptGroups);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string }>();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setNotice(undefined);
    try {
      await save({ editorRole, adminRole, acceptGroups });
      setNotice({
        error: false,
        text: "Correspondance enregistrée. Chaque compte Keycloak la suit dans l'heure.",
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
          Un compte Keycloak est Lecteur, sauf s'il porte l'un des rôles
          ci-dessous, rôle du royaume ou du client ; Admin l'emporte. Son rôle
          est relu à chaque connexion, puis toutes les heures.
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
        <Field orientation="horizontal">
          <Checkbox
            id="keycloak-accept-groups"
            checked={acceptGroups}
            onCheckedChange={(checked) => setAcceptGroups(checked)}
          />
          <FieldLabel htmlFor="keycloak-accept-groups">
            Accepter aussi les groupes
          </FieldLabel>
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
  const [error, setError] = useState<{
    field: InvitationField | null;
    text: string;
  } | null>(null);
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
    const problem = invitationProblem(fields);
    if (problem) {
      setError({ field: problem.field, text: problem.message });
      document.getElementById(`invite-${problem.field}`)?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await invite({ ...fields, role });
      close(false);
      // The new row shows the account, not that the mail left.
      toast.success(`Invitation envoyée à ${fields.email}.`);
    } catch (failure) {
      setError({ field: null, text: failureMessage(failure, "admin") });
    } finally {
      setPending(false);
    }
  };

  const dirty = name !== "" || email !== "" || username !== "";

  const field = (
    key: InvitationField,
    label: string,
    value: string,
    set: (value: string) => void,
    more: { type?: string; autoFocus?: boolean; hint?: string } = {},
  ) => {
    const invalid = error?.field === key;
    return (
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor={`invite-${key}`}>{label}</FieldLabel>
        <Input
          id={`invite-${key}`}
          type={more.type}
          value={value}
          autoFocus={more.autoFocus}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={invalid ? `invite-${key}-error` : undefined}
          onChange={(event) => {
            set(event.target.value);
            setError(null);
          }}
        />
        {invalid ? (
          <FieldError id={`invite-${key}-error`}>{error.text}</FieldError>
        ) : more.hint ? (
          <FieldDescription>{more.hint}</FieldDescription>
        ) : null}
      </Field>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // A click beside a filled-in form is more often a slip than a "no".
        if (!next && details.reason === "outside-press" && dirty) return;
        close(next);
      }}
    >
      <DialogContent>
        {/* The form checks itself, so its errors read in French. */}
        <form noValidate onSubmit={(event) => void submit(event)}>
          <DialogHeader>
            <DialogTitle>Inviter un utilisateur</DialogTitle>
            <DialogDescription>
              Un lien valable sept jours lui permet de choisir son mot de passe.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            {field("name", "Nom", name, setName, { autoFocus: true })}
            {field("email", "Adresse e-mail", email, setEmail, {
              type: "email",
            })}
            {field("username", "Identifiant", username, setUsername, {
              hint: "Facultatif : la personne pourra aussi se connecter avec son adresse e-mail.",
            })}
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
            {error?.field === null ? (
              <FieldError>{error.text}</FieldError>
            ) : null}
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

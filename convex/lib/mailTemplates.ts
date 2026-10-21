// The mails Netplan sends, in French like the interface.

export interface Mail {
  subject: string;
  text: string;
}

export function resetPasswordMail({
  name,
  url,
}: {
  name: string;
  url: string;
}): Mail {
  return {
    subject: "Netplan : réinitialisation de votre mot de passe",
    text: [
      `Bonjour ${name},`,
      "",
      "Une réinitialisation de votre mot de passe Netplan a été demandée.",
      "Choisissez-en un nouveau avec ce lien, valable une heure :",
      "",
      url,
      "",
      "Vos autres sessions seront fermées. Si vous n'êtes pas à l'origine de",
      "cette demande, ignorez ce message : votre mot de passe ne change pas.",
    ].join("\n"),
  };
}

export function invitationMail({
  name,
  invitedBy,
  url,
  role,
  login,
  appUrl,
}: {
  name: string;
  invitedBy: string;
  url: string;
  /** The role's French name. */
  role: string;
  /** What the person types to sign in: their username, else their address. */
  login: string;
  appUrl: string;
}): Mail {
  return {
    subject: "Bienvenue sur NetPlan",
    text: [
      `Bonjour ${name},`,
      "",
      `${invitedBy} vous a créé un compte sur NetPlan, le plan du réseau,`,
      `avec le rôle ${role}.`,
      "",
      "Choisissez votre mot de passe avec ce lien, valable sept jours :",
      "",
      url,
      "",
      `Ensuite, connectez-vous sur ${appUrl}`,
      `avec l'identifiant ${login}.`,
      "",
      "Passé ce délai, demandez à un administrateur de vous renvoyer",
      "l'invitation.",
    ].join("\n"),
  };
}

export function testMail({ name }: { name: string }): Mail {
  return {
    subject: "Netplan : e-mail de test",
    text: [
      `Bonjour ${name},`,
      "",
      "Cet e-mail confirme que Netplan peut envoyer les invitations et les",
      "liens de réinitialisation de mot de passe.",
    ].join("\n"),
  };
}

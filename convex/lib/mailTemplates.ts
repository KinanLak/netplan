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
    subject: "Choisir un nouveau mot de passe NetPlan",
    text: [
      `Bonjour ${name},`,
      "",
      "Choisissez un nouveau mot de passe NetPlan avec ce lien, valable une",
      "heure.",
      "",
      url,
      "",
      "Si vous n'avez rien demandé, ignorez ce message.",
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
      `${invitedBy} vous a créé un compte NetPlan avec le rôle ${role}.`,
      "",
      "Choisissez votre mot de passe avec ce lien, valable sept jours.",
      "",
      url,
      "",
      `Vous vous connecterez ensuite sur ${appUrl}`,
      `avec l'identifiant ${login}.`,
    ].join("\n"),
  };
}

export function testMail({ name }: { name: string }): Mail {
  return {
    subject: "E-mail de test NetPlan",
    text: [`Bonjour ${name},`, "", "NetPlan envoie bien ses e-mails."].join(
      "\n",
    ),
  };
}

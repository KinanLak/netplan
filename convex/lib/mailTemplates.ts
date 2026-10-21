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
    subject: "NetPlan : réinitialisation de votre mot de passe",
    text: [
      `Bonjour ${name},`,
      "",
      "Une réinitialisation de votre mot de passe NetPlan a été demandée.",
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
}: {
  name: string;
  invitedBy: string;
  url: string;
}): Mail {
  return {
    subject: "NetPlan : votre invitation",
    text: [
      `Bonjour ${name},`,
      "",
      `${invitedBy} vous a créé un compte sur NetPlan, le plan du réseau.`,
      "Choisissez votre mot de passe avec ce lien, valable sept jours :",
      "",
      url,
      "",
      "Passé ce délai, demandez à un administrateur de vous renvoyer",
      "l'invitation.",
    ].join("\n"),
  };
}

export function testMail({ name }: { name: string }): Mail {
  return {
    subject: "NetPlan : e-mail de test",
    text: [
      `Bonjour ${name},`,
      "",
      "Cet e-mail confirme que NetPlan peut envoyer les invitations et les",
      "liens de réinitialisation de mot de passe.",
    ].join("\n"),
  };
}

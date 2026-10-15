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

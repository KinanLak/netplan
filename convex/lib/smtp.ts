// SMTP settings from the Convex environment (ADR 0021), kept apart from the
// Node action that sends so they can be tested without a relay.

export interface SmtpSettings {
  from: string;
  transport: {
    host: string;
    port: number;
    secure: boolean;
    auth?: { user: string; pass: string };
    connectionTimeout: number;
    greetingTimeout: number;
    socketTimeout: number;
  };
}

export type SmtpEnv = Partial<Record<string, string>>;

/**
 * The relay to send through, or the names that must be set first. Port 465
 * means implicit TLS unless `SMTP_SECURE` says otherwise; any other port
 * upgrades with STARTTLS when the relay offers it.
 */
export function readSmtpSettings(
  env: SmtpEnv,
):
  | { ok: true; settings: SmtpSettings }
  | { ok: false; missing: Array<string> } {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  const user = env.SMTP_USER?.trim();
  const missing = [
    ...(host ? [] : ["SMTP_HOST"]),
    ...(from ? [] : ["SMTP_FROM"]),
    ...(user && !env.SMTP_PASSWORD ? ["SMTP_PASSWORD"] : []),
  ];
  if (!host || !from || missing.length > 0) return { ok: false, missing };

  const port = Number(env.SMTP_PORT?.trim() || 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, missing: ["SMTP_PORT"] };
  }
  const secure = env.SMTP_SECURE ? env.SMTP_SECURE === "true" : port === 465;

  return {
    ok: true,
    settings: {
      from,
      transport: {
        host,
        port,
        secure,
        ...(user && env.SMTP_PASSWORD
          ? { auth: { user, pass: env.SMTP_PASSWORD } }
          : {}),
        // An unreachable relay fails the send within seconds instead of
        // holding the action for minutes.
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      },
    },
  };
}

import { describe, expect, it } from "bun:test";
import { readSmtpSettings } from "./smtp";

const relay = { SMTP_HOST: "smtp.example.org", SMTP_FROM: "NetPlan <n@x>" };

describe("readSmtpSettings", () => {
  it("names what is missing instead of sending from nowhere", () => {
    expect(readSmtpSettings({})).toEqual({
      ok: false,
      missing: ["SMTP_HOST", "SMTP_FROM"],
    });
    expect(
      readSmtpSettings({ ...relay, SMTP_USER: "netplan", SMTP_PASSWORD: "" }),
    ).toEqual({ ok: false, missing: ["SMTP_PASSWORD"] });
    expect(readSmtpSettings({ ...relay, SMTP_PORT: "smtp" })).toEqual({
      ok: false,
      missing: ["SMTP_PORT"],
    });
  });

  it("submits on 587 with STARTTLS and no login by default", () => {
    const smtp = readSmtpSettings(relay);
    if (!smtp.ok) throw new Error("expected settings");
    expect(smtp.settings.from).toBe("NetPlan <n@x>");
    expect(smtp.settings.transport).toMatchObject({
      host: "smtp.example.org",
      port: 587,
      secure: false,
    });
    expect(smtp.settings.transport.auth).toBeUndefined();
  });

  it("uses implicit TLS on 465 unless told otherwise, and logs in when given a user", () => {
    const implicit = readSmtpSettings({
      ...relay,
      SMTP_PORT: "465",
      SMTP_USER: "netplan",
      SMTP_PASSWORD: "not-a-secret", // gitleaks:allow
    });
    if (!implicit.ok) throw new Error("expected settings");
    expect(implicit.settings.transport).toMatchObject({
      port: 465,
      secure: true,
      auth: { user: "netplan", pass: "not-a-secret" }, // gitleaks:allow
    });

    const plain = readSmtpSettings({
      ...relay,
      SMTP_PORT: "465",
      SMTP_SECURE: "false",
    });
    expect(plain.ok && plain.settings.transport.secure).toBe(false);
  });
});

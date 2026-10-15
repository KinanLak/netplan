"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { internalAction } from "./_generated/server";
import { readSmtpSettings } from "./lib/smtp";

/**
 * Sends one plain-text mail through the relay the `SMTP_*` variables name.
 * Throws when the relay is not configured or refuses the message, so a
 * caller that waits for it can say why.
 */
export const send = internalAction({
  args: { to: v.string(), subject: v.string(), text: v.string() },
  returns: v.null(),
  handler: async (_ctx, { to, subject, text }) => {
    const smtp = readSmtpSettings(process.env);
    if (!smtp.ok) {
      throw new Error(`Mail is not configured: set ${smtp.missing.join(", ")}`);
    }
    const transport = nodemailer.createTransport(smtp.settings.transport);
    try {
      await transport.sendMail({ from: smtp.settings.from, to, subject, text });
    } finally {
      transport.close();
    }
    return null;
  },
});

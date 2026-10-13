"use node";

import { request as httpsRequest } from "node:https";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { libreNmsApiBaseUrl } from "./librenmsUrl";

declare const process: { env: Record<string, string | undefined> };

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export const request = internalAction({
  args: { path: v.string(), trigger: v.boolean() },
  returns: v.object({
    status: v.number(),
    body: v.string(),
    location: v.optional(v.string()),
  }),
  handler: async (_ctx, args) => {
    const configuredUrl = process.env.LIBRENMS_URL?.trim();
    const token = process.env.LIBRENMS_TOKEN?.trim();
    if (!configuredUrl) throw new Error("LIBRENMS_URL n'est pas configurée");
    if (!token) throw new Error("LIBRENMS_TOKEN n'est pas configuré");
    const base = libreNmsApiBaseUrl(configuredUrl);
    const url = new URL(args.path, base);
    if (
      url.protocol !== "https:" ||
      url.origin !== base.origin ||
      !url.pathname.startsWith(base.pathname)
    ) {
      throw new Error("Endpoint LibreNMS invalide");
    }

    return await new Promise<{
      status: number;
      body: string;
      location?: string;
    }>((resolve, reject) => {
      const httpRequest = httpsRequest(
        url,
        {
          method: "GET",
          family: 4,
          timeout: args.trigger ? 10_000 : 30_000,
          headers: {
            "X-Auth-Token": token,
            Accept: "application/json",
            "User-Agent": "Netplan-LibreNMS-Connector/1.0",
            ...(args.trigger ? { "Cache-Control": "no-store" } : {}),
          },
        },
        (response) => {
          response.setEncoding("utf8");
          let body = "";
          response.on("data", (chunk: string) => {
            body += chunk;
            if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) {
              httpRequest.destroy(
                new Error("Réponse LibreNMS trop volumineuse"),
              );
            }
          });
          response.on("end", () => {
            resolve({
              status: response.statusCode ?? 500,
              body,
              location:
                typeof response.headers.location === "string"
                  ? response.headers.location
                  : undefined,
            });
          });
        },
      );
      httpRequest.on("timeout", () =>
        httpRequest.destroy(new Error("TimeoutError")),
      );
      httpRequest.on("error", reject);
      httpRequest.end();
    });
  },
});

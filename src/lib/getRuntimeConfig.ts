import { createServerFn } from "@tanstack/react-start";
import { readRuntimeConfig } from "@/lib/runtimeConfig";

/** Hands the server's runtime configuration to the browser. */
export const getRuntimeConfig = createServerFn({ method: "GET" }).handler(() =>
  readRuntimeConfig(process.env),
);

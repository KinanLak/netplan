//  @ts-check
import { defineConfig, globalIgnores } from "eslint/config";
import { tanstackConfig } from "@tanstack/eslint-config";

export default defineConfig([
  ...tanstackConfig,
  globalIgnores([
    "dist",
    "node_modules",
    "src/components/ui/**/*",
    "eslint.config.js",
    ".output/**/*",
  ]),
]);

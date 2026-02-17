//  @ts-check
import { defineConfig, globalIgnores } from "eslint/config";
import { tanstackConfig } from "@tanstack/eslint-config";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  ...tanstackConfig,
  reactHooks.configs.flat.recommended,
  globalIgnores([
    "dist",
    "node_modules",
    "src/components/ui/**/*",
    "eslint.config.js",
    ".output/**/*",
    "src/routeTree.gen.ts",
  ]),
]);

import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  // The package ships untranspiled ESM that imports React; bundling it keeps
  // one React instance on the server.
  ssr: { noExternal: ["@convex-dev/better-auth"] },
  // pdf.js Type 1 fonts and CMaps, imported as data URLs by src/overlay/pdf.ts.
  assetsInclude: ["**/*.pfb", "**/*.bcmap"],
  plugins: [
    devtools(),
    nitro({
      // The server bundle has no RSC boundary, so dependency `"use client"`
      // directives are meaningless there.
      rolldownConfig: { checks: { moduleLevelDirective: false } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    babel({
      presets: [reactCompilerPreset()],
    }),
  ],
});

export default config;

/// <reference types="bun" />

import type { ElectrobunConfig } from "electrobun";

const includeWebBuild = Bun.env.NETPLAN_ELECTROBUN_INCLUDE_WEB_BUILD === "1";

export default {
  app: {
    name: "Netplan",
    identifier: "app.netplan.desktop",
    version: "0.1.0",
  },
  runtime: {
    exitOnLastWindowClosed: true,
  },
  build: {
    bun: {
      entrypoint: "src/bun/index.ts",
    },
    copy: includeWebBuild
      ? {
          ".output": ".output",
        }
      : {},
    mac: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        "disable-gpu": false,
      },
    },
    win: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        "disable-gpu": false,
      },
    },
    linux: {
      bundleCEF: true,
      defaultRenderer: "cef",
      chromiumFlags: {
        "disable-gpu": false,
      },
    },
  },
} satisfies ElectrobunConfig;

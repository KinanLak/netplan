/// <reference types="bun" />

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ApplicationMenu, BrowserWindow, PATHS } from "electrobun/bun";

ApplicationMenu.setApplicationMenu([
  {
    label: "Netplan",
    submenu: [{ role: "quit" , accelerator: "CmdOrCtrl+Q" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "pasteAndMatchStyle" },
      { role: "delete" },
      { role: "selectAll" },
    ],
  },
]);

const appUrl = await getAppUrl();

new BrowserWindow({
  title: "Netplan",
  frame: {
    x: 80,
    y: 80,
    width: 1440,
    height: 960,
  },
  url: appUrl,
  renderer: "cef",
});

async function getAppUrl() {
  const devUrl = Bun.env.NETPLAN_DESKTOP_URL;

  if (devUrl) {
    return devUrl;
  }

  const port = Bun.env.NITRO_PORT ?? Bun.env.PORT ?? "38373";

  Bun.env.NITRO_HOST = "127.0.0.1";
  Bun.env.HOST = "127.0.0.1";
  Bun.env.NITRO_PORT = port;
  Bun.env.PORT = port;

  const serverEntry = join(
    PATHS.RESOURCES_FOLDER,
    "app",
    ".output",
    "server",
    "index.mjs",
  );

  await import(pathToFileURL(serverEntry).href);

  return `http://127.0.0.1:${port}`;
}

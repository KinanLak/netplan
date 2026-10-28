import { expect, test } from "@playwright/test";
import type { Page, WebSocketRoute } from "@playwright/test";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev-seed/accounts";

const signIn = async (page: Page) => {
  const editor = DEV_ACCOUNTS.find((account) => account.role === "editor");
  await page.goto("/");
  await page.getByLabel("Identifiant ou e-mail").fill(editor?.username ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page
    .locator('[data-sidebar="menu-sub"]')
    .getByText("Rez-de-chaussée", { exact: true })
    .click();
};

const switchNode = (page: Page) =>
  page.locator(".react-flow__node", {
    has: page.getByText("SW-DEMO-COEUR", { exact: true }),
  });

const position = (page: Page) =>
  switchNode(page).evaluate((node) => (node as HTMLElement).style.transform);

/**
 * Cuts Convex's socket and makes the app's server functions fail, as when
 * the app's server answers but Convex behind it does not. Set up before the
 * page loads.
 */
const backendSwitch = async (page: Page) => {
  let down = false;
  const sockets = new Set<WebSocketRoute>();
  await page.routeWebSocket(/\/api\/[^/]+\/sync/, (socket) => {
    if (down) {
      void socket.close();
      return;
    }
    socket.connectToServer();
    sockets.add(socket);
  });
  await page.route(/\/(_serverFn|api\/auth)\//, (route) =>
    down
      ? route.fulfill({ status: 502, body: "Unable to connect" })
      : route.fallback(),
  );
  return {
    cut: async () => {
      down = true;
      for (const socket of sockets) await socket.close();
      sockets.clear();
    },
    restore: () => {
      down = false;
    },
  };
};

const offlineLine = (page: Page) =>
  page.getByRole("status").getByText(/connexion/);

// ADR 0037: during a backend outage the page keeps its Convex provider and
// its identity across page changes, and works again once the backend
// returns. A page change used to ask the app's server for the session,
// which failed while Convex was down, and the error screen replaced the
// page and dropped the client's identity.
test("a page change during a backend outage keeps the page, and editing works again on its return", async ({
  page,
}) => {
  const backend = await backendSwitch(page);
  await signIn(page);
  await page.getByRole("button", { name: /^Modifier/ }).click();
  await switchNode(page).click();
  const before = await position(page);

  await backend.cut();
  await expect(offlineLine(page)).toBeVisible();

  // Each of these changes the page's URL.
  const errorScreen = page.getByText(/n'a pas pu s'afficher/);
  await page.getByText("PC-DEMO-POSTE-1", { exact: true }).click();
  await expect(errorScreen).toBeHidden();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Inventaire" }).click();
  await expect(page.getByRole("heading", { name: "Inventaire" })).toBeVisible();
  await page.goBack();
  await expect(switchNode(page)).toBeVisible();
  await expect(errorScreen).toBeHidden();

  backend.restore();
  // Convex reconnects on its own backoff, which grew during the outage.
  await expect(offlineLine(page)).toBeHidden({ timeout: 20_000 });

  await switchNode(page).click();
  await page.keyboard.press("ArrowDown");
  const moved = await position(page);
  expect(moved).not.toBe(before);
  // Another page reads what the server holds.
  const other = await page.context().newPage();
  try {
    await other.goto(page.url());
    await expect.poll(() => position(other)).toBe(moved);
  } finally {
    // The seed is shared with the next run and the developer's instance.
    await page.keyboard.press("Control+z");
    await expect.poll(() => position(other)).toBe(before);
  }
});

import { expect, test } from "@playwright/test";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev-seed/accounts";

test("an editor signs in and the seeded demo map opens on both floors", async ({
  page,
}) => {
  const errors: Array<string> = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  const editor = DEV_ACCOUNTS.find((account) => account.role === "editor");
  await page.getByLabel("Identifiant ou e-mail").fill(editor?.username ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(
    page.getByRole("button", { name: "Bâtiment A", exact: true }),
  ).toBeVisible();

  // Offline devices also name their floor in the sidebar.
  const floors = page.locator('[data-sidebar="menu-sub"]');
  await floors.getByText("Rez-de-chaussée", { exact: true }).click();
  // The plan names devices in capitals, and a socket without « Prise ».
  await expect(page.getByText("SW-DEMO-COEUR", { exact: true })).toBeVisible();
  await expect(page.getByText("B-01", { exact: true })).toBeVisible();

  await floors.getByText("Étage 1", { exact: true }).click();
  await expect(
    page.getByText("SW-DEMO-ACCES-E1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("SW-DEMO-COEUR", { exact: true })).toBeHidden();

  expect(errors).toEqual([]);
});

// The server and client builds each hash the stylesheets; a mismatch leaves
// the server-rendered page linking files that do not exist.
test("every stylesheet the server renders is served", async ({ request }) => {
  const html = await (await request.get("/")).text();
  const hrefs = Array.from(
    html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g),
    (match) => match[1],
  );
  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    expect({ href, status: (await request.get(href)).status() }).toEqual({
      href,
      status: 200,
    });
  }
});

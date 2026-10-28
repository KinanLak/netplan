import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { DEV_ACCOUNTS, DEV_PASSWORD } from "../src/dev-seed/accounts";

const signInAsEditor = async (page: Page) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  const editor = DEV_ACCOUNTS.find((account) => account.role === "editor");
  await page.getByLabel("Identifiant ou e-mail").fill(editor?.username ?? "");
  await page.getByLabel("Mot de passe", { exact: true }).fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
};

test("an editor signs in and the seeded demo map opens on both floors", async ({
  page,
}) => {
  const errors: Array<string> = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await signInAsEditor(page);

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

// A7: the seed's first floor is the ground floor, so a reload that fell back
// to it would show the core switch.
test("a reload or a link keeps a floor other than the first, and its view", async ({
  page,
}) => {
  await signInAsEditor(page);
  const floors = page.locator('[data-sidebar="menu-sub"]');
  await floors.getByText("Étage 1", { exact: true }).click();
  const accessSwitch = page.getByText("SW-DEMO-ACCES-E1", { exact: true });
  await expect(accessSwitch).toBeVisible();

  const viewport = page.locator(".react-flow__viewport");
  const fitted = await viewport.getAttribute("style");
  await page.locator(".react-flow__pane").hover();
  await page.mouse.wheel(0, -300);
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(fitted);
  const zoomed = await viewport.getAttribute("style");
  // Kept for the tab once the zoom has settled.
  const keptZoom = () =>
    page.evaluate(
      () =>
        (
          JSON.parse(
            sessionStorage.getItem("netplan:view:floor:demo:a:etage-1") ?? "{}",
          ) as { zoom?: number }
        ).zoom,
    );
  await expect
    .poll(keptZoom)
    .toBe(Number(/scale\(([\d.]+)\)/.exec(zoomed ?? "")?.[1]));

  await page.reload();
  await expect(accessSwitch).toBeVisible();
  await expect(page.getByText("SW-DEMO-COEUR", { exact: true })).toBeHidden();
  await expect(page).toHaveURL(/floor=floor(%3A|:)demo(%3A|:)a(%3A|:)etage-1/);
  await expect
    .poll(async () => await viewport.getAttribute("style"))
    .toBe(zoomed);

  const linked = await page.context().newPage();
  await linked.goto(
    "/?floor=floor:demo:a:etage-1&device=device:demo:etage-1:poste-e1-4",
  );
  await expect(
    linked.getByText("SW-DEMO-ACCES-E1", { exact: true }),
  ).toBeVisible();
  await expect(
    linked.getByRole("complementary").filter({ hasText: "pc-demo-poste-e1-4" }),
  ).toBeVisible();
  await expect(linked).toHaveURL(
    /device=device(%3A|:)demo(%3A|:)etage-1(%3A|:)poste-e1-4/,
  );
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

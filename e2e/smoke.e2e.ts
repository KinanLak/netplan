import { expect, test } from "@playwright/test";

test("the seeded demo map opens on both floors", async ({ page }) => {
  const errors: Array<string> = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.goto("/");
  await expect(page.getByRole("button", { name: "Bâtiment A" })).toBeVisible();

  await page.getByText("Rez-de-chaussée", { exact: true }).click();
  await expect(page.getByText("sw-demo-coeur", { exact: true })).toBeVisible();
  await expect(page.getByText("Prise B-01", { exact: true })).toBeVisible();

  await page.getByText("Étage 1", { exact: true }).click();
  await expect(
    page.getByText("sw-demo-acces-e1", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("sw-demo-coeur", { exact: true })).toBeHidden();

  expect(errors).toEqual([]);
});

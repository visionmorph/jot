const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("creates variant previews and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const previews = page.locator(".variant-preview");
  await expect(previews).toHaveCount(0);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  await expect(previews).toHaveCount(2);
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(previews).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(previews).toHaveCount(2);
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
});

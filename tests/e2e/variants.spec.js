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

test("changes only the selected variant fill and supports undo and redo", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const roots = page.locator(".variant-preview .canvas-root-stack");
  await expect(roots).toHaveCount(2);

  const colorHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(roots.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(roots.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgb(204, 85, 0)");
});

const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("starts new variant text with an empty caret", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  const selectedRoot = previews.nth(1).locator(".canvas-root-stack");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await selectedRoot.click({ position: { x: 40, y: 40 } });

  const text = selectedRoot.locator(":scope > .canvas-text");
  await expect(text).toHaveCount(1);
  await expect(text).toBeFocused();
  await expect(text).toHaveText("");
  await expect.poll(() => text.evaluate((element) => {
    const selection = window.getSelection();
    return selection?.isCollapsed === true && element.contains(selection.anchorNode);
  })).toBe(true);
});

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

test("reorders variant previews and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const addVariant = page.getByRole("button", { name: "Add variant preview" });
  const previews = page.locator(".variant-preview");
  const previewOrder = () => previews.evaluateAll((elements) => (
    elements.map((element) => element.dataset.variantInstanceId)
  ));

  await addVariant.click();
  await addVariant.click();
  await expect(previews).toHaveCount(3);
  await expect.poll(previewOrder).toEqual(["1", "2", "3"]);

  await previews.nth(2).focus();
  await previews.nth(2).press("ArrowLeft");
  await expect.poll(previewOrder).toEqual(["1", "3", "2"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(previewOrder).toEqual(["1", "2", "3"]);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(previewOrder).toEqual(["1", "3", "2"]);
});

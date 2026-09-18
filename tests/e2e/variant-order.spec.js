const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
test("reorders variant previews and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const addVariant = page.getByRole("button", { name: "Add variant preview" });
  const previews = page.locator(".variant-preview");
  const previewOrder = () => previews.evaluateAll((elements) => (
    elements.map((element) => element.dataset.variantId)
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

test("uses layer front and back commands for selected variants", async ({ page }) => {
  await openApp(page);

  const addVariant = page.getByRole("button", { name: "Add variant preview" });
  const previews = page.locator(".variant-preview");
  const previewOrder = () => previews.evaluateAll((elements) => (
    elements.map((element) => element.dataset.variantId)
  ));

  await addVariant.click();
  await addVariant.click();
  await previews.nth(0).click();
  await expect.poll(() => page.evaluate(() => getSelectedVariantIds())).toEqual([1]);
  await page.keyboard.press("]");
  await expect.poll(previewOrder).toEqual(["2", "3", "1"]);

  await page.keyboard.press("[");
  await expect.poll(previewOrder).toEqual(["1", "2", "3"]);
});

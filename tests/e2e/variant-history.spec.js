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

test("cycles whole variants with Tab and Shift+Tab", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  await previews.nth(0).locator(".canvas-root-stack").click();
  await previews.nth(0).focus();

  await page.keyboard.press("Tab");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(0)).toBeFocused();
});

test("bulk deletes selected variants", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  await roots.nth(1).click();
  await roots.nth(2).click({ modifiers: ["Shift"] });
  await previews.nth(2).focus();
  await page.keyboard.press("Delete");
  await expect(previews).toHaveCount(1);
});

test("duplicate preserves inherited style sync", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    const [base, child] = variantModel.getVariants();
    upsertLocalVariantOverride(base, "component:0", "backgroundColor", "#CC0000");
    selectVariantState(child.id, null);
    renderTree();
  });
  await page.locator(".variant-preview").nth(1).focus();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator(".variant-preview")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => {
    const copy = variantModel.getVariants()[2];
    return { parentVariantId: copy.parentVariantId, overrides: copy.overrides };
  })).toEqual({ parentVariantId: 1, overrides: [] });

  await page.evaluate(() => {
    upsertLocalVariantOverride(variantModel.getVariants()[0], "component:0", "backgroundColor", "#336699");
    renderVariants();
  });
  await expect(page.locator(".variant-preview").nth(2).locator(".canvas-root-stack"))
    .toHaveCSS("background-color", "rgb(51, 102, 153)");
});

test("duplicates a frame and its text from a variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Nested label",
    });
    addVariant();
    const selectedVariant = variantModel.getVariants()[1];
    upsertLocalVariantOverride(selectedVariant, "text:1", "textContent", "Variant label");
    upsertLocalVariantOverride(selectedVariant, "text:1", "color", "#CC0000");
    selectVariantState(selectedVariant.id, `frame:${frame.id}`);
    renderTree();
  });
  await page.locator('.variant-preview[data-variant-id="2"] [data-frame-id="1"]').focus();
  await page.keyboard.press("ControlOrMeta+d");

  await expect(page.locator('.variant-preview [data-frame-id="2"]')).toHaveCount(2);
  await expect(page.locator('.variant-preview [data-frame-id="2"] > [data-text-id="2"]')).toHaveCount(2);
  await expect(page.locator('.variant-preview[data-variant-id="1"] [data-frame-id="2"] > [data-text-id="2"]'))
    .toHaveText("Nested label");
  const selectedVariantText = page.locator(
    '.variant-preview[data-variant-id="2"] [data-frame-id="2"] > [data-text-id="2"]',
  );
  await expect(selectedVariantText).toHaveText("Variant label");
  await expect(selectedVariantText).toHaveCSS("color", "rgb(204, 0, 0)");
});

test("keeps transparent paint empty across multiple variants and layer types", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
    addVariant();
    const variants = variantModel.getVariants();
    variants.forEach((variant) => {
      upsertLocalVariantOverride(variant, "component:0", "backgroundColor", "transparent");
      upsertLocalVariantOverride(variant, "frame:1", "backgroundColor", "transparent");
      upsertLocalVariantOverride(variant, "text:1", "color", "transparent");
    });
    selectVariantsLayerTargetsState(variants.map((variant) => variant.id), ["text:1"]);
    renderTree();
  });

  await expect(page.locator('[data-selection-colors] [data-color-control="selection"]')).toHaveCount(0);
  await expect(page.locator('[data-color-control="text"]')).toBeHidden();

  await page.evaluate(() => {
    selectVariantsLayerTargetsState(variantModel.getVariants().map((variant) => variant.id), ["frame:1"]);
    renderTree();
  });
  await expect(page.locator('[data-selection-colors] [data-color-control="selection"]')).toHaveCount(0);
  await expect(page.locator('[data-color-control="frame-background"]')).toBeHidden();

  await page.evaluate(() => {
    selectVariantsState(variantModel.getVariants().map((variant) => variant.id));
    renderTree();
  });
  await expect(page.locator('[data-selection-colors] [data-color-control="selection"]')).toHaveCount(0);
  await expect(page.locator('[data-color-control="frame-background"]')).toBeHidden();
});


const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
test("tree base visibility changes propagate to every variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Label",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Sibling",
    });
    const variantProp = variantModel.addProp({ name: "visible", type: "boolean", defaultValue: true });
    componentProps.push({
      id: nextComponentPropId++,
      name: "visible",
      type: "boolean",
      property: "visibility",
      targetFrameId: null,
      targetTextId: text.id,
      targetVectorId: null,
      defaultValue: true,
      variantPropId: variantProp.id,
    });
    addVariant();
    variantModel.getVariants().forEach((variant) => { variant.propValues[variantProp.id] = true; });
    selectComponentState(currentComponent.id);
    renderTree();
  });

  const previewSiblings = page.locator('.variant-preview [data-text-id="2"]');
  const siblingOffsetsBefore = await previewSiblings.evaluateAll((elements) => elements.map((element) => {
    const root = element.closest(".canvas-root-stack");
    return element.getBoundingClientRect().left - root.getBoundingClientRect().left;
  }));
  await page.getByRole("button", { name: "Hide Label" }).click({ force: true });
  const previewTexts = page.locator('.variant-preview [data-text-id="1"]');
  await expect(previewTexts).toHaveCount(2);
  await expect(previewTexts.nth(0)).toHaveCSS("display", "none");
  await expect(previewTexts.nth(1)).toHaveCSS("display", "none");
  await expect.poll(() => previewSiblings.evaluateAll((elements) => elements.map((element) => {
    const root = element.closest(".canvas-root-stack");
    return element.getBoundingClientRect().left - root.getBoundingClientRect().left;
  }))).toEqual(siblingOffsetsBefore.map(() => 10));
  expect(siblingOffsetsBefore.every((offset) => offset > 10)).toBe(true);
});

test("tree visibility follows and edits one selected variant", async ({ page }) => {
  await openApp(page);
  const variantIds = await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Label",
    });
    text.name = "Label";
    addVariant({ render: false });
    const variants = variantModel.getVariants();
    selectVariantState(variants[1].id, `text:${text.id}`);
    renderVariants();
    renderTree();
    return variants.map((variant) => variant.id);
  });

  const treeVisibility = page.getByRole("button", { name: "Hide Label", exact: true });
  await expect(treeVisibility).toBeEnabled();
  await treeVisibility.click({ force: true });

  const previewLabels = page.locator('.variant-preview [data-text-id="1"]');
  await expect(previewLabels.nth(0)).toBeVisible();
  await expect(previewLabels.nth(1)).toHaveCSS("display", "none");
  await expect(page.getByRole("button", { name: "Show Label", exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate((variantId) => ({
    baseVisibility: getTextRecord(1).element.dataset.layerVisibility ?? "visible",
    override: getLocalVariantOverride(getVariant(variantId), "text:1", "visibility")?.value,
  }), variantIds[1])).toEqual({ baseVisibility: "visible", override: false });

  await page.evaluate(() => {
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await expect(page.getByRole("button", { name: "Hide Label", exact: true })).toBeEnabled();

  await page.evaluate((variantId) => {
    selectVariantState(variantId, "text:1");
    renderTree();
  }, variantIds[1]);
  await page.getByRole("button", { name: "Show Label", exact: true }).click({ force: true });
  await expect(previewLabels.nth(0)).toBeVisible();
  await expect(previewLabels.nth(1)).toBeVisible();
  await expect.poll(() => page.evaluate((variantId) => (
    getLocalVariantOverride(getVariant(variantId), "text:1", "visibility")?.value
  ), variantIds[1])).toBe(true);

  await page.evaluate(() => {
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Hide Label", exact: true }).click({ force: true });
  await expect(previewLabels.nth(0)).toHaveCSS("display", "none");
  await expect(previewLabels.nth(1)).toBeVisible();
  await expect(page.getByRole("button", { name: "Show Label", exact: true })).toBeEnabled();

  await page.evaluate((variantId) => {
    selectVariantState(variantId, "text:1");
    renderTree();
  }, variantIds[1]);
  await expect(page.getByRole("button", { name: "Hide Label", exact: true })).toBeEnabled();
});

test("canvas variant selection refreshes tree visibility without a full render", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Label",
    });
    text.name = "Label";
    addVariant({ render: false });
    const variants = variantModel.getVariants();
    upsertLocalVariantOverride(variants[1], `text:${text.id}`, "visibility", false);
    selectComponentState(currentComponent.id);
    renderVariants();
    renderTree();
  });

  const roots = page.locator(".variant-preview .canvas-root-stack");
  await expect(page.getByRole("button", { name: "Hide Label", exact: true })).toBeEnabled();

  await roots.nth(1).click();
  await expect(page.getByRole("button", { name: "Show Label", exact: true })).toBeEnabled();

  await roots.nth(0).click();
  await expect(page.getByRole("button", { name: "Hide Label", exact: true })).toBeEnabled();
});

test("tree text follows the selected variant without duplicating text names", async ({ page }) => {
  await openApp(page);
  const variantIds = await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Helper text",
    });
    addVariant({ render: false });
    const variants = variantModel.getVariants();
    upsertLocalVariantOverride(
      variants[1],
      `text:${text.id}`,
      "richTextHtml",
      '<span data-rich-text-color="true">Error</span> message',
    );
    selectComponentState(currentComponent.id);
    renderVariants();
    renderTree();
    return variants.map((variant) => variant.id);
  });

  const treeLabel = page.locator('[data-selection-layer-key="text:1"] .tree-node-label');
  const previews = page.locator('.variant-preview [data-text-id="1"]');
  await expect(treeLabel).toHaveText("Helper text");

  await page.locator(".variant-preview .canvas-root-stack").nth(1).click();
  await expect(treeLabel).toHaveText("Error message");

  await previews.nth(1).dblclick();
  await previews.nth(1).fill("Required field");
  await expect(treeLabel).toHaveText("Required field");
  await expect(previews.nth(0)).toHaveText("Helper text");
  await expect.poll(() => page.evaluate((variantId) => ({
    baseText: getTextRecord(1).element.textContent,
    overrides: getVariant(variantId).overrides
      .filter((override) => override.target === "text:1")
      .map((override) => override.property),
  }), variantIds[1])).toEqual({ baseText: "Helper text", overrides: ["textContent"] });

  await previews.nth(1).press("Escape");
  await treeLabel.dblclick();
  const treeEditor = page.getByRole("textbox", { name: "Rename Required field" });
  await treeEditor.fill("Invalid email");
  await treeEditor.press("Enter");
  await expect(previews.nth(1)).toHaveText("Invalid email");
  await expect(previews.nth(0)).toHaveText("Helper text");
});


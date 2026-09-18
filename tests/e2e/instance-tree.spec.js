const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("instance tree expands source frames and Delete hides an occurrence layer", async ({ page }) => {
  await openApp(page);
  const { owner, source } = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord);
    createCanvasText(frame, 0, 0, { textContent: "Link", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source, { name: "First" });
    addComponentInstance(owner, source, { name: "Second" });
    return { owner, source };
  });
  const first = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] .canvas-text');
  const second = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] .canvas-text');
  const instanceRow = page.locator('.tree-node[data-selection-layer-key="component-instance:1"]');
  await expect(instanceRow).toHaveAttribute("aria-expanded", "false");
  await instanceRow.getByRole("button", { name: "Expand First" }).click();
  const frameRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"frame\\\""]');
  await expect(frameRow).toHaveCount(1);
  await frameRow.getByRole("button", { name: "Expand Frame 1" }).click();
  await page.evaluate(() => restoreWorkspaceState(JSON.parse(JSON.stringify(captureWorkspaceState()))));
  await expect(instanceRow).toHaveAttribute("aria-expanded", "true");
  await expect(frameRow).toHaveAttribute("aria-expanded", "true");
  const textRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"text\\\""]');
  await expect(textRow).toHaveCount(1);
  await textRow.locator(".tree-node-label").click();
  const selectedState = await page.evaluate(() => ({ selectedNestedInstanceLayer,
    selectedLayerKeys: [...selectedLayerKeys], selectedVariantId,
    resolved: Boolean(getSelectedNestedInstanceLayer()),
    active: currentComponent.id }));
  expect(selectedState.resolved, JSON.stringify(selectedState)).toBe(true);
  await expect(page.locator("[data-text-inspector]")).toBeVisible();
  await expect(page.locator(".nested-instance-inspector")).toHaveCount(0);
  await page.keyboard.press("Delete");
  await expect(first).toBeHidden();
  await expect(second).toBeVisible();
  await expect(textRow).toHaveCount(1);
  expect(await page.evaluate(({ owner, source }) => ({
    sourceLayers: getComponentDefinition(source).layers.length,
    override: getComponentDefinition(owner).layers[0].layerOverrides,
    sibling: getComponentDefinition(owner).layers[1].layerOverrides,
  }), { owner, source })).toMatchObject({ sourceLayers: 2, override: [{ property: "visibility", value: "hidden" }], sibling: [] });
  await page.keyboard.press("Control+z");
  await expect(first).toBeVisible();
});

test("nested component occurrences expand and hide their own descendants", async ({ page }) => {
  await openApp(page);
  const { owner, middle, leaf } = await page.evaluate(() => {
    const owner = currentComponent.id;
    const leaf = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Nested", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    const middle = addComponent().id;
    addComponentInstance(middle, leaf, { name: "Leaf" });
    activateComponent(owner);
    addComponentInstance(owner, middle, { name: "Middle" });
    addComponentInstance(owner, middle, { name: "Sibling" });
    return { owner, middle, leaf };
  });
  const rootRow = page.locator('.tree-node[data-selection-layer-key="component-instance:1"]');
  await rootRow.getByRole("button", { name: "Expand Middle" }).click();
  const nestedRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="component-instance"]');
  await nestedRow.locator(".tree-node-label").click();
  await expect(page.getByRole("region", { name: "Component instance" })).toBeVisible();
  await nestedRow.getByRole("button", { name: "Expand Leaf" }).click();
  const textRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"text\\\""]');
  await textRow.locator(".tree-node-label").click();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] .canvas-text')).toBeHidden();
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] .canvas-text')).toBeVisible();
  expect(await page.evaluate(({ owner, middle, leaf }) => ({
    target: getComponentDefinition(owner).layers[0].layerOverrides[0].target,
    middleCount: getComponentDefinition(middle).layers.length,
    leafCount: getComponentDefinition(leaf).layers.length,
  }), { owner, middle, leaf })).toMatchObject({ target: { kind: "placed", ownerComponentId: middle, instancePath: [1] }, middleCount: 1, leafCount: 1 });
});

test("Delete in a parent variant hides only that variant's occurrence", async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Variant link", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source, { name: "Variant instance" });
    addVariant();
    variantModel.getVariants().forEach(variant => { variant.parentVariantId = null; });
    commitCanvasComponentData();
    return variantModel.getVariants().map(variant => variant.id);
  });
  await page.evaluate(id => selectVariantState(id, "component-instance:1"), ids[0]);
  const rootRow = page.locator('.tree-node[data-selection-layer-key="component-instance:1"]');
  await rootRow.getByRole("button", { name: "Expand Variant instance" }).click();
  const textRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"text\\\""]');
  await textRow.locator(".tree-node-label").click();
  await page.keyboard.press("Delete");
  await expect(page.locator(`.variant-preview[data-variant-id="${ids[0]}"] [data-component-instance-id="1"] .canvas-text`)).toBeHidden();
  await expect(page.locator(`.variant-preview[data-variant-id="${ids[1]}"] [data-component-instance-id="1"] .canvas-text`)).toBeVisible();
  await expect(textRow).toHaveCount(1);
  await textRow.getByRole("button", { name: /Show Variant link in this instance/ }).click();
  await expect(page.locator(`.variant-preview[data-variant-id="${ids[0]}"] [data-component-instance-id="1"] .canvas-text`)).toBeVisible();
});

test("deleting a nested component-instance row hides that occurrence rather than removing it", async ({ page }) => {
  await openApp(page);
  const owner = await page.evaluate(() => {
    const owner = currentComponent.id;
    const leaf = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Leaf", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    const middle = addComponent().id;
    addComponentInstance(middle, leaf, { name: "Nested leaf" });
    activateComponent(owner);
    addComponentInstance(owner, middle, { name: "Outer" });
    addComponentInstance(owner, middle, { name: "Other" });
    return owner;
  });
  await page.locator('.tree-node[data-selection-layer-key="component-instance:1"]')
    .getByRole("button", { name: "Expand Outer" }).click();
  const nestedRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="component-instance"]');
  await nestedRow.locator(".tree-node-label").click();
  await page.keyboard.press("Delete");
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] [data-component-instance-id="1"]')).toBeHidden();
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] [data-component-instance-id="1"]')).toBeVisible();
  expect(await page.evaluate(owner => ({
    sourceCount: getComponentDefinition(getComponentDefinition(owner).layers[0].sourceComponentId).layers.length,
    override: getComponentDefinition(owner).layers[0].layerOverrides[0],
  }), owner)).toMatchObject({ sourceCount: 1, override: { target: { type: "component-instance" }, property: "visibility", value: "hidden" } });
});

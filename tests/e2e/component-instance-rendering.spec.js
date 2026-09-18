const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function setup(page) {
  await openApp(page);
  return page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Enabled", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    const definition = getComponentDefinition(source);
    const target = createSourceLayerIdentity(source, "text", 1);
    definition.variantProps = [{ id: 1, name: "State", type: "enum", options: ["enabled", "selected"] }];
    definition.variantRules = [{ id: 1, target, property: "color", value: "#336699", conditions: { 1: "selected" } }];
    definition.variants = [
      { id: 1, name: "Enabled", componentId: source, parentVariantId: null, propValues: { 1: "enabled" }, overrides: [{ target, property: "fontWeight", value: "700" }] },
      { id: 2, name: "Selected", componentId: source, parentVariantId: 1, propValues: { 1: "selected" }, overrides: [{ target, property: "textContent", value: "Selected" }] },
    ];
    updateComponentDefinition(source, definition);
    activateComponent(owner);
    addComponentInstance(owner, source, { name: "First tab", variantId: 1 });
    addComponentInstance(owner, source, { name: "Second tab", variantId: 2 });
    return { owner, source };
  });
}

test("renders repeated source variants with isolated identities and inherited styles", async ({ page }) => {
  const { owner, source } = await setup(page);
  const roots = page.locator('[data-canvas-root-stack] > .canvas-component-instance');
  await expect(roots.nth(0)).toHaveText("Enabled");
  await expect(roots.nth(1)).toHaveText("Selected");
  await expect(roots.nth(1).locator('.canvas-text')).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(roots.nth(1).locator('.canvas-text')).toHaveCSS("font-weight", "700");
  expect(await page.evaluate(() => {
    const bounds = canvasRootStack.getBoundingClientRect();
    return [...canvasRootStack.querySelectorAll(':scope > .canvas-component-instance')]
      .every(node => node.getBoundingClientRect().right <= bounds.right);
  })).toBe(true);
  expect(await page.evaluate(() => collectPaintMembers([{ element: canvasRootStack, includeDescendants: true }])
    .every(member => !member.element.closest('.component-instance-content')))).toBe(true);
  const result = await page.evaluate(({ owner, source }) => {
    const address = createPlacedLayerIdentity(owner, [2], createSourceLayerIdentity(source, "text", 1));
    const text = findLayerElementByIdentity(canvasRootStack, address);
    const before = JSON.stringify(getComponentDefinition(owner));
    const detached = renderComponentDefinition(getComponentDefinition(owner));
    return { text: text.textContent, hit: resolveCanvasHit(text).kind,
      records: layerRecords.length, same: before === JSON.stringify(getComponentDefinition(owner)),
      detached: findLayerElementByIdentity(detached, address).textContent,
      paths: [...canvasRootStack.querySelectorAll('.component-instance-content')].map(node => JSON.parse(node.dataset.identityPath)) };
  }, { owner, source });
  expect(result).toEqual({ text: "Selected", hit: "layer", records: 2, same: true, detached: "Selected", paths: [[1], [2]] });
  await page.screenshot({ path: "test-results/instance-rendering.png" });
});

test("updates component-instance hug and fill sizing on canvas and in export styles", async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Tab", beginEditing: false, isNew: false });
    const definition = getComponentDefinition(source);
    definition.variants = [
      { id: 1, name: "Hug", componentId: source, parentVariantId: null, propValues: {},
        overrides: [{ target: "component:0", property: "width", value: "auto" }] },
      { id: 2, name: "Fill", componentId: source, parentVariantId: null, propValues: {},
        overrides: [{ target: "component:0", property: "width", value: "100%" }] },
    ];
    updateComponentDefinition(source, definition);
    activateComponent(owner);
    currentComponent.frameRecord.element.dataset.direction = "vertical";
    currentComponent.frameRecord.element.style.flexDirection = "column";
    currentComponent.frameRecord.element.dataset.widthMode = "fixed";
    currentComponent.frameRecord.element.dataset.width = "300";
    applyLayerSizing("frame", currentComponent.frameRecord);
    commitCanvasComponentData();
    const instance = addComponentInstance(owner, source, { variantId: 1 });
    return { owner, instanceId: instance.id };
  });

  const instance = page.locator(`[data-canvas-root-stack] > [data-component-instance-id="${ids.instanceId}"]`);
  const hugWidth = await instance.evaluate(element => element.getBoundingClientRect().width);
  expect(hugWidth).toBeLessThan(200);

  await page.evaluate(({ owner, instanceId }) => {
    const definition = getComponentDefinition(owner);
    definition.layers.find(layer => layer.type === "component-instance" && layer.id === instanceId).variantId = 2;
    updateComponentDefinition(owner, definition);
    activateComponent(owner);
  }, ids);
  await expect(instance.locator(".component-instance-content")).toHaveAttribute("data-width-mode", "fill");
  await expect(instance).toHaveCSS("align-self", "stretch");
  expect(await instance.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(250);

  const exportStyle = await page.evaluate(instanceId => {
    const record = getLayerRecord({ type: "component-instance", id: instanceId });
    return getExportLayerStyleState({ type: "component-instance", record }, [], null).style;
  }, ids.instanceId);
  expect(exportStyle).toMatchObject({ width: "100%", alignSelf: "stretch" });
});

test("refreshes inactive source changes and nested placements without modifying authored owners", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(({ owner, source }) => {
    const middle = addComponent().id;
    addComponentInstance(middle, source, { variantId: 2 });
    activateComponent(owner);
    addComponentInstance(owner, middle);
  }, { owner, source });
  const nested = page.locator('[data-canvas-root-stack] > [data-component-instance-id="3"] .canvas-text');
  await expect(nested).toHaveText("Selected");
  const before = await page.evaluate(() => ({ data: JSON.stringify(getComponentDefinition(currentComponent.id)), history: undoHistory.length }));
  await page.evaluate(source => {
    const definition = getComponentDefinition(source);
    definition.variants[1].overrides[0].value = "Updated";
    updateComponentDefinition(source, definition);
  }, source);
  await expect(nested).toHaveText("Updated");
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] .canvas-text')).toHaveText("Updated");
  await expect.poll(() => page.evaluate(() => ({ data: JSON.stringify(getComponentDefinition(currentComponent.id)), history: undoHistory.length }))).toEqual(before);
});

test("missing variants and components show recoverable placeholders and preserve dimensions", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(({ owner, source }) => {
    const parent = getComponentDefinition(owner);
    parent.layers[1].style = "width: 180px; height: 60px;";
    updateComponentDefinition(owner, parent);
    const definition = getComponentDefinition(source);
    definition.variants = definition.variants.filter(v => v.id !== 2);
    updateComponentDefinition(source, definition);
  }, { owner, source });
  const second = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"]');
  await expect(second).toHaveText("⚠ Missing variant");
  await expect(second.locator('.component-instance-placeholder')).toHaveCSS("width", "180px");
  await expect(page.getByRole("treeitem").filter({ hasText: "Second tab · Missing variant" })).toBeVisible();
  await page.screenshot({ path: "test-results/instance-placeholder.png" });
  await page.evaluate(({ owner, source }) => {
    activateComponent(source);
    undoWorkspaceChange();
    activateComponent(owner);
  }, { owner, source });
  await expect(second).toHaveText("Selected");
  await page.evaluate(source => { activateComponent(source); selectComponentState(source); deleteSelectedComponent(); }, source);
  await expect(second).toHaveText("⚠ Missing component");
  await page.evaluate(() => undoWorkspaceChange());
  await page.evaluate(owner => activateComponent(owner), owner);
  await expect(second).toHaveText("Selected");
});

test("parent variant previews edit instance labels without colliding with local text", async ({ page }) => {
  const { owner } = await setup(page);
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Local", beginEditing: false, isNew: false });
    addVariant();
  });
  const preview = page.locator('.variant-preview').first();
  await expect(preview.locator('.component-instance-content .canvas-text').first()).toHaveText("Enabled");
  await preview.locator('.component-instance-content .canvas-text').first().dispatchEvent("dblclick");
  await expect(preview.locator('.component-instance-content .canvas-text').first()).toHaveAttribute("contenteditable", "true");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(owner => getComponentDefinition(owner).layers.find(node => node.type === "text").textContent, owner)).toBe("Local");
});

const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function setup(page) {
  await openApp(page);
  return page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Default label", beginEditing: false, isNew: false });
    addVariant();
    const variant = variantModel.getVariants()[1];
    variant.name = "Selected";
    upsertLocalVariantOverride(variant, "text:1", "textContent", "Selected label");
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source);
    addComponentInstance(owner, source);
    selectComponentInstance(1);
    return { owner, source, variant: variant.id };
  });
}

test("edits one label, preserves siblings and source, and supports blank/reset/history", async ({ page }) => {
  const { source, variant } = await setup(page);
  const first = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]');
  const second = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"]');
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", "Overview <b>literal</b>"));
  await expect(first).toHaveText("Overview <b>literal</b>");
  await expect(first.locator("b")).toHaveCount(0);
  await expect(second).toHaveText("Default label");
  expect(await page.evaluate(source => getComponentDefinition(source).layers[0].textContent, source)).toBe("Default label");
  await first.click();
  await page.keyboard.press("Control+z");
  await expect(first).toHaveText("Default label");
  await page.keyboard.press("Control+Shift+z");
  await expect(first).toHaveText("Overview <b>literal</b>");
  await page.evaluate(variant => {
    selectComponentInstance(1);
    setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceVariantId", variant);
  }, variant);
  await expect(first).toHaveText("Overview <b>literal</b>");
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", ""));
  await expect(first).toHaveText("");
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", null, true));
  await expect(first).toHaveText("Selected label");
  await expect(page.locator(".component-instance-inspector .instance-label-row")).toHaveCount(0);
  await page.screenshot({ path: "test-results/instance-labels.png" });
});

test("duplicates and round trips labels, inherits source updates, and retains missing targets", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(({ owner, source }) => {
    const target = createSourceLayerIdentity(source, "text", 1);
    setComponentInstanceLabel(owner, [1], target, "Overview");
    selectComponentInstance(1);
    duplicateSelectedLayer();
    restoreWorkspaceState(JSON.parse(JSON.stringify(captureWorkspaceState())));
    const definition = getComponentDefinition(source);
    definition.layers[0].textContent = "Updated default";
    definition.layers[0].richTextHtml = "Updated default";
    updateComponentDefinition(source, definition);
  }, { owner, source });
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]')).toHaveText("Overview");
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="3"]')).toHaveText("Overview");
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"]')).toHaveText("Updated default");
  const recovered = await page.evaluate(({ owner, source }) => {
    const original = getComponentDefinition(source);
    const missing = structuredClone(original);
    missing.layers = [];
    updateComponentDefinition(source, missing);
    const retained = getComponentDefinition(owner).layers.find(node => node.id === 1).labelOverrides[0].value;
    updateComponentDefinition(source, original);
    return retained;
  }, { owner, source });
  expect(recovered).toBe("Overview");
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]')).toHaveText("Overview");
});

test("batch label editing is one undo step and invalid references are atomic", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(() => { selectComponentInstance(1); selectComponentInstance(2, true); });
  const before = await page.evaluate(() => undoHistory.length);
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", "Shared label"));
  expect(await page.evaluate(() => undoHistory.length)).toBe(before + 1);
  await expect(page.locator('[data-canvas-root-stack] > .canvas-component-instance')).toHaveText(["Shared label", "Shared label"]);
  const atomic = await page.evaluate(({ owner, source }) => {
    const before = JSON.stringify(captureWorkspaceState());
    const history = undoHistory.length;
    const target = createSourceLayerIdentity(source, "text", 1);
    const attempts = [
      () => setComponentInstanceLabel(owner, [1, 999], target, "Bad"),
      () => setComponentInstanceLabel(owner, [1], createSourceLayerIdentity(owner, "text", 1), "Bad"),
      () => setComponentInstanceLabel(owner, [1], createSourceLayerIdentity(source, "text", 999), "Bad"),
      () => normalizeInstanceLabelOverrides([{ target, value: 42 }], source),
    ];
    return { rejected: attempts.map(fn => { try { fn(); return false; } catch { return true; } }),
      same: before === JSON.stringify(captureWorkspaceState()), sameHistory: history === undoHistory.length };
  }, { owner, source });
  expect(atomic).toEqual({ rejected: [true, true, true, true], same: true, sameHistory: true });
});

const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function setup(page) {
  await openApp(page);
  return page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Link", beginEditing: false, isNew: false });
    addVariant();
    const sourceVariant = variantModel.getVariants()[1];
    sourceVariant.name = "Red";
    upsertLocalVariantOverride(sourceVariant, "text:1", "color", "#ff0000");
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source);
    addComponentInstance(owner, source);
    addVariant();
    variantModel.getVariants().forEach(variant => { variant.parentVariantId = null; });
    commitCanvasComponentData();
    renderTree();
    return { owner, source, ids: variantModel.getVariants().map(v => v.id) };
  });
}

test("variant and label choices affect only the selected parent variant and instance", async ({ page }) => {
  const { owner, source, ids } = await setup(page);
  const instance = (variant, id = 1) => page.locator(`.variant-preview[data-variant-id="${variant}"] [data-component-instance-id="${id}"]`);
  await instance(ids[0]).click();
  await page.evaluate(source => {
    const red = getComponentDefinition(source).variants.find(variant => variant.name === "Red");
    setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceVariantId", red.id);
  }, source);
  await expect(instance(ids[0]).locator('.canvas-text')).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(instance(ids[1]).locator('.canvas-text')).not.toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(instance(ids[0], 2).locator('.canvas-text')).not.toHaveCSS("color", "rgb(255, 0, 0)");
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", "Overview"));
  await expect(instance(ids[0])).toHaveText("Overview");
  await expect(instance(ids[1])).toHaveText("Link");
  await expect(instance(ids[0], 2)).toHaveText("Link");
  expect(await page.evaluate(owner => getComponentDefinition(owner).layers.every(n => n.variantId === null && n.labelOverrides.length === 0), owner)).toBe(true);
  await instance(ids[1]).click();
  await expect(page.getByLabel("Instance variant", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => getSelectedInstanceSettingContexts()[0].variantId)).toBeNull();
  await instance(ids[0]).click();
  await page.locator('.tree-node[data-selection-layer-key="component-instance:1"] .tree-node-label').click();
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", null, true));
  await expect(instance(ids[0])).toHaveText("Link");
  await expect(page.getByRole("button", { name: "Reset variant choice", exact: true })).toHaveCount(0);
  await page.evaluate(() => setSelectedInstanceSetting(
    getSelectedInstanceSettingContexts(), "instanceVariantId", null, true,
  ));
  await expect(instance(ids[0]).locator('.canvas-text')).not.toHaveCSS("color", "rgb(255, 0, 0)");
  await instance(ids[0]).click();
  await page.keyboard.press("Control+z");
  await expect(instance(ids[0]).locator('.canvas-text')).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(instance(ids[1]).locator('.canvas-text')).not.toHaveCSS("color", "rgb(255, 0, 0)");
  await page.evaluate(() => restoreWorkspaceState(JSON.parse(JSON.stringify(captureWorkspaceState()))));
  await expect(instance(ids[0]).locator('.canvas-text')).toHaveCSS("color", "rgb(255, 0, 0)");
});

test("multi-variant selection edits only its selected instance pairs and inherits base labels", async ({ page }) => {
  const { owner, source, ids } = await setup(page);
  await page.evaluate(({ owner, source, ids }) => {
    setComponentInstanceLabel(owner, [1, 2], createSourceLayerIdentity(source, "text", 1), "Base label");
    selectVariantsLayerTargetsState(ids, ["component-instance:1"], ids[0]);
    selectionState.targetsByVariant = { [ids[0]]: ["component-instance:1"], [ids[1]]: ["component-instance:2"] };
    renderTree();
  }, { owner, source, ids });
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", "Chosen"));
  const labels = await page.evaluate(ids => ids.map(id => [...document.querySelectorAll(`.variant-preview[data-variant-id="${id}"] .canvas-component-instance`)].map(node => node.textContent)), ids);
  expect(labels).toEqual([["Chosen", "Base label"], ["Base label", "Chosen"]]);
  await page.evaluate(() => setSelectedInstanceSetting(getSelectedInstanceSettingContexts(), "instanceLabel:1", null, true));
  await expect(page.locator('.variant-preview .canvas-component-instance')).toHaveText(["Base label", "Base label", "Base label", "Base label"]);
});

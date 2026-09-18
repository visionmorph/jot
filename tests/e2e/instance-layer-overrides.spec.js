const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function setup(page) {
  await openApp(page);
  return page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Link", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source, { name: "First" });
    addComponentInstance(owner, source, { name: "Second" });
    return { owner, source };
  });
}

test("Alt-click edits a nested text layer only in the chosen instance", async ({ page }) => {
  const { owner, source } = await setup(page);
  const first = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] .canvas-text');
  const second = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] .canvas-text');
  await first.click({ modifiers: ["Alt"] });
  await expect(page.locator("[data-text-inspector]")).toBeVisible();
  await expect(page.locator(".nested-instance-inspector")).toHaveCount(0);
  await page.getByLabel("Text color hex value").fill("2456aa");
  await page.getByLabel("Text color hex value").press("Tab");
  await expect(first).toHaveCSS("color", "rgb(36, 86, 170)");
  await expect(second).not.toHaveCSS("color", "rgb(36, 86, 170)");
  const data = await page.evaluate(({ owner, source }) => ({
    source: getComponentDefinition(source).layers[0].style,
    first: getComponentDefinition(owner).layers[0].layerOverrides,
    second: getComponentDefinition(owner).layers[1].layerOverrides,
  }), { owner, source });
  expect(data.source).not.toContain("2456aa");
  expect(data.first).toMatchObject([{ property: "color", value: "#2456AA" }]);
  expect(data.second).toEqual([]);
  await page.keyboard.press("Control+z");
  await expect(first).not.toHaveCSS("color", "rgb(36, 86, 170)");
});

test("a nested override in a parent variant stays in that variant", async ({ page }) => {
  const { owner } = await setup(page);
  const ids = await page.evaluate(() => {
    addVariant();
    variantModel.getVariants().forEach(variant => { variant.parentVariantId = null; });
    commitCanvasComponentData();
    return variantModel.getVariants().map(variant => variant.id);
  });
  const text = id => page.locator(`.variant-preview[data-variant-id="${id}"] [data-component-instance-id="1"] .canvas-text`);
  await text(ids[0]).click();
  await page.getByLabel("Text color hex value").fill("8844cc");
  await page.getByLabel("Text color hex value").press("Tab");
  await expect(text(ids[0])).toHaveCSS("color", "rgb(136, 68, 204)");
  await expect(text(ids[1])).not.toHaveCSS("color", "rgb(136, 68, 204)");
  expect(await page.evaluate(owner => {
    const definition = getComponentDefinition(owner);
    return { base: definition.layers[0].layerOverrides, target: definition.variants[0].overrides.at(-1).target };
  }, owner)).toMatchObject({ base: [], target: { kind: "placed", instancePath: [1] } });
});

test("nested frame styling can be reset without changing the source", async ({ page }) => {
  await openApp(page);
  const { owner, source } = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source);
    addComponentInstance(owner, source);
    return { owner, source };
  });
  const frame = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] .canvas-frame');
  const sibling = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] .canvas-frame');
  await frame.click({ modifiers: ["Alt"] });
  await expect(page.locator(".nested-instance-inspector")).toHaveCount(0);
  await page.evaluate(() => setNestedInstanceLayerOverride(getSelectedNestedInstanceLayer(), "backgroundColor", "#123456"));
  await expect(frame).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await expect(sibling).not.toHaveCSS("background-color", "rgb(18, 52, 86)");
  await page.evaluate(() => setNestedInstanceLayerOverride(getSelectedNestedInstanceLayer(), "backgroundColor", "", true));
  await expect(frame).not.toHaveCSS("background-color", "rgb(18, 52, 86)");
  expect(await page.evaluate(({ owner, source }) => ({
    first: getComponentDefinition(owner).layers[0].layerOverrides,
    source: getComponentDefinition(source).layers[0].style,
  }), { owner, source })).toMatchObject({ first: [] });
});

test("regular text inspector typography and layout controls save local instance overrides", async ({ page }) => {
  const { owner, source } = await setup(page);
  const first = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] .canvas-text');
  const second = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"] .canvas-text');
  await first.click({ modifiers: ["Alt"] });
  await page.locator("#text-size").fill("22");
  await page.locator("#text-size").press("Tab");
  await page.locator("#text-line-height").fill("28");
  await page.locator("#text-line-height").press("Tab");
  await page.locator("#text-letter-spacing").fill("2px");
  await page.locator("#text-letter-spacing").press("Tab");
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Open font family options" }).click();
  await page.getByRole("option", { name: "Roboto", exact: true }).click();
  await page.getByRole("button", { name: "Align text bottom right" }).click();
  await page.getByRole("combobox", { name: "Text width" }).fill("120");
  await page.getByRole("combobox", { name: "Text width" }).press("Tab");
  await expect(first).toHaveCSS("font-size", "22px");
  await expect(first).toHaveCSS("line-height", "28px");
  await expect(first).toHaveCSS("letter-spacing", "2px");
  await expect(first).toHaveCSS("font-weight", "700");
  await expect(first).toHaveCSS("font-family", /Roboto/);
  await expect(first).toHaveCSS("text-align", "right");
  await expect(first).toHaveCSS("width", "120px");
  await expect(second).not.toHaveCSS("font-size", "22px");
  expect(await page.evaluate(({ owner, source }) => ({
    first: getComponentDefinition(owner).layers[0].layerOverrides.map(entry => entry.property),
    second: getComponentDefinition(owner).layers[1].layerOverrides,
    source: getComponentDefinition(source).layers[0].style,
  }), { owner, source })).toMatchObject({
    first: expect.arrayContaining(["fontSize", "lineHeight", "letterSpacing", "fontWeight", "fontFamily", "textAlign", "width"]),
    second: [],
  });
});

test("typing a size override is one undoable inspector gesture", async ({ page }) => {
  await setup(page);
  const first = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"] .canvas-text');
  await first.click({ modifiers: ["Alt"] });
  const size = page.locator("#text-size");
  await size.click();
  await size.fill("2");
  await size.fill("22");
  await size.press("Tab");
  await expect(first).toHaveCSS("font-size", "22px");
  await page.keyboard.press("Control+z");
  await expect(first).toHaveCSS("font-size", "14px");
});

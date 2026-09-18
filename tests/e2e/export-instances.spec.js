const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("exports component instances as imported React components with local settings", async ({ page }) => {
  await openApp(page);
  const files = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    const text = createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Source label", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source);
    addComponentInstance(owner, source);
    const definition = getComponentDefinition(owner);
    definition.layers[0].labelOverrides = [{
      target: createSourceLayerIdentity(source, "text", text.id), value: "First label",
    }];
    definition.layers[0].layerOverrides = [{
      target: createSourceLayerIdentity(source, "text", text.id), property: "color", value: "#2456AA",
    }];
    updateComponentDefinition(owner, definition);
    const result = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { result[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return result;
  });
  const owner = files["Component1.jsx"];
  const source = files["Component2.jsx"];
  expect(owner).toContain('import Component2 from "./Component2";');
  expect(owner.match(/<Component2/g)).toHaveLength(2);
  expect(owner).toContain('instanceOverrides={mergeInstanceOverrides({"labels":{"text:1":"First label"},"styles":{"text:1":{"color":"#2456AA"}}}');
  expect(source).toContain('instanceOverrides.labels?.["text:1"]');
  expect(source).toContain('instanceOverrides.styles?.["text:1"]');
  expect(source).toContain("instanceOverrides = {}");
  expect(owner).toContain("instanceOverrides = {}");
  expect(source).toContain('...instanceOverrides.styles?.["component:0"], ...style }}');
  expect(source).not.toContain("style={{ ...{");
  expect(owner).toContain("const mergeInstanceOverrides =");
  const ownerStory = files["Component1.stories.jsx"];
  expect(ownerStory).toContain("instanceOverrides: { control: false, table: { disable: true } }");
  expect(ownerStory).not.toContain("instanceLabels:");
  expect(ownerStory).not.toContain("instanceLayerStyles:");
  expect(ownerStory).not.toContain("instanceNestedStyles:");
  const { transformWithEsbuild } = await import("vite");
  for (const [name, content] of Object.entries(files).filter(([name]) => name.endsWith(".jsx"))) {
    await expect(transformWithEsbuild(content, name, { loader: "jsx" })).resolves.toHaveProperty("code");
  }
});

test("exports parent variant choices for nested component variants", async ({ page }) => {
  await openApp(page);
  const ownerSource = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    const sourceAxis = variantModel.addProp({ name: "kind", type: "enum",
      options: ["primary", "secondary"], defaultValue: "primary" });
    addVariant();
    const sourceBase = variantModel.getVariants()[0];
    const sourceAlternate = variantModel.getVariants()[1];
    sourceAlternate.propValues[sourceAxis.id] = "secondary";
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source, { variantId: sourceAlternate.id });
    const ownerAxis = variantModel.addProp({ name: "mode", type: "enum",
      options: ["normal", "alternate"], defaultValue: "normal" });
    addVariant();
    const alternate = variantModel.getVariants()[1];
    alternate.propValues[ownerAxis.id] = "alternate";
    upsertLocalVariantOverride(alternate, "component-instance:1", "instanceVariantId", sourceBase.id);
    commitCanvasComponentData();
    const files = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { files[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return files["Component1.jsx"];
  });
  expect(ownerSource).toContain("const instanceSettingsByVariant =");
  expect(ownerSource).toContain('"secondary"');
  expect(ownerSource).toContain('"primary"');
  expect(ownerSource).toContain("<Component2 {...instanceSettings[1]} instanceOverrides=");
});

test("carries a placed style override through a nested component", async ({ page }) => {
  await openApp(page);
  const files = await page.evaluate(() => {
    const owner = currentComponent.id;
    const middle = addComponent().id;
    const leaf = addComponent().id;
    const text = createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Leaf", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    addComponentInstance(middle, leaf);
    activateComponent(owner);
    addComponentInstance(owner, middle);
    const definition = getComponentDefinition(owner);
    definition.layers[0].layerOverrides = [{
      target: createPlacedLayerIdentity(middle, [1], createSourceLayerIdentity(leaf, "text", text.id)),
      property: "color", value: "#123456",
    }];
    updateComponentDefinition(owner, definition);
    const result = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { result[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return result;
  });
  expect(files["Component1.jsx"]).toContain('"children":{"1":{"styles":{"text:1":{"color":"#123456"}},"children":{}}}');
  expect(files["Component2.jsx"]).toContain('instanceOverrides.children?.[1]');
  expect(files["Component2.jsx"]).toContain('import Component3 from "./Component3";');
});


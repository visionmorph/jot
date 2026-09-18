const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("emits compact default tab item variants", async ({ page }) => {
  await openApp(page);
  const source = await page.evaluate(() => {
    const tabsId = currentComponent.id;
    const tabItemId = addComponent().id;
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Tab", beginEditing: false, isNew: false });
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "selected");
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "disabled");
    const itemSizeProp = {
      id: nextComponentPropId++,
      name: "size",
      type: "enum",
      options: ["sm", "md"],
      defaultValue: "sm",
      targetFrameId: null,
      targetTextId: null,
      targetVectorId: null,
      property: "custom",
    };
    componentProps.push(itemSizeProp);
    syncComponentPropVariantDefinition(itemSizeProp, { render: false });
    const itemSizeAxis = variantModel.getProps().find((axis) => axis.id === itemSizeProp.variantPropId);
    const mediumItemVariant = addVariant({ render: false });
    setVariantPropValue(mediumItemVariant, itemSizeAxis.id, "md");
    const itemDisabledAxis = variantModel.getProps().find((axis) => (
      getVariantAxisComponentProp(axis)?.property === "disabled"
    ));
    const disabledItemVariant = addVariant({ render: false });
    setVariantPropValue(disabledItemVariant, itemDisabledAxis.id, true);
    commitCanvasComponentData();

    activateComponent(tabsId);
    addComponentInstance(tabsId, tabItemId);
    addComponentInstance(tabsId, tabItemId, { variantId: disabledItemVariant.id });
    currentComponent.frameRecord.element.setAttribute("role", "tablist");
    addComponentProp("boolean");
    const collectionDisabledProp = componentProps.at(-1);
    setBooleanPropProperty(collectionDisabledProp, "disabled");
    const collectionDisabledAxis = variantModel.getProps().find((axis) => (
      axis.id === collectionDisabledProp.variantPropId
    ));
    const directionAxis = variantModel.addProp({
      name: "direction", type: "enum", options: ["horizontal", "vertical"], defaultValue: "horizontal",
    });
    const sizeAxis = variantModel.addProp({
      name: "size", type: "enum", options: ["sm", "md"], defaultValue: "sm",
    });
    const mediumVariant = addVariant({ render: false });
    setVariantPropValue(mediumVariant, collectionDisabledAxis.id, false);
    setVariantPropValue(mediumVariant, directionAxis.id, "horizontal");
    setVariantPropValue(mediumVariant, sizeAxis.id, "md");
    const verticalVariant = addVariant({ render: false });
    setVariantPropValue(verticalVariant, collectionDisabledAxis.id, false);
    setVariantPropValue(verticalVariant, directionAxis.id, "vertical");
    setVariantPropValue(verticalVariant, sizeAxis.id, "sm");
    upsertLocalVariantOverride(verticalVariant, "component:0", "flexDirection", "column");
    const verticalMediumVariant = addVariant({ render: false });
    setVariantPropValue(verticalMediumVariant, collectionDisabledAxis.id, false);
    setVariantPropValue(verticalMediumVariant, directionAxis.id, "vertical");
    setVariantPropValue(verticalMediumVariant, sizeAxis.id, "md");
    upsertLocalVariantOverride(verticalMediumVariant, "component:0", "flexDirection", "column");
    [
      ["horizontal", "sm"],
      ["horizontal", "md"],
      ["vertical", "sm"],
      ["vertical", "md"],
    ].forEach(([direction, size]) => {
      const variant = addVariant({ render: false });
      setVariantPropValue(variant, collectionDisabledAxis.id, true);
      setVariantPropValue(variant, directionAxis.id, direction);
      setVariantPropValue(variant, sizeAxis.id, size);
      if (direction === "vertical") {
        upsertLocalVariantOverride(variant, "component:0", "flexDirection", "column");
      } else {
        upsertLocalVariantOverride(variant, "component:0", "flexDirection", "row");
      }
    });
    commitCanvasComponentData();

    const files = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { files[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return files["Component1.jsx"];
  });

  expect(source).toContain("const defaultItems =");
  expect(source).not.toContain("const baseDefaultItems =");
  expect(source).not.toContain("const defaultItemVariantDeltas =");
  expect(source).not.toContain("const defaultItemVariantAxisOrder =");
  expect(source).not.toContain("const defaultItemsByVariant =");
  expect(source).not.toContain("const getVariantValue =");
  expect(source).not.toContain("variantStyleCombinationCorrections");
  expect(source).not.toContain("variantStyleCombinationKey");
  expect(source).not.toContain("JSON.stringify(variantStyleAxisOrder");
  expect(source).not.toContain("JSON.stringify([size, direction, disabled])");
  expect(source).not.toContain("const styleValues =");
  expect(source).not.toContain("const defaultItemCombinationCorrections =");
  expect(source).not.toContain('"props":{"size":');
  expect(source).not.toContain('"disabled":false');
  expect(source).toContain('"disabled":true');
  expect(source).not.toContain("getDefaultItems(");
  expect(source).toContain("<Component2 {...item.props} size={size}");
  expect(source).not.toContain("const sharedItemWrapperStylesByVariant =");
  expect(source).not.toContain("const sharedItemWrapperStyle");
  expect(source).not.toContain("...sharedItemWrapperStyle");
  expect(source).not.toContain('"component-instance:1": {  }');
  expect(source).not.toContain('"component-instance:2": {  }');
  expect(source).not.toContain("const orientationByVariant =");
  expect(source).toContain('const orientation = direction === "vertical" ? "vertical" : "horizontal";');
  const { transformWithEsbuild } = await import("vite");
  await expect(transformWithEsbuild(source, "Component1.jsx", { loader: "jsx" }))
    .resolves.toHaveProperty("code");
});

test("prunes empty style layers but retains authored styles", async ({ page }) => {
  await openApp(page);
  const source = await page.evaluate(() => {
    const ownerId = currentComponent.id;
    const sourceId = addComponent().id;
    activateComponent(ownerId);
    addComponentInstance(ownerId, sourceId);
    addComponentInstance(ownerId, sourceId);
    layerRecords.filter((record) => record.type === "component-instance")[0]
      .element.style.paddingTop = "6px";
    const densityAxis = variantModel.addProp({
      name: "density", type: "enum", options: ["comfortable", "compact"], defaultValue: "comfortable",
    });
    const compactVariant = addVariant({ render: false });
    setVariantPropValue(compactVariant, densityAxis.id, "compact");
    commitCanvasComponentData();

    const files = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { files[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return files["Component1.jsx"];
  });

  expect(source).toContain('"component-instance:1": { paddingTop: "6px" }');
  expect(source).not.toContain('"component-instance:2": {  }');
  const { transformWithEsbuild } = await import("vite");
  await expect(transformWithEsbuild(source, "Component1.jsx", { loader: "jsx" }))
    .resolves.toHaveProperty("code");
});

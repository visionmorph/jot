const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function setup(page, variants = false) {
  await openApp(page);
  return page.evaluate(variants => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    currentComponent.name = "Tab Item";
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Tab", beginEditing: false, isNew: false });
    addVariant();
    variantModel.getVariants()[1].name = "Selected";
    upsertLocalVariantOverride(variantModel.getVariants()[1], "text:1", "textContent", "Selected tab");
    commitCanvasComponentData();
    activateComponent(owner);
    if (variants) addVariant();
    return { owner, source };
  }, variants);
}

async function insert(page) {
  await page.getByRole("button", { name: "Insert Component", exact: true }).click();
  await page.getByRole("dialog", { name: "Insert component" }).getByRole("button", { name: "Tab Item", exact: true }).click();
}

test("sidebar picker inserts, selects, and supports duplicate/delete history", async ({ page }) => {
  await setup(page);
  const insertButton = page.getByRole("button", { name: "Insert Component", exact: true });
  const exportButton = page.getByRole("button", { name: "Export", exact: true });
  expect((await insertButton.boundingBox()).y).toBeLessThan((await exportButton.boundingBox()).y);
  await insert(page);
  const instances = page.locator('[data-canvas-root-stack] > .canvas-component-instance');
  await expect(instances).toHaveCount(1);
  await expect(instances.first()).toHaveAttribute("aria-selected", "true");
  const inspector = page.getByRole("region", { name: "Component instance" });
  await expect(inspector.getByRole("heading", { name: "Tab Item" })).toBeVisible();
  await expect(inspector.getByLabel("Instance variant")).toHaveCount(0);
  await expect(inspector.locator(".instance-label-row, p")).toHaveCount(0);
  await instances.first().click();
  await page.keyboard.press("Control+d");
  await expect(instances).toHaveCount(2);
  await page.keyboard.press("Delete");
  await expect(instances).toHaveCount(1);
  await page.keyboard.press("Control+z");
  await expect(instances).toHaveCount(2);
  await page.locator('[data-selection-layer-key="component-instance:1"]').click();
  await expect(instances.first()).toHaveAttribute("aria-selected", "true");
  await expect(instances.last()).toHaveAttribute("aria-selected", "false");
  await page.screenshot({ path: "test-results/instance-controls.png" });
});

test("selecting an instance child highlights only that child", async ({ page }) => {
  await setup(page);
  await insert(page);

  const instance = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]');
  const child = instance.locator(".component-instance-content .canvas-text");
  await child.click();

  await expect(child).toHaveClass(/is-instance-child-selected/);
  await expect(instance).not.toHaveClass(/is-selected/);
  await expect(instance).toHaveAttribute("aria-selected", "false");

  const instanceRow = page.locator('[data-selection-layer-key="component-instance:1"]');
  await expect(instanceRow).not.toHaveClass(/is-selected/);
  await expect(instanceRow).toHaveAttribute("aria-selected", "false");
});

test("arrow keys do not move an instance when its nested text is selected", async ({ page }) => {
  await setup(page);
  await insert(page);
  await insert(page);

  const instances = page.locator('[data-canvas-root-stack] > .canvas-component-instance');
  const child = instances.first().locator(".component-instance-content .canvas-text");
  await child.click();
  const initialOrder = await page.evaluate(() => getLayerChildren(null)
    .filter((layer) => layer.type === "component-instance")
    .map((layer) => layer.record.id));
  const initialBounds = await instances.first().boundingBox();

  await page.keyboard.press("ArrowRight");

  expect(await page.evaluate(() => getLayerChildren(null)
    .filter((layer) => layer.type === "component-instance")
    .map((layer) => layer.record.id))).toEqual(initialOrder);
  expect(await instances.first().boundingBox()).toEqual(initialBounds);
  await expect(child).toHaveClass(/is-instance-child-selected/);
});

test("instance tree rows show the outline icon, truncate names, and toggle visibility", async ({ page }) => {
  await setup(page);
  await insert(page);
  await page.evaluate(() => {
    const record = getLayerRecord({ type: "component-instance", id: 1 });
    record.name = "A component instance with a name long enough to exceed the tree view width";
    selectComponentState();
    renderTree();
  });

  const row = page.locator('[data-tree-view] [data-selection-layer-key="component-instance:1"]');
  const label = row.locator(".tree-node-label");
  const icon = row.locator(".icon-cell .svg-icon--diamond-outline");
  await expect(label).toHaveText(/^A component instance/);
  await expect(icon).toHaveCSS("mask-image", /diamond--outline\.svg/);
  expect(await label.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await expect(label).toHaveCSS("white-space", "nowrap");
  await expect(row).toHaveCSS("height", "24px");

  const instance = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]');
  await row.click();
  await expect(instance).toHaveCSS("outline-color", "rgb(165, 110, 255)");
  await page.getByRole("button", { name: /^Hide A component instance/ }).click({ force: true });
  await expect(instance).toHaveCSS("display", "none");
  await page.getByRole("button", { name: /^Show A component instance/ }).click({ force: true });
  await expect(instance).toBeVisible();
});

test("instance props use Jot field inputs, default dropdowns, and text toggles", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(({ owner, source }) => {
    activateComponent(source);
    addComponentProp("string");
    addComponentProp("enum");
    const enumProp = componentProps.find(prop => prop.type === "enum");
    enumProp.name = "Style";
    enumProp.options = ["Default", "Alternate"];
    syncComponentPropVariantDefinition(enumProp, { render: false });
    addComponentProp("boolean");
    componentProps.find(prop => prop.type === "boolean").name = "Visible";
    commitCanvasComponentData();
    activateComponent(owner);
  }, { owner, source });
  await insert(page);

  const inspector = page.getByRole("region", { name: "Component instance" });
  const fields = inspector.locator(".instance-prop-controls > .field-input");
  await expect(fields).toHaveCount(3);
  await expect(fields.nth(0).locator(".label + .text-input")).toHaveCount(1);
  await expect(fields.nth(1).locator(".label + .dropdown.dropdown--default")).toHaveCount(1);
  await expect(fields.nth(2).locator(".label + .text-toggle")).toHaveCount(1);

  await inspector.getByRole("textbox", { name: "label" }).fill("Changed label");
  await inspector.getByRole("textbox", { name: "label" }).blur();
  await expect(page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]')).toHaveText("Changed label");
  await inspector.getByRole("button", { name: "Open Style options" }).click();
  await inspector.getByRole("option", { name: "Alternate" }).click();
  await expect(inspector.getByRole("combobox", { name: "Style" })).toHaveValue("Alternate");
  await inspector.getByRole("group", { name: "Visible" }).getByRole("button", { name: "Hidden" }).click();
  await expect(inspector.getByRole("group", { name: "Visible" }).getByRole("button", { name: "Hidden" })).toHaveAttribute("aria-pressed", "true");
  const values = await page.evaluate(source => {
    const props = getComponentDefinition(source).componentProps;
    const instance = getComponentDefinition(currentComponent.id).layers.find(layer => layer.type === "component-instance");
    return { style: instance.propValues[props.find(prop => prop.name === "Style").id],
      visible: instance.propValues[props.find(prop => prop.name === "Visible").id] };
  }, source);
  expect(values).toEqual({ style: "Alternate", visible: false });
});

test("instance variant properties render the matching authored variant", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(({ owner, source }) => {
    activateComponent(source);
    addComponentProp("enum");
    const styleProp = componentProps.find(prop => prop.type === "enum");
    styleProp.name = "Style";
    styleProp.options = ["Default", "Alternate"];
    styleProp.defaultValue = "Default";
    syncComponentPropVariantDefinition(styleProp, { render: false });
    const axis = variantModel.getProps().find(candidate => candidate.id === styleProp.variantPropId);
    const alternate = addVariant({ render: false });
    setVariantPropValue(alternate, axis.id, "Alternate");
    upsertLocalVariantOverride(alternate, "text:1", "textContent", "Alternate tab");
    upsertLocalVariantOverride(alternate, "text:1", "color", "#2456AA");
    commitCanvasComponentData();
    activateComponent(owner);
  }, { owner, source });
  await insert(page);

  const instance = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]');
  await expect(instance).toHaveText("Tab");
  const inspector = page.getByRole("region", { name: "Component instance" });
  await inspector.getByRole("button", { name: "Open Style options" }).click();
  await inspector.getByRole("option", { name: "Alternate" }).click();

  await expect(instance).toHaveText("Alternate tab");
  await expect(instance.locator(".canvas-text")).toHaveCSS("color", "rgb(36, 86, 170)");
});

test("instance property controls repaint the selected parent variant", async ({ page }) => {
  const { owner, source } = await setup(page, true);
  const parentVariantIds = await page.evaluate(({ owner, source }) => {
    activateComponent(source);
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    addComponentProp("enum");
    const styleProp = componentProps.find(prop => prop.type === "enum");
    styleProp.name = "Style";
    styleProp.options = ["Default", "Alternate"];
    syncComponentPropVariantDefinition(styleProp, { render: false });
    const styleAxis = variantModel.getProps().find(axis => axis.id === styleProp.variantPropId);
    const alternate = addVariant({ render: false });
    setVariantPropValue(alternate, styleAxis.id, "Alternate");
    upsertLocalVariantOverride(alternate, "text:1", "textContent", "Alternate tab");
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.find(prop => prop.type === "boolean"), "selected");
    commitCanvasComponentData();
    activateComponent(owner);
    return variantModel.getVariants().map(variant => variant.id);
  }, { owner, source });
  await insert(page);

  const instance = variantId => page.locator(
    `.variant-preview[data-variant-id="${variantId}"] [data-component-instance-id="1"]`,
  );
  await page.evaluate(parentVariantId => {
    selectComponentInstance(1, false, parentVariantId);
    updateInspector();
  }, parentVariantIds[1]);
  const inspector = page.getByRole("region", { name: "Component instance" });
  await expect(inspector).toBeVisible();
  await inspector.getByRole("button", { name: "Open Style options" }).click();
  await inspector.getByRole("option", { name: "Alternate" }).click();

  await expect(instance(parentVariantIds[0])).toHaveText("Tab");
  await expect(instance(parentVariantIds[1])).toHaveText("Alternate tab");

  await inspector.getByRole("group", { name: "selected" }).getByRole("button", { name: "Selected", exact: true }).click();
  await expect(instance(parentVariantIds[0]).locator('[role="tab"]')).toHaveAttribute("aria-selected", "false");
  await expect(instance(parentVariantIds[1]).locator('[role="tab"]')).toHaveAttribute("aria-selected", "true");
});

test("hidden instance heading does not shift the component inspector", async ({ page }) => {
  await setup(page);
  await insert(page);
  const instanceSection = page.locator(".component-instance-inspector");
  await expect(instanceSection).toBeVisible();
  await page.evaluate(() => {
    selectComponentState();
    updateInspector();
  });
  await expect(instanceSection).toBeHidden();
  await expect(instanceSection).toHaveCSS("display", "none");
  const headingOffset = await page.evaluate(() =>
    frameInspectorHeading.closest(".panel-heading-wrap").getBoundingClientRect().top
      - frameInspector.getBoundingClientRect().top);
  expect(headingOffset).toBe(12);
  await page.evaluate(() => {
    selectComponentInstance(1);
    updateInspector();
  });
  await expect(instanceSection).toBeVisible();
});

test("uses the authored default rather than list order and retains base only without variants", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const definition = { componentId: 42, variantProps: [{ id: 1, type: "enum", options: ["default", "red"] }],
      variants: [{ id: 5, propValues: { 1: "red" } }, { id: 8, propValues: { 1: "default" } }] };
    const resolved = getComponentInstanceStatus({ sourceComponentId: 42, variantId: null }, () => definition);
    const owner = currentComponent.id;
    const source = addComponent().id;
    activateComponent(owner);
    addComponentInstance(owner, source);
    selectComponentInstance(1);
    return resolved.variant.id;
  });
  expect(result).toBe(8);
  await expect(page.getByLabel("Instance variant", { exact: true })).toHaveCount(0);
});

test("inserts into selected frames and excludes cyclic component choices", async ({ page }) => {
  const { owner, source } = await setup(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: true });
    selectCanvasFrame(frame.element);
  });
  await insert(page);
  expect(await page.evaluate(() => layerRecords.find(record => record.type === "component-instance").parentId)).toBe(1);
  await page.evaluate(source => activateComponent(source), source);
  await page.getByRole("button", { name: "Insert Component", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("No components available");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("selects instances in parent variants and supports delete history", async ({ page }) => {
  await setup(page, true);
  await insert(page);
  const instance = page.locator('.variant-preview').first().locator('.canvas-component-instance');
  await instance.click();
  await expect(instance).toHaveText("Tab");
  await page.locator('.tree-node[data-selection-layer-key="component-instance:1"] .tree-node-label').click();
  await page.keyboard.press("Delete");
  await expect(instance).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(instance).toHaveCount(1);
});

test("reorders instances by canvas dragging and moves them into frames from the tree", async ({ page }) => {
  await setup(page);
  await insert(page);
  await insert(page);
  const first = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]');
  const second = page.locator('[data-canvas-root-stack] > [data-component-instance-id="2"]');
  const start = await first.boundingBox();
  const end = await second.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width - 2, end.y + end.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => getLayerChildren(null).map(layer => layer.record.id))).toEqual([2, 1]);
  await page.evaluate(() => createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false }));
  const source = page.locator('[data-selection-layer-key="component-instance:1"]');
  const destination = page.locator('[data-selection-layer-key="frame:1"]');
  await source.dragTo(destination);
  await expect.poll(() => page.evaluate(() => getLayerRecord({ type: "component-instance", id: 1 }).parentId)).toBe(1);
  await source.click();
  await expect(page.getByRole("region", { name: "Component instance" })).toBeVisible();
});

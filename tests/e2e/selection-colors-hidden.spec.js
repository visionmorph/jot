const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("excludes hidden layers and descendants from component selection colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "";
    canvasRootStack.style.backgroundColor = "";
    const visible = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Visible",
    });
    visible.element.dataset.textColor = "#FF0000";
    visible.element.style.color = "#FF0000";

    const hidden = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Hidden",
    });
    hidden.element.dataset.textColor = "#0000FF";
    hidden.element.style.color = "#0000FF";
    hidden.element.dataset.layerVisibility = "hidden";
    syncLayerVisibility(hidden.element);

    const hiddenFrame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    hiddenFrame.element.dataset.layerVisibility = "hidden";
    syncLayerVisibility(hiddenFrame.element);
    const nested = createCanvasText(hiddenFrame, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Hidden descendant",
    });
    nested.element.dataset.textColor = "#00AA00";
    nested.element.style.color = "#00AA00";

    selectComponentState(currentComponent.id);
    renderTree();
  });

  const colors = await page.locator("[data-selection-colors] [data-color-hex]")
    .evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(colors).toEqual(["FF0000"]);
});

test("excludes a hidden matched layer from a uniform text selection", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Label",
    });
    text.element.dataset.textColor = "#FF0000";
    text.element.style.color = "#FF0000";
    addVariantInstance();
    const instances = variantModel.getInstances();
    upsertLocalVariantOverride(instances[1], "text:1", "color", "#0000FF");
    upsertLocalVariantOverride(instances[1], "text:1", "visibility", false);
    selectVariantInstancesLayerTargetsState(instances.map((instance) => instance.id), ["text:1"]);
    renderTree();
  });

  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Text color hex value" })).toHaveValue("FF0000");
});

test("keeps matching text with one shared color out of Selection colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Label",
    });
    text.element.dataset.textColor = "#336699";
    text.element.style.color = "#336699";
    addVariantInstance();
    const instances = variantModel.getInstances();
    selectVariantInstancesLayerTargetsState(instances.map((instance) => instance.id), ["text:1"]);
    renderTree();
  });

  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Text color hex value" })).toHaveValue("336699");
});

test("keeps matching SVG icons with one shared color out of Selection colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasVector({
      name: "Icon", width: 24, height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    addVariantInstance();
    const instances = variantModel.getInstances();
    selectVariantInstancesLayerTargetsState(instances.map((instance) => instance.id), ["vector:1"]);
    renderTree();
  });

  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Vector color hex value" })).toHaveValue("336699");
});

test("shows Selection colors for matching SVG icons with different colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasVector({
      name: "Icon", width: 24, height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    addVariantInstance();
    const instances = variantModel.getInstances();
    upsertLocalVariantOverride(instances[1], "vector:1", "fill", "#CC5500");
    selectVariantInstancesLayerTargetsState(instances.map((instance) => instance.id), ["vector:1"]);
    renderTree();
  });

  const colors = await page.locator("[data-vector-inspector] > [data-selection-colors] [data-color-hex]")
    .evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(colors).toEqual(["336699", "CC5500"]);
});

test("ignores a hidden SVG match in the standard Fill control", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasVector({
      name: "Icon", width: 24, height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    addVariantInstance();
    const instances = variantModel.getInstances();
    upsertLocalVariantOverride(instances[1], "vector:1", "fill", "#CC5500");
    upsertLocalVariantOverride(instances[1], "vector:1", "visibility", false);
    selectVariantInstancesLayerTargetsState(instances.map((instance) => instance.id), ["vector:1"]);
    renderTree();
  });

  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Vector color hex value" })).toHaveValue("336699");
});

test("keeps uniformly painted matching frames in Fill and shows distinct frame colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    frame.element.dataset.frameColor = "#336699";
    frame.element.style.backgroundColor = "#336699";
    addVariantInstance();
    const instances = variantModel.getInstances();
    selectVariantInstancesLayerTargetsState(instances.map((instance) => instance.id), ["frame:1"]);
    renderTree();
  });

  const section = page.locator("[data-selection-colors]");
  await expect(section).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Frame background hex value" })).toHaveValue("336699");

  await page.evaluate(() => {
    const instance = variantModel.getInstances()[1];
    upsertLocalVariantOverride(instance, "frame:1", "backgroundColor", "#CC5500");
    upsertLocalVariantOverride(instance, "frame:1", "visibility", false);
    renderTree();
  });
  await expect(section).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Frame background hex value" })).toHaveValue("336699");

  await page.evaluate(() => {
    upsertLocalVariantOverride(variantModel.getInstances()[1], "frame:1", "visibility", true);
    renderTree();
  });
  const colors = await section.locator("[data-color-hex]").evaluateAll((inputs) => inputs.map((input) => input.value));
  expect(colors).toEqual(["336699", "CC5500"]);
});

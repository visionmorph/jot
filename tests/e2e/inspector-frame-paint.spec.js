const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createGroupedColorFixture } = require("../support/test-fixtures.cjs");

test("bulk-edits fill and border for selected variant roots", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second, third] = variantModel.getVariants();
    const setPaint = (variant, values) => {
      Object.entries(values).forEach(([property, value]) => {
        upsertLocalVariantOverride(variant, "component:0", property, value);
      });
    };
    setPaint(first, {
      backgroundColor: "#CC0000",
      outlineColor: "#0000CC",
      outlineColorOpacity: "100",
      outlineWeight: "1",
      outlinePosition: "inside",
    });
    setPaint(second, {
      backgroundColor: "rgba(0, 170, 0, 0.5)",
      outlineColor: "#CCAA00",
      outlineColorOpacity: "60",
      outlineWeight: "2",
      outlinePosition: "outside",
    });
    setPaint(third, {
      backgroundColor: "#663399",
      outlineColor: "#008888",
      outlineColorOpacity: "80",
      outlineWeight: "3",
      outlinePosition: "center",
    });
    renderVariants();
    selectVariants([first.id, second.id], second.id);
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  const selectionColors = inspector.locator(":scope > [data-selection-colors]");
  const fillSection = inspector.locator(":scope > [data-paint-section]").filter({ hasText: "Fill" });
  const borderSection = inspector.locator(":scope > [data-paint-section]").filter({ hasText: "Border" });

  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(4);
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();

  const firstSelectionColor = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await expect(firstSelectionColor).toHaveValue("CC0000");
  await firstSelectionColor.fill("EE4400");
  await expect(roots.nth(0)).toHaveCSS("background-color", "rgb(238, 68, 0)");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgba(0, 170, 0, 0.5)");
  await expect(roots.nth(2)).toHaveCSS("background-color", "rgb(102, 51, 153)");

  await page.getByRole("button", { name: "Add frame fill" }).click();
  const fillHex = page.getByRole("textbox", { name: "Frame background hex value" });
  const fillOpacity = page.getByRole("textbox", { name: "Frame background opacity" });
  await expect(fillHex).toHaveValue("EE4400");
  await fillHex.fill("336699");
  await fillOpacity.fill("40");
  for (let index = 0; index < 2; index += 1) {
    await expect(roots.nth(index)).toHaveCSS("background-color", "rgba(51, 102, 153, 0.4)");
  }
  await expect(roots.nth(2)).toHaveCSS("background-color", "rgb(102, 51, 153)");

  await page.getByRole("button", { name: "Add frame border" }).click();
  const borderHex = page.getByRole("textbox", { name: "Frame outline hex value" });
  const borderOpacity = page.getByRole("textbox", { name: "Frame outline opacity" });
  await expect(borderHex).toHaveValue("0000CC");
  await borderHex.fill("445566");
  await borderOpacity.fill("50");
  await page.getByRole("button", { name: "Open border position options" }).click();
  await page.getByRole("option", { name: "Center", exact: true }).click();
  const borderWeight = page.getByRole("spinbutton", { name: "Weight" });
  await borderWeight.fill("4");
  await borderWeight.press("Tab");

  for (let index = 0; index < 2; index += 1) {
    await expect(previews.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-color", "#445566");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-color-opacity", "50");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-position", "center");
    await expect(roots.nth(index)).toHaveAttribute("data-outline-weight", "4");
  }
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(roots.nth(2)).toHaveCSS("background-color", "rgb(102, 51, 153)");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-color", "#008888");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-color-opacity", "80");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-position", "center");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-weight", "3");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(roots.nth(0)).toHaveAttribute("data-outline-weight", "1");
  await expect(roots.nth(1)).toHaveAttribute("data-outline-weight", "2");
  await expect(roots.nth(2)).toHaveAttribute("data-outline-weight", "3");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(roots.nth(0)).toHaveAttribute("data-outline-weight", "4");
  await expect(roots.nth(1)).toHaveAttribute("data-outline-weight", "4");
});

test("shows one shared descendant selection color after shift-clicking multiple variant roots", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const roots = page.locator(".variant-preview .canvas-root-stack");
  await roots.nth(0).click({ position: { x: 1, y: 1 } });
  await roots.nth(1).click({ modifiers: ["Shift"], position: { x: 1, y: 1 } });

  const selectionColors = page.locator("[data-frame-inspector] > [data-selection-colors]");
  await expect(selectionColors).toBeVisible();
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(1);
});

test("keeps border position and weight visible for partial variant borders", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second] = variantModel.getVariants();
    upsertLocalVariantOverride(first, "component:0", "outlineColor", "#336699");
    upsertLocalVariantOverride(first, "component:0", "outlineColorOpacity", "100");
    upsertLocalVariantOverride(first, "component:0", "outlinePosition", "inside");
    upsertLocalVariantOverride(first, "component:0", "outlineWeight", "1");
    upsertLocalVariantOverride(second, "component:0", "outlineColor", "");
    upsertLocalVariantOverride(second, "component:0", "outlinePosition", "outside");
    upsertLocalVariantOverride(second, "component:0", "outlineWeight", "2");
    renderVariants();
    selectVariants([first.id, second.id], second.id);
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const borderSection = inspector.locator(":scope > [data-paint-section]").filter({ hasText: "Border" });
  const borderControls = inspector.locator("[data-frame-outline-controls]");
  const position = page.getByRole("combobox", { name: "Position" });
  const weight = page.getByRole("spinbutton", { name: "Weight" });

  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Frame outline hex value" })).toBeHidden();
  await expect(borderControls).toBeVisible();
  await expect(position).toHaveValue("");
  await expect(position).toHaveAttribute("placeholder", "Mixed");
  await expect(weight).toHaveValue("");
  await expect(weight).toHaveAttribute("placeholder", "Mixed");
});

test("displays and bulk-edits simple properties for multiple selected frames", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    Object.assign(first.element.dataset, {
      width: "120",
      height: "100",
      direction: "horizontal",
      alignment: "top-left",
      gap: "12",
      gapMode: "fixed",
      radius: "8",
      paddingLeft: "16",
      paddingTop: "12",
      paddingRight: "16",
      paddingBottom: "12",
      frameColor: "#CC5500",
      frameColorOpacity: "100",
      htmlTag: "div",
    });
    Object.assign(second.element.dataset, {
      width: "120",
      height: "140",
      direction: "vertical",
      alignment: "bottom-right",
      gap: "24",
      gapMode: "fixed",
      radius: "8",
      paddingLeft: "16",
      paddingTop: "20",
      paddingRight: "16",
      paddingBottom: "20",
      frameColor: "#336699",
      frameColorOpacity: "100",
      htmlTag: "div",
    });
    first.element.style.width = "120px";
    first.element.style.height = "100px";
    second.element.style.width = "120px";
    second.element.style.height = "140px";
    first.element.style.backgroundColor = "#CC5500";
    second.element.style.backgroundColor = "#336699";
    selectLayerKeys([`frame:${first.id}`, `frame:${second.id}`], `frame:${second.id}`);
    syncElementSelectionStyles();
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("heading", { name: "Frames", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Frame width" })).toHaveValue("120");
  await expect(page.getByRole("combobox", { name: "Frame height" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Frame height" })).toHaveAttribute("placeholder", "Mixed");
  await expect(page.locator("#frame-gap")).toHaveValue("");
  await expect(page.locator("#frame-gap")).toHaveAttribute("placeholder", "Mixed");
  await expect(page.getByRole("spinbutton", { name: "Radius" })).toHaveValue("8");
  await expect(page.getByRole("textbox", { name: "Horizontal padding" })).toHaveValue("16");
  await expect(page.getByRole("textbox", { name: "Vertical padding" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Vertical padding" })).toHaveAttribute("placeholder", "Mixed");
  await expect(inspector.locator("[data-frame-direction][aria-pressed='true']")).toHaveCount(0);
  await expect(inspector.locator("[data-frame-alignment][aria-pressed='true']")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Frame width" })).toBeEnabled();
  await expect(page.getByRole("spinbutton", { name: "Radius" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Horizontal", exact: true })).toBeEnabled();
  const selectionColors = inspector.locator(":scope > [data-selection-colors]");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("CC5500");
  await expect(selectionColors.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("336699");
  await expect(inspector.locator(":scope > [data-paint-section]").first()).toBeVisible();
  await expect(inspector.locator(":scope > [data-paint-section]").last()).toBeVisible();

  const frames = page.locator("[data-canvas-root-stack] > [data-frame-id]");
  await selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" }).fill("7A3E9D");
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "#7A3E9D");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#336699");
  const fillSection = inspector.locator(':scope > [data-paint-section]').filter({ hasText: "Fill" });
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(fillSection.locator("[data-tooltip-content]")).toHaveText("Add fill");
  const bulkFillHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await expect(bulkFillHex).toBeHidden();
  await page.getByRole("button", { name: "Add frame fill" }).click();
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "#7A3E9D");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#7A3E9D");
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();
  await expect(bulkFillHex).toHaveValue("7A3E9D");
  await bulkFillHex.fill("00AA00");
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "#00AA00");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#00AA00");
  await expect(selectionColors).toBeHidden();

  const widthControl = inspector.locator('[data-size-combobox="frame-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Frame width" });
  await widthInput.fill("200");
  await widthInput.press("Enter");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-width-mode", "fixed");
    await expect(frames.nth(index)).toHaveCSS("width", "200px");
  }
  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveCSS("width", "120px");
  await expect(frames.nth(1)).toHaveCSS("width", "120px");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames.nth(0)).toHaveCSS("width", "200px");
  await expect(frames.nth(1)).toHaveCSS("width", "200px");

  const heightControl = inspector.locator('[data-size-combobox="frame-height"]');
  await heightControl.getByRole("button", { name: "Open frame height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fill container" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-height-mode", "fill");
    await expect(frames.nth(index)).toHaveAttribute("style", /height: auto/);
    await expect(frames.nth(index)).toHaveCSS("align-self", "stretch");
  }
  await heightControl.getByRole("button", { name: "Open frame height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fixed height" }).click();
  await expect(frames.nth(0)).toHaveCSS("height", "100px");
  await expect(frames.nth(1)).toHaveCSS("height", "140px");
  const heightInput = heightControl.getByRole("combobox", { name: "Frame height" });
  await heightInput.fill("160");
  await heightInput.press("Enter");
  await expect(frames.nth(0)).toHaveCSS("height", "160px");
  await expect(frames.nth(1)).toHaveCSS("height", "160px");

  await page.getByRole("spinbutton", { name: "Radius" }).fill("10");
  await page.getByRole("spinbutton", { name: "Radius" }).press("Tab");
  await page.getByRole("textbox", { name: "Horizontal padding" }).fill("24");
  await page.getByRole("textbox", { name: "Horizontal padding" }).press("Tab");
  await page.locator("#frame-gap").fill("18");
  await page.locator("#frame-gap").press("Tab");
  await inspector.getByRole("button", { name: "Horizontal", exact: true }).click();
  await inspector.getByRole("button", { name: "Align horizontal and vertical center" }).click();
  await inspector.getByRole("button", { name: "Open semantic element options" }).click();
  await inspector.getByRole("option", { name: "button", exact: true }).click();

  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-radius", "10");
    await expect(frames.nth(index)).toHaveAttribute("data-padding-left", "24");
    await expect(frames.nth(index)).toHaveAttribute("data-padding-right", "24");
    await expect(frames.nth(index)).toHaveAttribute("data-gap", "18");
    await expect(frames.nth(index)).toHaveAttribute("data-direction", "horizontal");
    await expect(frames.nth(index)).toHaveAttribute("data-alignment", "center");
    await expect(frames.nth(index)).toHaveAttribute("data-html-tag", "button");
  }

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveAttribute("data-html-tag", "div");
  await expect(frames.nth(1)).toHaveAttribute("data-html-tag", "div");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames.nth(0)).toHaveAttribute("data-html-tag", "button");
  await expect(frames.nth(1)).toHaveAttribute("data-html-tag", "button");

  await page.evaluate(() => {
    const first = getSelectedFrameRecords()[0];
    selectLayerKeys([`frame:${first.id}`], `frame:${first.id}`);
    syncElementSelectionStyles();
    updateInspector();
  });
  await expect(inspector.getByRole("heading", { name: "Frame", exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "Radius" })).toBeEnabled();
  await page.getByRole("spinbutton", { name: "Radius" }).fill("12");
  await page.getByRole("spinbutton", { name: "Radius" }).press("Tab");
  await expect(page.locator('[data-frame-id="1"]')).toHaveAttribute("data-radius", "12");
  await expect(page.locator('[data-frame-id="2"]')).toHaveAttribute("data-radius", "10");
});

test("bulk-edits shared frame fill and border colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frames = [
      createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false }),
      createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false }),
    ];
    frames.forEach((record) => {
      record.element.dataset.frameColor = "#336699";
      record.element.dataset.frameColorOpacity = "100";
      record.element.style.backgroundColor = "#336699";
    });
    const keys = frames.map((record) => `frame:${record.id}`);
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const frames = page.locator("[data-canvas-root-stack] > [data-frame-id]");
  await expect(page.locator("[data-frame-inspector] > [data-selection-colors]")).toBeHidden();
  const fillHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await fillHex.fill("CC5500");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color", "#CC5500");
    await expect(frames.nth(index)).toHaveCSS("background-color", "rgb(204, 85, 0)");
  }
  const fillOpacity = page.getByRole("textbox", { name: "Frame background opacity" });
  await fillOpacity.fill("50");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveCSS("background-color", "rgba(204, 85, 0, 0.5)");
  }
  await page.getByRole("button", { name: "Remove frame fill" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color", "");
  }

  await page.getByRole("button", { name: "Add frame border" }).click();
  const borderHex = page.getByRole("textbox", { name: "Frame outline hex value" });
  await borderHex.fill("445566");
  const borderOpacity = page.getByRole("textbox", { name: "Frame outline opacity" });
  await borderOpacity.fill("40");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "#445566");
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color-opacity", "40");
    await expect(frames.nth(index)).toHaveCSS("box-shadow", "rgba(68, 85, 102, 0.4) 0px 0px 0px 1px inset");
  }
  await page.getByRole("button", { name: "Remove frame border" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "");
  }

  await page.keyboard.press("ControlOrMeta+z");
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "#445566");
  }
});

test("combines partial frame paints from the first layer in tree order", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    Object.assign(first.element.dataset, {
      frameColor: "",
      frameColorOpacity: "100",
      outlineColor: "#336699",
      outlineColorOpacity: "40",
      outlineWeight: "2",
    });
    Object.assign(second.element.dataset, {
      frameColor: "#CC5500",
      frameColorOpacity: "60",
      outlineColor: "",
      outlineColorOpacity: "100",
    });
    second.element.style.backgroundColor = getColorWithOpacity("#CC5500", 60);
    applyFrameOutline(first.element);
    const keys = [`frame:${second.id}`, `frame:${first.id}`];
    selectLayerKeys(keys, keys[0]);
    syncElementSelectionStyles();
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const paintSections = inspector.locator(":scope > [data-paint-section]");
  const fillSection = paintSections.first();
  const borderSection = paintSections.last();
  const frames = page.locator("[data-canvas-root-stack] > [data-frame-id]");
  const fillMixedMessage = fillSection.getByText("Click + to combine colors", { exact: true });
  await expect(fillMixedMessage).toBeVisible();
  await expect(fillMixedMessage).toHaveCSS("font-size", "14px");
  await expect(fillMixedMessage).toHaveCSS("line-height", "16px");
  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeVisible();
  await expect(fillSection.locator("[data-tooltip-content]")).toHaveText("Add fill");
  await expect(borderSection.locator("[data-tooltip-content]")).toHaveText("Add border");

  await page.getByRole("button", { name: "Add frame fill" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color", "#CC5500");
    await expect(frames.nth(index)).toHaveAttribute("data-frame-color-opacity", "60");
  }
  await expect(fillSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();

  await page.getByRole("button", { name: "Add frame border" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color", "#336699");
    await expect(frames.nth(index)).toHaveAttribute("data-outline-color-opacity", "40");
  }
  await expect(borderSection.getByText("Click + to combine colors", { exact: true })).toBeHidden();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveAttribute("data-outline-color", "#336699");
  await expect(frames.nth(1)).toHaveAttribute("data-outline-color", "");
  await expect(frames.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(frames.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames.nth(0)).toHaveAttribute("data-frame-color", "");
  await expect(frames.nth(1)).toHaveAttribute("data-frame-color", "#CC5500");
});


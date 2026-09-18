const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
test("bulk edits selected frame sizing inside one variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    first.element.dataset.width = "100";
    first.element.style.width = "100px";
    second.element.dataset.width = "140";
    second.element.style.width = "140px";
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    const targets = ["frame:1", "frame:2"];
    selectVariantLayerTargetsState(selectedVariantId, targets, targets.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const previews = page.locator(".variant-preview");
  const widthInput = page.getByRole("combobox", { name: "Frame width" });
  await expect(widthInput).toHaveValue("");
  await expect(widthInput).toHaveAttribute("placeholder", "Mixed");
  await widthInput.fill("180");
  await widthInput.press("Enter");

  await expect(previews.nth(0).locator('[data-frame-id="1"]')).toHaveCSS("width", "100px");
  await expect(previews.nth(0).locator('[data-frame-id="2"]')).toHaveCSS("width", "140px");
  await expect(previews.nth(1).locator('[data-frame-id="1"]')).toHaveCSS("width", "180px");
  await expect(previews.nth(1).locator('[data-frame-id="2"]')).toHaveCSS("width", "180px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(previews.nth(1).locator('[data-frame-id="1"]')).toHaveCSS("width", "100px");
  await expect(previews.nth(1).locator('[data-frame-id="2"]')).toHaveCSS("width", "140px");
});

test("bulk edits multiple selected text layers in one variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First variant text",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second variant text",
    });
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectVariantLayerTargetsState(2, ["text:1", "text:2"], "text:2");
    renderTree();
  });

  const previews = page.locator(".variant-preview");
  const fontSize = page.locator("#text-size");
  await fontSize.fill("24");
  await fontSize.press("Enter");
  const widthControl = page.locator('[data-size-combobox="text-width"]');
  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");

  for (let index = 1; index <= 2; index += 1) {
    await expect(previews.nth(0).locator(`[data-text-id="${index}"]`)).toHaveCSS("font-size", "14px");
    await expect(previews.nth(0).locator(`[data-text-id="${index}"]`)).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(previews.nth(0).locator(`[data-text-id="${index}"]`)).toHaveAttribute("data-width-mode", "hug");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveCSS("font-size", "24px");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveCSS("color", "rgb(122, 62, 157)");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveAttribute("data-width-mode", "fill");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveCSS("flex-grow", "1");
  }
});

test("applies variant fill sizing consistently to frames and text on canvas and export", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.direction = "vertical";
    currentComponent.frameRecord.element.style.flexDirection = "column";
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const text = createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Fill me", beginEditing: false, isNew: false });
    addVariant({ render: false });
    const fillVariant = addVariant({ render: false });
    window.__fillSizingVariantId = fillVariant.id;
    upsertLocalVariantOverride(fillVariant, `frame:${frame.id}`, "width", "100%");
    upsertLocalVariantOverride(fillVariant, `text:${text.id}`, "width", "100%");
    renderVariants();
  });

  const fillVariantId = await page.evaluate(() => window.__fillSizingVariantId);
  const fillPreview = page.locator(`.variant-preview[data-variant-id="${fillVariantId}"]`);
  for (const selector of ['[data-frame-id="1"]', '[data-text-id="1"]']) {
    await expect(fillPreview.locator(selector)).toHaveAttribute("data-width-mode", "fill");
    await expect(fillPreview.locator(selector)).toHaveCSS("align-self", "stretch");
  }

  const exportStyles = await page.evaluate(() => {
    const variant = getVariant(window.__fillSizingVariantId);
    const context = createVariantExportContext(variant);
    return {
      frame: getExportLayerStyleState({ type: "frame", record: getFrameRecord(1) }, [], context).style,
      text: getExportLayerStyleState({ type: "text", record: getTextRecord(1) }, [], context).style,
    };
  });
  expect(exportStyles.frame).toMatchObject({ width: "100%", alignSelf: "stretch" });
  expect(exportStyles.text).toMatchObject({ width: "100%", alignSelf: "stretch" });
});

test("bulk edits vector dimensions and colors inside one variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const definitions = [
      { name: "First vector", width: 24, height: 24, color: "#CC0000" },
      { name: "Second vector", width: 36, height: 40, color: "#00AA00" },
    ];
    definitions.forEach((definition) => createCanvasVector({
      name: definition.name,
      width: definition.width,
      height: definition.height,
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="${definition.width}" height="${definition.height}"><path d="M2 2h20v20H2z" fill="${definition.color}"/></svg>`,
    }, 0, 0, currentComponent.frameRecord, { select: false }));
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => selectVariant(1, {
    layerTargets: ["vector:1", "vector:2"],
  }));

  const previews = page.locator(".variant-preview");
  const selectedVectors = previews.nth(0).locator("[data-vector-id]");
  const inheritedVectors = previews.nth(1).locator("[data-vector-id]");
  const width = page.getByRole("spinbutton", { name: "Vector width" });
  const height = page.getByRole("spinbutton", { name: "Vector height" });
  const selectionColors = page.locator("[data-vector-inspector] > [data-selection-colors]");

  await expect(page.getByRole("heading", { name: "Vectors", exact: true })).toBeVisible();
  await expect(width).toHaveAttribute("placeholder", "Mixed");
  await expect(height).toHaveAttribute("placeholder", "Mixed");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);

  const firstColor = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await firstColor.fill("EE4400");
  await firstColor.press("Enter");
  await width.fill("60");
  await width.press("Tab");
  await height.fill("70");
  await height.press("Tab");

  for (const vectors of [selectedVectors, inheritedVectors]) {
    await expect(vectors.nth(0).locator("path")).toHaveCSS("fill", "rgb(238, 68, 0)");
    await expect(vectors.nth(1).locator("path")).toHaveCSS("fill", "rgb(0, 170, 0)");
    for (let index = 0; index < 2; index += 1) {
      await expect(vectors.nth(index)).toHaveCSS("width", "60px");
      await expect(vectors.nth(index)).toHaveCSS("height", "70px");
    }
  }

  const overrides = await page.evaluate(() => variantModel.getVariants().map((variant) => (
    (variant.overrides ?? []).filter((override) => (
      override.target.startsWith("vector:")
      && ["width", "height", "fill"].includes(override.property)
    ))
  )));
  expect(overrides[0]).toEqual(expect.arrayContaining([
    { target: "vector:1", property: "fill", value: "#EE4400" },
    { target: "vector:1", property: "width", value: "60px" },
    { target: "vector:2", property: "width", value: "60px" },
    { target: "vector:1", property: "height", value: "70px" },
    { target: "vector:2", property: "height", value: "70px" },
  ]));
  expect(overrides[1]).toEqual([]);
});

test("preserves character-range colors in a variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Red black",
    });
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectVariantLayerTargetsState(2, ["text:1"], "text:1");
    renderTree();
    const text = document.querySelector('.variant-preview[data-variant-id="2"] [data-text-id="1"]');
    const range = document.createRange();
    range.setStart(text.firstChild, 0);
    range.setEnd(text.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const fillHex = page.getByRole("textbox", { name: "Text color hex value" });
  await fillHex.fill("FF0000");
  await fillHex.press("Enter");
  await page.evaluate(() => renderVariants());

  const previews = page.locator(".variant-preview");
  await expect(previews.nth(0).locator('[data-rich-text-color="#FF0000"]')).toHaveCount(0);
  await expect(previews.nth(1).locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveText("Red black");
});

test("uses current inherited run colors when a variant root is selected", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const record = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Red black",
    });
    record.element.innerHTML = '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">Red</span> black';
    syncTextRecordContent(record, record.element.textContent, { writeElement: false });
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectVariantLayerTargetsState(2, ["text:1"], "text:1");
    renderVariants();
    const record = getSelectedTextRecord();
    applyTextRangeColor(record, {
      element: record.element,
      textId: record.id,
      start: 0,
      end: 3,
      variantId: 2,
    }, "#00AA00", 100);
    selectVariantState(2, null);
    renderVariants();
    updateInspector();
  });

  const previews = page.locator(".variant-preview");
  await expect(previews.nth(0).locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(previews.nth(1).locator('[data-rich-text-color="#00AA00"]')).toHaveText("Red");
  const selectionColors = await page.locator("[data-selection-colors] [data-color-hex]").evaluateAll(
    (inputs) => inputs.map((input) => input.value),
  );
  expect(selectionColors).toContain("00AA00");
  expect(selectionColors).toContain("000000");
  expect(selectionColors).not.toContain("FF0000");
});

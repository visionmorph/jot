const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("applies Fixed, Hug, and Fill sizing modes to selected text layers", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const first = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First sizing target",
    });
    const second = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second",
    });
    first.element.dataset.widthMode = "fixed";
    first.element.dataset.width = "120";
    applyLayerSizing("text", first);
    applyLayerSizing("text", second);
    const keys = [`text:${first.id}`, `text:${second.id}`];
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  const widthControl = page.locator('[data-size-combobox="text-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Text width" });
  await expect(widthInput).toHaveValue("");
  await expect(widthInput).toHaveAttribute("placeholder", "Mixed");
  await expect(widthControl.locator('[data-size-option][aria-selected="true"]')).toHaveCount(0);

  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-width-mode", "fill");
    await expect(texts.nth(index)).toHaveCSS("flex", "1 1 0px");
  }

  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Hug content" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-width-mode", "hug");
    await expect(texts.nth(index)).toHaveAttribute("style", /width: max-content/);
  }

  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fixed width" }).click();
  await widthInput.press("Tab");
  await widthInput.fill("180");
  await widthInput.press("Enter");
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-width-mode", "fixed");
    await expect(texts.nth(index)).toHaveCSS("width", "180px");
  }

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveCSS("width", "120px");
  await expect(texts.nth(1)).not.toHaveCSS("width", "180px");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(texts.nth(0)).toHaveCSS("width", "180px");
  await expect(texts.nth(1)).toHaveCSS("width", "180px");

  const heightControl = page.locator('[data-size-combobox="text-height"]');
  await heightControl.getByRole("button", { name: "Open text height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fill container" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-height-mode", "fill");
    await expect(texts.nth(index)).toHaveCSS("align-self", "stretch");
  }
});

test("bulk edits marquee-selected text layers from the inspector", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const texts = component.locator(":scope > [data-text-id]");
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second",
    });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const componentBounds = await component.boundingBox();
  const firstBounds = await texts.nth(0).boundingBox();
  const secondBounds = await texts.nth(1).boundingBox();
  expect(componentBounds).not.toBeNull();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();
  await page.keyboard.down("Control");
  await page.mouse.move(componentBounds.x - 6, Math.min(firstBounds.y, secondBounds.y) - 2);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(firstBounds.x + firstBounds.width, secondBounds.x + secondBounds.width) + 2,
    Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeVisible();

  const fontSize = page.locator("#text-size");
  await fontSize.fill("24");
  await fontSize.press("Enter");
  await page.getByRole("combobox", { name: "Text width" }).fill("180");
  await page.getByRole("combobox", { name: "Text width" }).press("Enter");
  await page.locator("#text-line-height").fill("32");
  await page.locator("#text-line-height").press("Tab");
  await page.locator("#text-letter-spacing").fill("10%");
  await page.locator("#text-letter-spacing").press("Tab");
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  await page.getByRole("button", { name: "Align text vertically and horizontally centered" }).click();
  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");

  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("font-size", "24px");
    await expect(texts.nth(index)).toHaveCSS("width", "180px");
    await expect(texts.nth(index)).toHaveCSS("line-height", "32px");
    await expect(texts.nth(index)).toHaveCSS("letter-spacing", "2.4px");
    await expect(texts.nth(index)).toHaveCSS("font-weight", "700");
    await expect(texts.nth(index)).toHaveCSS("text-align", "center");
    await expect(texts.nth(index)).toHaveCSS("color", "rgb(122, 62, 157)");
  }

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(texts.nth(1)).toHaveCSS("color", "rgb(0, 0, 0)");
});

test("shows mixed bulk text values and overrides every selected text layer", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const first = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First",
    });
    const second = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second",
    });
    Object.assign(first.element.dataset, {
      fontFamily: "Inter",
      fontWeight: "400",
      fontSize: "14",
      lineHeight: "Auto",
      letterSpacing: "0%",
      textColor: "#112233",
    });
    Object.assign(second.element.dataset, {
      fontFamily: "Roboto",
      fontWeight: "700",
      fontSize: "20",
      lineHeight: "28",
      letterSpacing: "10%",
      textColor: "#445566",
    });
    first.element.style.color = "#112233";
    second.element.style.color = "#445566";
    selectLayerKeys([`text:${first.id}`, `text:${second.id}`], `text:${second.id}`);
    syncElementSelectionStyles();
    renderTree();
  });

  for (const selector of ["#text-font", "#text-weight", "#text-size", "#text-line-height", "#text-letter-spacing"]) {
    const input = page.locator(selector);
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", "Mixed");
  }
  await expect(page.locator("[data-text-inspector] > [data-paint-section]")).toBeHidden();
  await expect(page.locator("[data-selection-colors]")).toBeVisible();

  await page.getByRole("button", { name: "Open font family options" }).click();
  await page.getByRole("option", { name: "Lato", exact: true }).click();
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Regular", exact: true }).click();
  await page.locator("#text-size").fill("24");
  await page.locator("#text-size").press("Enter");
  await page.locator("#text-line-height").fill("32");
  await page.locator("#text-line-height").press("Tab");
  await page.locator("#text-letter-spacing").fill("5%");
  await page.locator("#text-letter-spacing").press("Tab");

  const values = await page.evaluate(() => getSelectedTextRecords().map(({ element }) => ({
    family: element.dataset.fontFamily,
    weight: element.dataset.fontWeight,
    size: element.dataset.fontSize,
    lineHeight: element.dataset.lineHeight,
    letterSpacing: element.dataset.letterSpacing,
  })));
  expect(values).toEqual([
    { family: "Lato", weight: "400", size: "24", lineHeight: "32", letterSpacing: "5%" },
    { family: "Lato", weight: "400", size: "24", lineHeight: "32", letterSpacing: "5%" },
  ]);
  await page.evaluate(() => updateInspector());
  await expect(page.locator("#text-font")).toHaveValue("Lato");
  await expect(page.locator("#text-weight")).toHaveValue("Regular");
  await expect(page.locator("#text-size")).toHaveValue("24");
  await expect(page.locator("#text-line-height")).toHaveValue("32");
  await expect(page.locator("#text-letter-spacing")).toHaveValue("5%");
  await expect(page.locator("#text-size")).not.toHaveAttribute("placeholder", "Mixed");
});

test("shows mixed text alignment and applies one bulk alignment history step", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const first = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Top left",
    });
    const second = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Bottom right",
    });
    first.element.dataset.alignment = "top-left";
    second.element.dataset.alignment = "bottom-right";
    applyTextAlignment(first.element);
    applyTextAlignment(second.element);
    const keys = [`text:${first.id}`, `text:${second.id}`];
    selectLayerKeys(keys, keys.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  const selectedAlignmentOptions = page.locator('[data-text-inspector] [data-text-alignment][aria-pressed="true"]');
  await expect(selectedAlignmentOptions).toHaveCount(0);

  await page.getByRole("button", { name: "Align text vertically and horizontally centered" }).click();
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveAttribute("data-alignment", "center");
    await expect(texts.nth(index)).toHaveAttribute("aria-selected", "true");
  }
  await expect(selectedAlignmentOptions).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts.nth(0)).toHaveAttribute("data-alignment", "top-left");
  await expect(texts.nth(1)).toHaveAttribute("data-alignment", "bottom-right");
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(selectedAlignmentOptions).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(texts.nth(0)).toHaveAttribute("data-alignment", "center");
  await expect(texts.nth(1)).toHaveAttribute("data-alignment", "center");
});

test("keeps a shift-click text selection through inspector editing and history", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First selection",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second selection",
    });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  await texts.nth(0).click();
  await texts.nth(1).click({ modifiers: ["Shift"] });
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "true");

  const fontSize = page.locator("#text-size");
  await fontSize.fill("24");
  await fontSize.press("Enter");
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("font-size", "24px");
    await expect(texts.nth(index)).toHaveAttribute("aria-selected", "true");
  }

  await page.keyboard.press("ControlOrMeta+z");
  for (let index = 0; index < 2; index += 1) {
    await expect(texts.nth(index)).toHaveCSS("font-size", "14px");
    await expect(texts.nth(index)).toHaveAttribute("aria-selected", "true");
  }

  await texts.nth(1).click({ modifiers: ["Shift"] });
  await expect(texts.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(texts.nth(1)).toHaveAttribute("aria-selected", "false");
});


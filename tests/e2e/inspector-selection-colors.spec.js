const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createGroupedColorFixture } = require("../support/test-fixtures.cjs");

test("groups matching descendant colors and edits them as one undoable selection color", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page);

  const section = page.locator("[data-selection-colors]");
  const root = page.locator("[data-canvas-root-stack]");
  const text = root.locator('[data-text-id="1"]');
  const path = root.locator('[data-vector-id="1"] path');
  await expect(section.getByRole("heading", { name: "Selection colors" })).toBeVisible();
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);

  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("CC5500");
  await expect(root).toHaveAttribute("data-outline-color", "#CC5500");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");
  await colorHex.press("Enter");
  await expect(root).toHaveAttribute("data-outline-color", "#CC5500");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(root).toHaveAttribute("data-outline-color", "#336699");
  await expect(text).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(path).toHaveCSS("fill", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");
});

test("live-updates a matching frame border and nested text from the selection color picker", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    frame.element.dataset.outlineColor = "#336699";
    frame.element.dataset.outlineColorOpacity = "100";
    frame.element.dataset.outlineWeight = "2";
    applyFrameOutline(frame.element);
    const text = createCanvasText(frame, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Matching border",
    });
    text.element.dataset.textColor = "#336699";
    text.element.style.color = "#336699";
    selectLayerKeys([`frame:${frame.id}`], `frame:${frame.id}`);
    syncElementSelectionStyles();
    updateInspector();
  });

  const frame = page.locator('[data-frame-id="1"]');
  const text = frame.locator('[data-text-id="1"]');
  const section = page.locator("[data-frame-inspector] > [data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);
  await section.getByRole("button", { name: "Choose selection color 1" }).click();
  const popupHex = page.getByRole("textbox", { name: "Hex color value" });
  await popupHex.fill("CC5500");

  await expect(frame).toHaveCSS("box-shadow", "rgb(204, 85, 0) 0px 0px 0px 2px inset");
  await expect(text).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(page.getByRole("textbox", { name: "Frame outline hex value" })).toHaveValue("CC5500");
});

test("propagates selection color opacity to every matching property", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page);

  const section = page.locator("[data-selection-colors]");
  const root = page.locator("[data-canvas-root-stack]");
  const text = root.locator('[data-text-id="1"]');
  const path = root.locator('[data-vector-id="1"] path');
  const opacity = section.getByRole("textbox", { name: "Selection color 1 opacity" });
  await opacity.fill("50");
  await opacity.press("Tab");

  await expect(root).toHaveAttribute("data-outline-color-opacity", "50");
  await expect(text).toHaveCSS("color", "rgba(51, 102, 153, 0.5)");
  await expect(path).toHaveCSS("fill", "rgba(51, 102, 153, 0.5)");
});

test("keeps distinct selection colors isolated", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page, { splitColors: true });

  const section = page.locator("[data-selection-colors]");
  const root = page.locator("[data-canvas-root-stack]");
  const text = root.locator('[data-text-id="1"]');
  const path = root.locator('[data-vector-id="1"] path');
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);

  const backgroundHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await expect(backgroundHex).toHaveValue("336699");
  await backgroundHex.fill("7A3E9D");
  await backgroundHex.press("Enter");
  await expect(root).toHaveCSS("background-color", "rgb(122, 62, 157)");
  await expect(text).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(path).toHaveCSS("fill", "rgb(255, 255, 255)");
});

test("switches between selection color inputs with one click", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page, { splitColors: true });

  const section = page.locator("[data-selection-colors]");
  const firstHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  const secondOpacity = section.getByRole("textbox", { name: "Selection color 2 opacity" });
  const firstOpacity = section.getByRole("textbox", { name: "Selection color 1 opacity" });

  await firstHex.click();
  await expect(firstHex).toBeFocused();
  await secondOpacity.click();
  await expect(secondOpacity).toBeFocused();
  await firstOpacity.click();
  await expect(firstOpacity).toBeFocused();
});

test("refreshes component selection colors after background and border edits", async ({ page }) => {
  await openApp(page);
  await createGroupedColorFixture(page, { splitColors: true });

  const section = page.locator("[data-selection-colors]");
  const controls = section.locator('[data-color-control="selection"]');
  const backgroundHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await backgroundHex.fill("7A3E9D");
  await backgroundHex.press("Enter");
  await expect(controls).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("7A3E9D");

  await page.getByRole("button", { name: "Add frame border" }).click();
  await expect(controls).toHaveCount(3);
  const borderHex = page.getByRole("textbox", { name: "Frame outline hex value" });
  await borderHex.fill("CC5500");
  await borderHex.press("Enter");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("CC5500");
});

test("updates a mask icon through its currentColor value", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "";
    canvasRootStack.style.backgroundColor = "";
    const textRecord = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Icon label",
    });
    textRecord.element.dataset.textColor = "#336699";
    textRecord.element.style.color = "#336699";
    const iconRecord = createCanvasVector({
      name: "Mask icon",
      width: 24,
      height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    iconRecord.element.style.maskImage = 'url("src/icons/add.svg")';
    iconRecord.element.style.backgroundColor = "currentcolor";
    iconRecord.element.style.color = "#336699";
    selectComponentState(currentComponent.id);
    renderTree();
  });

  const section = page.locator("[data-selection-colors]");
  const icon = page.locator('[data-canvas-root-stack] [data-vector-id="1"]');
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);
  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(icon).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(icon).toHaveCSS("background-color", "rgb(204, 85, 0)");
});

test("shows selection colors for one colored direct child and rolls up deeper colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "";
    canvasRootStack.style.backgroundColor = "";
    const directText = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Direct color",
    });
    directText.element.dataset.textColor = "#336699";
    directText.element.style.color = "#336699";

    const wrapper = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const nestedText = createCanvasText(wrapper, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Nested color",
    });
    nestedText.element.dataset.textColor = "#CC5500";
    nestedText.element.style.color = "#CC5500";
    selectComponentState(currentComponent.id);
    renderTree();
  });

  const section = page.locator("[data-selection-colors]");
  await expect(section).toBeVisible();
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("336699");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("CC5500");
});

test("does not show selection colors for a single layer", async ({ page }) => {
  await openApp(page);
  await expect(page.locator("[data-selection-colors]")).toBeHidden();
  await expect(page.getByRole("textbox", { name: "Frame background hex value" })).toBeVisible();
});


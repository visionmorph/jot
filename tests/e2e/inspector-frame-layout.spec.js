const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createGroupedColorFixture } = require("../support/test-fixtures.cjs");

test("changes frame fill opacity and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const colorHex = page.getByRole("textbox", { name: "Frame background hex value" });
  const opacity = page.getByRole("textbox", { name: "Frame background opacity" });

  await colorHex.fill("336699");
  await colorHex.press("Enter");
  await opacity.fill("50");
  await opacity.press("Tab");
  await expect(component).toHaveCSS("background-color", "rgba(51, 102, 153, 0.5)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveCSS("background-color", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveCSS("background-color", "rgba(51, 102, 153, 0.5)");
});

test("changes frame layout controls and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const horizontalPadding = page.getByRole("textbox", { name: "Horizontal padding" });
  const verticalPadding = page.getByRole("textbox", { name: "Vertical padding" });
  const gapInput = page.locator("#frame-gap");
  const radiusInput = page.getByRole("spinbutton", { name: "Radius" });

  await horizontalPadding.fill("16");
  await horizontalPadding.press("Tab");
  await verticalPadding.fill("12");
  await verticalPadding.press("Tab");
  await gapInput.fill("18");
  await gapInput.press("Tab");
  await radiusInput.fill("8");
  await radiusInput.press("Tab");
  await page.getByRole("button", { name: "Vertical", exact: true }).click();

  await expect(component).toHaveCSS("padding-left", "16px");
  await expect(component).toHaveCSS("padding-top", "12px");
  await expect(component).toHaveCSS("gap", "18px");
  await expect(component).toHaveCSS("border-radius", "8px");
  await expect(component).toHaveCSS("flex-direction", "column");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveCSS("flex-direction", "row");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveCSS("flex-direction", "column");
});

test("applies component gap after wrapping text and duplicating its frame", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Label",
    });
    selectCanvasText(text.element);
  });
  await page.keyboard.press("Shift+a");
  await page.keyboard.press("ControlOrMeta+d");

  const component = page.locator("[data-canvas-root-stack]");
  const frames = component.locator(":scope > .canvas-frame");
  await expect(frames).toHaveCount(2);
  await page.locator(".tree-node--component").click();
  await page.locator("#frame-gap").fill("32");
  await page.locator("#frame-gap").press("Tab");

  await expect(component).toHaveCSS("gap", "32px");
  await expect.poll(() => frames.evaluateAll((elements) => {
    const [first, second] = elements.map((element) => element.getBoundingClientRect());
    return Math.round(second.left - first.right);
  })).toBe(32);
});

test("displays and bulk-edits direct layout properties for selected variant roots", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second, third] = variantModel.getVariants();
    const setLayout = (variant, values) => {
      Object.entries(values).forEach(([property, value]) => {
        upsertLocalVariantOverride(variant, "component:0", property, value);
      });
    };
    setLayout(first, {
      width: "120px",
      height: "100px",
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      gap: "12px",
      borderRadius: "8px",
      paddingLeft: "10px",
      paddingTop: "10px",
      paddingRight: "10px",
      paddingBottom: "10px",
    });
    setLayout(second, {
      width: "160px",
      height: "140px",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      gap: "24px",
      borderRadius: "12px",
      paddingLeft: "20px",
      paddingTop: "14px",
      paddingRight: "20px",
      paddingBottom: "14px",
    });
    setLayout(third, {
      width: "220px",
      height: "180px",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      gap: "30px",
      borderRadius: "20px",
      paddingLeft: "30px",
      paddingTop: "30px",
      paddingRight: "30px",
      paddingBottom: "30px",
    });
    renderVariants();
    selectVariants([first.id, second.id], second.id);
    updateInspector();
  });

  const inspector = page.locator("[data-frame-inspector]");
  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  const widthInput = page.getByRole("combobox", { name: "Frame width" });
  const heightInput = page.getByRole("combobox", { name: "Frame height" });
  const gapInput = page.locator("#frame-gap");
  const radiusInput = page.getByRole("spinbutton", { name: "Radius" });
  const horizontalPadding = page.getByRole("textbox", { name: "Horizontal padding" });
  const verticalPadding = page.getByRole("textbox", { name: "Vertical padding" });

  await expect(inspector.getByRole("heading", { name: "Frames", exact: true })).toBeVisible();
  for (const input of [widthInput, heightInput, gapInput, radiusInput, horizontalPadding, verticalPadding]) {
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", "Mixed");
  }
  await expect(inspector.locator("[data-frame-direction][aria-pressed='true']")).toHaveCount(0);
  await expect(inspector.locator("[data-frame-alignment][aria-pressed='true']")).toHaveCount(0);

  await widthInput.fill("180");
  await widthInput.press("Enter");
  const heightControl = inspector.locator('[data-size-combobox="frame-height"]');
  await heightControl.getByRole("button", { name: "Open frame height sizing options" }).click();
  await heightControl.getByRole("option", { name: "Fill container" }).click();
  await inspector.getByRole("button", { name: "Horizontal", exact: true }).click();
  await inspector.getByRole("button", { name: "Align horizontal and vertical center" }).click();
  await gapInput.fill("18");
  await gapInput.press("Tab");
  await radiusInput.fill("10");
  await radiusInput.press("Tab");
  await horizontalPadding.fill("24");
  await horizontalPadding.press("Tab");
  await verticalPadding.fill("16");
  await verticalPadding.press("Tab");

  for (let index = 0; index < 2; index += 1) {
    await expect(previews.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(roots.nth(index)).toHaveCSS("width", "180px");
    await expect(roots.nth(index)).toHaveAttribute("data-height-mode", "fill");
    await expect(roots.nth(index)).toHaveAttribute("style", /height: 100%/);
    await expect(roots.nth(index)).toHaveCSS("flex-direction", "row");
    await expect(roots.nth(index)).toHaveCSS("align-items", "center");
    await expect(roots.nth(index)).toHaveCSS("justify-content", "center");
    await expect(roots.nth(index)).toHaveCSS("gap", "18px");
    await expect(roots.nth(index)).toHaveCSS("border-radius", "10px");
    await expect(roots.nth(index)).toHaveCSS("padding-left", "24px");
    await expect(roots.nth(index)).toHaveCSS("padding-right", "24px");
    await expect(roots.nth(index)).toHaveCSS("padding-top", "16px");
    await expect(roots.nth(index)).toHaveCSS("padding-bottom", "16px");
  }
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(roots.nth(2)).toHaveCSS("width", "220px");
  await expect(roots.nth(2)).toHaveCSS("height", "180px");
  await expect(roots.nth(2)).toHaveCSS("gap", "30px");
  await expect(roots.nth(2)).toHaveCSS("padding-top", "30px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(roots.nth(0)).toHaveCSS("padding-top", "10px");
  await expect(roots.nth(1)).toHaveCSS("padding-top", "14px");
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(roots.nth(2)).toHaveCSS("padding-top", "30px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(roots.nth(0)).toHaveCSS("padding-top", "16px");
  await expect(roots.nth(1)).toHaveCSS("padding-top", "16px");
});


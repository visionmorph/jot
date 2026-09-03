const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function dropSvg(page, name, source) {
  const canvas = page.getByRole("region", { name: "Canvas" });
  await canvas.evaluate((element, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([file.source], file.name, { type: "image/svg+xml" }));
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      dataTransfer: transfer,
    }));
  }, { name, source });
}

async function createTextLayer(page, content = "Text target") {
  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await text.fill(content);
  await text.press("Escape");
  return text;
}

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

test("changes the frame HTML tag and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open HTML tag options" }).click();
  await page.getByRole("option", { name: "button", exact: true }).click();
  await expect(component).toHaveAttribute("data-html-tag", "button");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveAttribute("data-html-tag", "div");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("data-html-tag", "button");
});

test("changes frame sizing modes and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const widthControl = page.locator('[data-size-combobox="frame-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Frame width" });

  await widthControl.getByRole("button", { name: "Open frame width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fixed width" }).click();
  await expect(component).toHaveAttribute("data-width-mode", "fixed");

  await widthInput.fill("160");
  await widthInput.press("Enter");
  await expect(component).toHaveCSS("width", "160px");

  await widthControl.getByRole("button", { name: "Open frame width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  await expect(component).toHaveAttribute("data-width-mode", "fill");
  await expect(component).toHaveAttribute("style", /width: 100%/);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveAttribute("data-width-mode", "fixed");
  await expect(component).toHaveCSS("width", "160px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("data-width-mode", "fill");
  await expect(component).toHaveAttribute("style", /width: 100%/);
});

test("changes text color and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Color target");

  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");
  await expect(text).toHaveCSS("color", "rgb(122, 62, 157)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("color", "rgb(0, 0, 0)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("color", "rgb(122, 62, 157)");
});

test("changes text typography and alignment", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Typography target");
  const sizeInput = page.locator("#text-size");
  const lineHeightInput = page.locator("#text-line-height");
  const letterSpacingInput = page.locator("#text-letter-spacing");

  await sizeInput.fill("24");
  await sizeInput.press("Tab");
  await lineHeightInput.fill("32");
  await lineHeightInput.press("Tab");
  await letterSpacingInput.fill("10%");
  await letterSpacingInput.press("Tab");
  await page.getByRole("button", { name: "Align text vertically and horizontally centered" }).click();

  await expect(text).toHaveCSS("font-size", "24px");
  await expect(text).toHaveCSS("line-height", "32px");
  await expect(text).toHaveCSS("letter-spacing", "2.4px");
  await expect(text).toHaveCSS("text-align", "center");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("text-align", "left");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("text-align", "center");
});

test("changes text weight and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Weight target");
  await page.getByRole("button", { name: "Open font weight options" }).click();
  await page.getByRole("option", { name: "Bold", exact: true }).click();
  await expect(text).toHaveCSS("font-weight", "700");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("font-weight", "400");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("font-weight", "700");
});

test("changes text sizing modes and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Sizing target");
  const widthControl = page.locator('[data-size-combobox="text-width"]');
  const widthInput = widthControl.getByRole("combobox", { name: "Text width" });

  await expect(text).toHaveAttribute("data-width-mode", "hug");
  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  await expect(text).toHaveAttribute("data-width-mode", "fill");
  await widthInput.press("Enter");

  await widthInput.fill("180");
  await widthInput.press("Enter");
  await expect(text).toHaveAttribute("data-width-mode", "fixed");
  await expect(text).toHaveCSS("width", "180px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveAttribute("data-width-mode", "fill");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveAttribute("data-width-mode", "fixed");
  await expect(text).toHaveCSS("width", "180px");
});

test("changes vector color and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const vector = page.locator('[data-canvas-root-stack] > [data-vector-id="1"]');
  const path = vector.locator("path");
  await dropSvg(
    page,
    "color-target.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
  );

  const colorHex = page.getByRole("textbox", { name: "Vector color hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(path).toHaveCSS("fill", "rgb(51, 102, 153)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(path).toHaveCSS("fill", "rgb(204, 85, 0)");
});

test("changes vector width and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const vector = page.locator('[data-canvas-root-stack] > [data-vector-id="1"]');
  await dropSvg(
    page,
    "size-target.svg",
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
  );

  const widthInput = page.getByRole("spinbutton", { name: "Vector width" });
  await widthInput.fill("40");
  await widthInput.press("Tab");
  await expect(vector).toHaveCSS("width", "40px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(vector).toHaveCSS("width", "24px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(vector).toHaveCSS("width", "40px");
});

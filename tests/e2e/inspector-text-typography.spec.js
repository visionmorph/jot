const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createTextLayer } = require("../support/inspector-fixtures.cjs");

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

test("accepts Auto line height when typed sequentially", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Auto line height target");
  const lineHeightInput = page.locator("#text-line-height");

  await lineHeightInput.click();
  await lineHeightInput.pressSequentially("Auto");
  await expect(lineHeightInput).toHaveValue("Auto");
  await expect(text).toHaveAttribute("data-line-height", "Auto");
  await expect(text).toHaveCSS("line-height", "normal");
});

test("lets line height shrink a hug text layer below the default height", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Compact line height");
  const lineHeightInput = page.locator("#text-line-height");

  await lineHeightInput.fill("12");
  await lineHeightInput.press("Tab");
  await expect(text).toHaveCSS("line-height", "12px");
  await expect.poll(async () => Math.round((await text.boundingBox()).height)).toBe(12);
  await expect(page.locator(".component-variant-size-label")).toContainText("x 12 Hug");
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


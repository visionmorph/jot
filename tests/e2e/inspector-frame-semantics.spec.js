const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createGroupedColorFixture } = require("../support/test-fixtures.cjs");

test("changes the frame HTML tag and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "button", exact: true }).click();
  await expect(component).toHaveAttribute("data-html-tag", "button");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).toHaveAttribute("data-html-tag", "div");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("data-html-tag", "button");
});

test("authors a tab list semantic element and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "Tab list", exact: true }).click();
  await expect(component).toHaveAttribute("data-html-tag", "div");
  await expect(component).toHaveAttribute("role", "tablist");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).not.toHaveAttribute("role", "tablist");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("role", "tablist");
});

test("authors a tab panel semantic element and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "Tab panel", exact: true }).click();
  await expect(component).toHaveAttribute("data-html-tag", "div");
  await expect(component).toHaveAttribute("role", "tabpanel");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(component).not.toHaveAttribute("role", "tabpanel");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(component).toHaveAttribute("role", "tabpanel");
});

test("changes the frame HTML tag to input", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "input", exact: true }).click();

  await expect(component).toHaveAttribute("data-html-tag", "input");
});

test("changes the frame HTML tag to anchor", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "a", exact: true }).click();

  await expect(page.locator("#frame-html-tag")).toHaveAttribute("data-value", "a");
  await expect.poll(() => page.evaluate(() => currentComponent.frameRecord.element.dataset.htmlTag)).toBe("a");
});

test("changes the frame HTML tag to label", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Open semantic element options" }).click();
  await page.getByRole("option", { name: "label", exact: true }).click();

  await expect(component).toHaveAttribute("data-html-tag", "label");
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

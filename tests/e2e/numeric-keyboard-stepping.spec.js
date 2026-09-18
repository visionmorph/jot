const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { createTextLayer } = require("../support/inspector-fixtures.cjs");

test("steps frame numeric fields with arrow keys and Shift", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const width = page.getByRole("combobox", { name: "Frame width" });
  const gap = page.locator("#frame-gap");
  const radius = page.getByRole("spinbutton", { name: "Radius" });
  const horizontalPadding = page.getByRole("textbox", { name: "Horizontal padding" });

  await width.fill("100");
  await width.press("ArrowUp");
  await expect(component).toHaveCSS("width", "101px");
  await width.press("Shift+ArrowDown");
  await expect(component).toHaveCSS("width", "91px");

  await gap.fill("10px");
  await gap.press("Shift+ArrowUp");
  await expect(component).toHaveCSS("gap", "20px");
  await expect(page.locator("#frame-gap-menu")).toBeHidden();
  await gap.fill("0px");
  await gap.press("Shift+ArrowDown");
  await expect(gap).toHaveValue("0px");
  await expect(component).toHaveCSS("gap", "0px");

  await radius.fill("8");
  await radius.press("ArrowDown");
  await expect(component).toHaveCSS("border-radius", "7px");

  await horizontalPadding.fill("12, 16");
  await horizontalPadding.press("Shift+ArrowUp");
  await expect(component).toHaveCSS("padding-left", "22px");
  await expect(component).toHaveCSS("padding-right", "26px");
});

test("steps typography and opacity fields with arrow keys and Shift", async ({ page }) => {
  await openApp(page);

  const text = await createTextLayer(page, "Keyboard stepping");
  const size = page.locator("#text-size");
  const lineHeight = page.locator("#text-line-height");
  const letterSpacing = page.locator("#text-letter-spacing");
  const opacity = page.getByRole("textbox", { name: "Text color opacity" });

  await size.fill("14");
  await size.press("ArrowUp");
  await expect(text).toHaveCSS("font-size", "15px");

  await lineHeight.fill("20");
  await lineHeight.press("Shift+ArrowUp");
  await expect(text).toHaveCSS("line-height", "30px");

  await letterSpacing.fill("2px");
  await letterSpacing.press("Shift+ArrowDown");
  await expect(text).toHaveCSS("letter-spacing", "-8px");

  await opacity.fill("50");
  await opacity.press("ArrowUp");
  await expect(text).toHaveAttribute("data-text-color-opacity", "51");
  await opacity.press("Shift+ArrowDown");
  await expect(text).toHaveAttribute("data-text-color-opacity", "41");
});

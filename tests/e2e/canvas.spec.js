const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("creates, selects, undoes, and redoes a frame", async ({ page }) => {
  await openApp(page);

  const selectTool = page.getByRole("button", { name: "Select", exact: true });
  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const frame = component.locator(':scope > [data-frame-id="1"]');
  const frameTreeItem = page.locator('[data-selection-layer-key="frame:1"]');

  await frameTool.click();
  await expect(frameTool).toHaveAttribute("aria-pressed", "true");

  await component.click({ position: { x: 50, y: 50 } });

  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("aria-selected", "true");
  await expect(frame).toHaveCSS("width", "100px");
  await expect(frame).toHaveCSS("height", "100px");
  await expect(frameTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Frame", exact: true })).toBeVisible();
  await expect(selectTool).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frame).toHaveCount(0);
  await expect(frameTreeItem).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("aria-selected", "true");
  await expect(frameTreeItem).toHaveAttribute("aria-selected", "true");
});

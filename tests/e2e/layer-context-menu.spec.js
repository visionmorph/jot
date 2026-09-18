const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("layer context menu shows actions and shortcuts in the requested order", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => createCanvasFrame(0, 0, currentComponent.frameRecord));
  const layer = page.locator(".tree-node[data-selection-layer-key]").first();
  await layer.click({ button: "right" });

  const menu = page.locator(".layer-context-menu");
  await expect(menu).toBeVisible();
  await expect(menu.locator(".layer-context-menu__item:focus")).toHaveCount(0);
  await expect(menu.locator(".layer-context-menu__item")).toHaveText([
    /Copy.*Ctrl\+C/,
    /Paste.*Ctrl\+V/,
    /Duplicate.*Ctrl\+D/,
    /Bring to front.*\]/,
    /Send to back.*\[/,
    /Delete.*Delete/,
  ]);
  await expect(menu.locator('[data-context-action="paste"]')).toBeDisabled();
  const typography = await menu.locator('[data-context-action="copy"] span').evaluateAll((elements) => (
    elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.fontSize, style.lineHeight];
    })
  ));
  expect(typography).toEqual([["14px", "16px"], ["14px", "16px"]]);
});

test("custom menu replaces the native menu anywhere on the canvas", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.lastContextMenuWasPrevented = false;
    document.addEventListener("contextmenu", (event) => {
      window.lastContextMenuWasPrevented = event.defaultPrevented;
    });
  });

  await page.locator("#canvas").click({ button: "right", position: { x: 8, y: 8 } });
  await expect(page.locator(".layer-context-menu")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.lastContextMenuWasPrevented)).toBe(true);
});

test("context-menu copy enables paste and duplicate creates a layer", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => createCanvasFrame(0, 0, currentComponent.frameRecord));
  const layer = page.locator(".tree-node[data-selection-layer-key]").last();
  const initialCount = await page.locator(".tree-node[data-selection-layer-key]").count();

  await layer.click({ button: "right" });
  await page.locator('[data-context-action="copy"]').click();
  await layer.click({ button: "right" });
  await expect(page.locator('[data-context-action="paste"]')).toBeEnabled();
  await page.locator('[data-context-action="duplicate"]').click();
  await expect(page.locator(".tree-node[data-selection-layer-key]")).toHaveCount(initialCount + 1);
});

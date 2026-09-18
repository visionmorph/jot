const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { dropSvg } = require("../support/test-fixtures.cjs");
test("imports, selects, undoes, and redoes an SVG vector", async ({ page }) => {
  await openApp(page);

  const vector = page.locator('[data-canvas-root-stack] > [data-vector-id="1"]');
  const vectorTreeItem = page.locator('[data-selection-layer-key="vector:1"]');
  const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="20" viewBox="0 0 32 20"><path d="M2 2h28v16H2z" fill="#336699"/></svg>';

  await dropSvg(page, "status-icon.svg", svgSource);

  await expect(vector).toBeVisible();
  await expect(vector).toHaveAttribute("aria-label", "status-icon");
  await expect(vector).toHaveAttribute("aria-selected", "true");
  await expect(vector).toHaveCSS("width", "32px");
  await expect(vector).toHaveCSS("height", "20px");
  await expect(vector.locator("svg path")).toHaveAttribute("fill", "#336699");
  await expect(vectorTreeItem).toContainText("status-icon");
  await expect(vectorTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Vector", exact: true })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+z");
  await expect(vector).toHaveCount(0);
  await expect(vectorTreeItem).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(vector).toBeVisible();
  await expect(vector.locator("svg path")).toHaveAttribute("fill", "#336699");
  await expect(vectorTreeItem).toHaveAttribute("aria-selected", "true");
});

test("sanitizes unsafe content when importing an SVG", async ({ page }) => {
  await openApp(page);

  const vector = page.locator('[data-canvas-root-stack] > [data-vector-id="1"]');
  const unsafeSvg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24">',
    '<style>@import url("https://example.com/unsafe.css");</style>',
    '<script>window.__unsafeSvgExecuted = true</script>',
    '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">Unsafe</div></foreignObject>',
    '<image href="https://example.com/tracker.png" width="24" height="24"/>',
    '<a href="https://example.com"><path id="safe-path" d="M2 2h20v20H2z" fill="#663399" onclick="window.__unsafeSvgExecuted = true"/></a>',
    '</svg>',
  ].join("");

  await dropSvg(page, "unsafe.svg", unsafeSvg);

  await expect(vector).toBeVisible();
  await expect(vector.locator("#safe-path")).toHaveAttribute("fill", "#663399");
  await expect(vector.locator("script, foreignObject, image, style")).toHaveCount(0);
  await expect(vector.locator("[onclick], [href], [xlink\\:href]")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__unsafeSvgExecuted === true)).toBe(false);
});


const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { dropSvg } = require("../support/test-fixtures.cjs");
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

test("bulk edits selected vector dimensions and colors", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const definitions = [
      { name: "Red", width: 24, height: 24, color: "#CC0000" },
      { name: "Green", width: 36, height: 40, color: "#00AA00" },
      { name: "Purple", width: 48, height: 52, color: "#663399" },
    ];
    definitions.forEach((definition) => createCanvasVector({
      name: definition.name,
      width: definition.width,
      height: definition.height,
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="${definition.width}" height="${definition.height}"><path d="M2 2h20v20H2z" fill="${definition.color}"/></svg>`,
    }, 0, 0, currentComponent.frameRecord, { select: false }));
  });

  const inspector = page.locator("[data-vector-inspector]");
  const vectors = page.locator("[data-canvas-root-stack] > [data-vector-id]");
  const paths = vectors.locator("path");
  const width = page.getByRole("spinbutton", { name: "Vector width" });
  const height = page.getByRole("spinbutton", { name: "Vector height" });
  const selectionColors = inspector.locator(":scope > [data-selection-colors]");

  await vectors.nth(0).click();
  await vectors.nth(1).click({ modifiers: ["Shift"] });

  await expect(inspector.getByRole("heading", { name: "Vectors", exact: true })).toBeVisible();
  await expect(width).toHaveValue("");
  await expect(width).toHaveAttribute("placeholder", "Mixed");
  await expect(height).toHaveValue("");
  await expect(height).toHaveAttribute("placeholder", "Mixed");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);
  await expect(inspector.locator(":scope > [data-paint-section]")).toBeHidden();

  const firstColor = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await firstColor.fill("EE4400");
  await firstColor.press("Enter");
  await expect(paths.nth(0)).toHaveCSS("fill", "rgb(238, 68, 0)");
  await expect(paths.nth(1)).toHaveCSS("fill", "rgb(0, 170, 0)");
  await expect(paths.nth(2)).toHaveCSS("fill", "rgb(102, 51, 153)");

  const secondColor = selectionColors.getByRole("textbox", { name: "Selection color 2 hex value" });
  await secondColor.fill("EE4400");
  await secondColor.press("Enter");
  await expect(selectionColors).toBeHidden();
  await expect(inspector.locator(":scope > [data-paint-section]")).toBeVisible();

  const color = page.getByRole("textbox", { name: "Vector color hex value" });
  const opacity = page.getByRole("textbox", { name: "Vector color opacity" });
  await color.fill("336699");
  await opacity.fill("50");
  await width.fill("60");
  await width.press("Tab");
  await height.fill("70");
  await height.press("Tab");

  for (let index = 0; index < 2; index += 1) {
    await expect(vectors.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(vectors.nth(index)).toHaveCSS("width", "60px");
    await expect(vectors.nth(index)).toHaveCSS("height", "70px");
    await expect(paths.nth(index)).toHaveCSS("fill", "rgba(51, 102, 153, 0.5)");
  }
  await expect(vectors.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(vectors.nth(2)).toHaveCSS("width", "48px");
  await expect(vectors.nth(2)).toHaveCSS("height", "52px");
  await expect(paths.nth(2)).toHaveCSS("fill", "rgb(102, 51, 153)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(vectors.nth(0)).toHaveCSS("height", "24px");
  await expect(vectors.nth(1)).toHaveCSS("height", "40px");
  await expect(vectors.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(vectors.nth(1)).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(vectors.nth(0)).toHaveCSS("height", "70px");
  await expect(vectors.nth(1)).toHaveCSS("height", "70px");
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


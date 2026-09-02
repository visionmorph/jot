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

test("changes text color and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await text.fill("Color target");
  await text.press("Escape");

  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");
  await expect(text).toHaveCSS("color", "rgb(122, 62, 157)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCSS("color", "rgb(0, 0, 0)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveCSS("color", "rgb(122, 62, 157)");
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

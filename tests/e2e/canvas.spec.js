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

test("duplicates a selected frame and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const frames = component.locator(":scope > [data-frame-id]");
  const originalFrame = component.locator(':scope > [data-frame-id="1"]');
  const duplicateFrame = component.locator(':scope > [data-frame-id="2"]');
  const duplicateTreeItem = page.locator('[data-selection-layer-key="frame:2"]');

  await frameTool.click();
  await component.click({ position: { x: 50, y: 50 } });
  await expect(originalFrame).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+d");

  await expect(frames).toHaveCount(2);
  await expect(originalFrame).toHaveAttribute("aria-selected", "false");
  await expect(duplicateFrame).toHaveAttribute("aria-selected", "true");
  await expect(duplicateFrame).toHaveCSS("width", "100px");
  await expect(duplicateFrame).toHaveCSS("height", "100px");
  await expect(duplicateTreeItem).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames).toHaveCount(1);
  await expect(duplicateTreeItem).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames).toHaveCount(2);
  await expect(duplicateFrame).toHaveAttribute("aria-selected", "true");
  await expect(duplicateTreeItem).toHaveAttribute("aria-selected", "true");
});

test("creates and edits a text layer", async ({ page }) => {
  await openApp(page);

  const selectTool = page.getByRole("button", { name: "Select", exact: true });
  const textTool = page.getByRole("button", { name: "Text", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  const textTreeItem = page.locator('[data-selection-layer-key="text:1"]');

  await textTool.click();
  await expect(textTool).toHaveAttribute("aria-pressed", "true");
  await component.click({ position: { x: 50, y: 50 } });

  await expect(text).toHaveAttribute("contenteditable", "true");
  await text.fill("Button label");
  await text.press("Escape");

  await expect(text).toHaveText("Button label");
  await expect(text).toHaveAttribute("contenteditable", "false");
  await expect(text).toHaveAttribute("aria-selected", "true");
  await expect(textTreeItem).toContainText("Button label");
  await expect(textTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("region", { name: "Text", exact: true })).toBeVisible();
  await expect(selectTool).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(text).toHaveCount(0);
  await expect(textTreeItem).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toHaveText("Button label");
  await expect(textTreeItem).toContainText("Button label");
});

test("creates a frame nested inside another frame", async ({ page }) => {
  await openApp(page);

  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const parentFrame = component.locator(':scope > [data-frame-id="1"]');
  const childFrame = parentFrame.locator(':scope > [data-frame-id="2"]');
  const parentTreeItem = page.locator('[data-selection-layer-key="frame:1"]');
  const childTreeItem = page.locator('[data-selection-layer-key="frame:2"]');

  await frameTool.click();
  await component.click({ position: { x: 50, y: 50 } });
  await expect(parentFrame).toBeVisible();

  await frameTool.click();
  await parentFrame.click({ position: { x: 50, y: 50 } });

  await expect(childFrame).toBeVisible();
  await expect(childFrame).toHaveAttribute("aria-selected", "true");
  await expect(parentTreeItem).toHaveAttribute("aria-expanded", "true");
  await expect(childTreeItem).toHaveAttribute("aria-level", "3");
  await expect(childTreeItem).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(childFrame).toHaveCount(0);
  await expect(childTreeItem).toHaveCount(0);
  await expect(parentFrame).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(childFrame).toBeVisible();
  await expect(childTreeItem).toHaveAttribute("aria-selected", "true");
});

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

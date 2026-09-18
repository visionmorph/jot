const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
test("multi-selects canvas layers and clears the selection from the canvas", async ({ page }) => {
  await openApp(page);

  const canvas = page.getByRole("region", { name: "Canvas" });
  const component = page.locator("[data-canvas-root-stack]");
  const firstFrame = component.locator(':scope > [data-frame-id="1"]');
  const secondFrame = component.locator(':scope > [data-frame-id="2"]');

  await page.evaluate(() => {
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    createCanvasFrame(0, 0, currentComponent.frameRecord);
  });

  await firstFrame.click();
  await secondFrame.click({ modifiers: ["Shift"] });
  await expect(firstFrame).toHaveAttribute("aria-selected", "true");
  await expect(secondFrame).toHaveAttribute("aria-selected", "true");

  await canvas.click({ position: { x: 20, y: 20 } });
  await expect(firstFrame).toHaveAttribute("aria-selected", "false");
  await expect(secondFrame).toHaveAttribute("aria-selected", "false");
});

test("shows the bounding-box size for a multi-selection", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const firstFrame = component.locator(':scope > [data-frame-id="1"]');
  const secondFrame = component.locator(':scope > [data-frame-id="2"]');
  const sizeLabel = page.locator(".component-variant-size-label");

  await page.evaluate(() => {
    currentComponent.frameRecord.element.style.gap = "32px";
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord);
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord);
    [first.element, second.element].forEach((element) => {
      element.style.width = "32px";
      element.style.height = "32px";
    });
  });

  await firstFrame.click();
  await secondFrame.click({ modifiers: ["Shift"] });
  await expect(sizeLabel).toHaveText("96 x 32");

  await page.evaluate(() => {
    const first = currentComponent.frameRecord.element.querySelector('[data-frame-id="1"]');
    first.style.width = "64px";
    first.style.height = "64px";
    syncVariantActionOverlay();
  });
  await expect(sizeLabel).toHaveText("128 x 64");
});

test("selects a text layer with a marquee drag", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');

  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Marquee target",
    });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const componentBounds = await component.boundingBox();
  const textBounds = await text.boundingBox();
  expect(componentBounds).not.toBeNull();
  expect(textBounds).not.toBeNull();

  await page.keyboard.down("Control");
  await page.mouse.move(componentBounds.x - 6, textBounds.y - 2);
  await page.mouse.down();
  await page.mouse.move(textBounds.x + textBounds.width + 2, textBounds.y + textBounds.height + 2, {
    steps: 8,
  });
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(text).toHaveAttribute("aria-selected", "true");
});

test("standard marquee selects a component on partial overlap", async ({ page }) => {
  await openApp(page);
  const component = page.locator("[data-canvas-root-stack]");
  const bounds = await component.boundingBox();

  await page.mouse.move(bounds.x - 8, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2 + 8, { steps: 4 });
  await page.mouse.up();

  await expect(component).toHaveAttribute("aria-selected", "true");
});

test("marquee-selects multiple SVG layers", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const vectors = component.locator(":scope > [data-vector-id]");
  await page.evaluate(() => {
    ["#336699", "#cc5500"].forEach((color, index) => {
      createCanvasVector({
        name: `Vector ${index + 1}`,
        width: 24,
        height: 24,
        source: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="${color}"/></svg>`,
      }, 0, 0, currentComponent.frameRecord, { select: false });
    });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const componentBounds = await component.boundingBox();
  const firstBounds = await vectors.nth(0).boundingBox();
  const secondBounds = await vectors.nth(1).boundingBox();
  await page.keyboard.down("Control");
  await page.mouse.move(componentBounds.x - 6, Math.min(firstBounds.y, secondBounds.y) - 2);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(firstBounds.x + firstBounds.width, secondBounds.x + secondBounds.width) + 2,
    Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(vectors.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(vectors.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("[data-vector-inspector]").getByRole("heading", { name: "Vectors" })).toBeVisible();
});

test("Ctrl-marquee inside a component selects only its children", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Child text",
    });
    createCanvasVector({
      name: "Child vector",
      width: 24,
      height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    selectCanvasState();
    syncElementSelectionStyles();
  });

  const component = page.locator("[data-canvas-root-stack]");
  const text = component.locator(':scope > [data-text-id="1"]');
  const vector = component.locator(':scope > [data-vector-id="1"]');
  const componentBounds = await component.boundingBox();
  const textBounds = await text.boundingBox();
  const vectorBounds = await vector.boundingBox();

  await page.keyboard.down("Control");
  await page.mouse.move(componentBounds.x + 4, componentBounds.y + 4);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(textBounds.x + textBounds.width, vectorBounds.x + vectorBounds.width) + 2,
    Math.max(textBounds.y + textBounds.height, vectorBounds.y + vectorBounds.height) + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(component).toHaveAttribute("aria-selected", "false");
  await expect(text).toHaveAttribute("aria-selected", "true");
  await expect(vector).toHaveAttribute("aria-selected", "true");

  await page.evaluate(() => {
    selectCanvasState();
    syncElementSelectionStyles();
  });
  await page.keyboard.down("Control");
  await page.mouse.move(componentBounds.x - 6, componentBounds.y - 6);
  await page.mouse.down();
  await page.mouse.move(
    componentBounds.x + componentBounds.width + 2,
    componentBounds.y + componentBounds.height + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(component).toHaveAttribute("aria-selected", "true");
  await expect(text).toHaveAttribute("aria-selected", "false");
  await expect(vector).toHaveAttribute("aria-selected", "false");
});


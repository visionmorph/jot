const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
test("changes selected frame opacity with a number shortcut", async ({ page }) => {
  await openApp(page);

  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const frame = component.locator(':scope > [data-frame-id="1"]');

  await frameTool.click();
  await component.click({ position: { x: 50, y: 50 } });
  await page.keyboard.press("5");

  await expect(frame).toHaveAttribute("data-opacity", "50");
  await expect(frame).toHaveCSS("opacity", "0.5");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frame).not.toHaveAttribute("data-opacity", "50");
  await expect(frame).toHaveCSS("opacity", "1");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frame).toHaveCSS("opacity", "0.5");
});

test("selects an unselected frame at its edge before enabling resize", async ({ page }) => {
  await openApp(page);
  const component = page.locator("[data-canvas-root-stack]");
  const frame = component.locator(':scope > [data-frame-id="1"]');
  await page.getByRole("button", { name: "Frame", exact: true }).click();
  await component.click({ position: { x: 50, y: 50 } });
  await page.getByRole("region", { name: "Canvas" }).click({ position: { x: 20, y: 20 } });
  await expect(frame).toHaveAttribute("aria-selected", "false");
  await expect(page.locator(".resize-overlay")).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    resolveCanvasHit(document.querySelector('[data-resize-handle="e"]')).kind,
  )).not.toBe("resize-control");
  await expect(page.locator('[data-padding-handle="left"]')).toBeHidden();
  await expect.poll(() => page.evaluate(() =>
    resolveCanvasHit(document.querySelector('[data-padding-handle="left"]')).kind,
  )).not.toBe("resize-control");

  const bounds = await frame.boundingBox();
  await page.mouse.click(bounds.x + bounds.width - 1, bounds.y + bounds.height / 2);
  await expect(frame).toHaveAttribute("aria-selected", "true");
  await expect(frame).toHaveCSS("width", "100px");
  await expect(frame).toHaveCSS("height", "100px");
  await expect(page.locator(".resize-overlay")).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    resolveCanvasHit(document.querySelector('[data-resize-handle="e"]')).kind,
  )).toBe("resize-control");
  await expect(page.locator('[data-padding-handle="left"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    resolveCanvasHit(document.querySelector('[data-padding-handle="left"]')).kind,
  )).toBe("resize-control");
});

test("resizes a selected frame with a canvas handle", async ({ page }) => {
  await openApp(page);

  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const frame = component.locator(':scope > [data-frame-id="1"]');
  const southeastHandle = page.locator('[data-resize-handle="se"]');
  const widthInput = page.getByRole("combobox", { name: "Frame width" });
  const heightInput = page.getByRole("combobox", { name: "Frame height" });

  await frameTool.click();
  await component.click({ position: { x: 50, y: 50 } });
  await expect(southeastHandle).toBeVisible();

  const handleBounds = await southeastHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  const startX = handleBounds.x + handleBounds.width / 2;
  const startY = handleBounds.y + handleBounds.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 30, { steps: 5 });
  await page.mouse.up();

  await expect(frame).toHaveCSS("width", "140px");
  await expect(frame).toHaveCSS("height", "130px");
  await expect(widthInput).toHaveValue("140");
  await expect(heightInput).toHaveValue("130");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frame).toHaveCSS("width", "100px");
  await expect(frame).toHaveCSS("height", "100px");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frame).toHaveCSS("width", "140px");
  await expect(frame).toHaveCSS("height", "130px");
});

test("positions and drags frame padding handles", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord);
    ["Left", "Top", "Right", "Bottom"].forEach((side) => {
      frame.element.dataset[`padding${side}`] = "16";
      frame.element.style[`padding${side}`] = "16px";
    });
    syncResizeOverlay();
  });

  const frame = page.locator('[data-frame-id="1"]');
  const leftHandle = page.locator('[data-padding-handle="left"]');
  const topHandle = page.locator('[data-padding-handle="top"]');
  const frameBounds = await frame.boundingBox();
  const leftBounds = await leftHandle.boundingBox();
  const topBounds = await topHandle.boundingBox();
  expect(leftBounds.width).toBe(6);
  expect(leftBounds.height).toBe(12);
  expect(topBounds.width).toBe(12);
  expect(topBounds.height).toBe(6);
  expect(leftBounds.x + leftBounds.width / 2 - frameBounds.x).toBe(8);
  expect(topBounds.y + topBounds.height / 2 - frameBounds.y).toBe(8);
  await leftHandle.hover();
  await expect(leftHandle.locator(".canvas-spacing-tooltip")).toHaveText("16");
  await expect(leftHandle.locator(".canvas-spacing-tooltip")).toBeVisible();
  const hoveredLeftBounds = await leftHandle.boundingBox();
  await page.mouse.move(hoveredLeftBounds.x + 4, hoveredLeftBounds.y + 7);
  await expect.poll(async () => {
    const tooltipBounds = await leftHandle.locator(".canvas-spacing-tooltip").boundingBox();
    return Math.abs(tooltipBounds.x + tooltipBounds.width / 2 - (hoveredLeftBounds.x + 4));
  }).toBeLessThan(0.6);

  await page.mouse.move(leftBounds.x + 1, leftBounds.y + 6);
  await page.mouse.down();
  await page.mouse.move(leftBounds.x + 5, leftBounds.y + 6, { steps: 4 });
  await expect.poll(async () => {
    const liveFrameBounds = await frame.boundingBox();
    const liveHandleBounds = await leftHandle.boundingBox();
    return liveHandleBounds.x + liveHandleBounds.width / 2 - liveFrameBounds.x;
  }).toBe(10);
  await page.mouse.up();
  await expect(frame).toHaveCSS("padding-left", "20px");

  const movedLeftBounds = await leftHandle.boundingBox();
  await page.keyboard.down("Alt");
  await page.mouse.move(movedLeftBounds.x + 3, movedLeftBounds.y + 6);
  await page.mouse.down();
  await page.mouse.move(movedLeftBounds.x + 9, movedLeftBounds.y + 6);
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(frame).toHaveCSS("padding-left", "30px");

  await page.evaluate(() => {
    const record = getFrameRecord(1);
    ["Left", "Top", "Right", "Bottom"].forEach((side) => {
      record.element.dataset[`padding${side}`] = "0";
      record.element.style[`padding${side}`] = "0px";
    });
    syncResizeOverlay();
  });
  const zeroFrameBounds = await frame.boundingBox();
  const zeroLeftBounds = await leftHandle.boundingBox();
  const zeroTopBounds = await topHandle.boundingBox();
  const rightHandleBounds = await page.locator('[data-padding-handle="right"]').boundingBox();
  const bottomHandleBounds = await page.locator('[data-padding-handle="bottom"]').boundingBox();
  expect(zeroLeftBounds.x + zeroLeftBounds.width / 2).toBe(zeroFrameBounds.x - 1);
  expect(zeroTopBounds.y + zeroTopBounds.height / 2).toBe(zeroFrameBounds.y - 1);
  expect(rightHandleBounds.x + rightHandleBounds.width / 2).toBe(zeroFrameBounds.x + zeroFrameBounds.width + 1);
  expect(bottomHandleBounds.y + bottomHandleBounds.height / 2).toBe(zeroFrameBounds.y + zeroFrameBounds.height + 1);
});

test("shows one draggable gap handle between each pair of frame children", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord);
    frame.element.style.gap = "20px";
    frame.element.dataset.gap = "20";
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "One" });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Two" });
    selectCanvasFrame(frame.element);
    syncElementSelectionStyles();
    syncResizeOverlay();
  });

  const frame = page.locator('[data-frame-id="1"]');
  const texts = frame.locator(":scope > [data-text-id]");
  const gapHandle = page.locator('[data-gap-handle="horizontal"]');
  await expect(gapHandle).toHaveCount(1);
  const firstBounds = await texts.nth(0).boundingBox();
  const secondBounds = await texts.nth(1).boundingBox();
  const handleBounds = await gapHandle.boundingBox();
  expect(handleBounds.width).toBe(6);
  expect(handleBounds.height).toBe(12);
  expect(handleBounds.x + handleBounds.width / 2).toBe((firstBounds.x + firstBounds.width + secondBounds.x) / 2);
  await gapHandle.hover();
  await expect(gapHandle.locator(".canvas-spacing-tooltip")).toHaveText("20");

  await page.mouse.move(handleBounds.x + 3, handleBounds.y + 6);
  await page.mouse.down();
  await page.mouse.move(handleBounds.x + 6, handleBounds.y + 6, { steps: 3 });
  await expect(frame).toHaveCSS("gap", "23px");
  await expect.poll(async () => {
    const liveFirstBounds = await texts.nth(0).boundingBox();
    const liveSecondBounds = await texts.nth(1).boundingBox();
    const liveHandleBounds = await gapHandle.boundingBox();
    const handleCenter = liveHandleBounds.x + liveHandleBounds.width / 2;
    const gapCenter = (liveFirstBounds.x + liveFirstBounds.width + liveSecondBounds.x) / 2;
    return Math.abs(handleCenter - gapCenter);
  }).toBeLessThan(0.6);
  await page.mouse.move(handleBounds.x + 8, handleBounds.y + 6, { steps: 5 });
  await page.mouse.up();
  await expect(frame).toHaveCSS("gap", "25px");

  const movedHandleBounds = await gapHandle.boundingBox();
  await page.keyboard.down("Alt");
  await page.mouse.move(movedHandleBounds.x + 3, movedHandleBounds.y + 6);
  await page.mouse.down();
  await page.mouse.move(movedHandleBounds.x + 9, movedHandleBounds.y + 6, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect(frame).toHaveCSS("gap", "35px");
});

test("shows horizontal gap handles for every adjacent pair in a vertical frame", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord);
    frame.element.style.flexDirection = "column";
    frame.element.dataset.direction = "vertical";
    ["One", "Two", "Three"].forEach((textContent) => {
      createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent });
    });
    selectCanvasFrame(frame.element);
    syncElementSelectionStyles();
    syncResizeOverlay();
  });

  const handles = page.locator('[data-gap-handle="vertical"]');
  await expect(handles).toHaveCount(2);
  const bounds = await handles.first().boundingBox();
  expect(bounds.width).toBe(12);
  expect(bounds.height).toBe(6);
});


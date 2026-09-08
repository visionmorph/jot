const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("starts new text with an empty caret", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await component.click({ position: { x: 40, y: 40 } });

  const text = component.locator(":scope > .canvas-text");
  await expect(text).toHaveCount(1);
  await expect(text).toBeFocused();
  await expect(text).toHaveText("");
  await expect.poll(() => text.evaluate((element) => {
    const selection = window.getSelection();
    return selection?.isCollapsed === true && element.contains(selection.anchorNode);
  })).toBe(true);
});

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

async function dragLayer(page, source, target, position = { x: 0.5, y: 0.5 }) {
  const sourceBounds = await source.boundingBox();
  const targetBounds = await target.boundingBox();
  expect(sourceBounds).not.toBeNull();
  expect(targetBounds).not.toBeNull();

  await page.mouse.move(
    sourceBounds.x + sourceBounds.width / 2,
    sourceBounds.y + sourceBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBounds.x + targetBounds.width * position.x,
    targetBounds.y + targetBounds.height * position.y,
    { steps: 8 },
  );
  await page.mouse.up();
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
  await page.evaluate(() => {
    createCanvasText(getFrameRecord(1), 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Nested label",
    });
    selectCanvasFrame(getFrameRecord(1).element);
  });
  await expect(originalFrame).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+d");

  await expect(frames).toHaveCount(2);
  await expect(originalFrame).toHaveAttribute("aria-selected", "false");
  await expect(duplicateFrame).toHaveAttribute("aria-selected", "true");
  await expect(duplicateFrame).toHaveCSS("width", "100px");
  await expect(duplicateFrame).toHaveCSS("height", "100px");
  await expect(originalFrame.locator(':scope > [data-text-id="1"]')).toHaveText("Nested label");
  await expect(duplicateFrame.locator(':scope > [data-text-id="2"]')).toHaveText("Nested label");
  await expect(duplicateTreeItem).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(frames).toHaveCount(1);
  await expect(duplicateTreeItem).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(frames).toHaveCount(2);
  await expect(duplicateFrame).toHaveAttribute("aria-selected", "true");
  await expect(duplicateTreeItem).toHaveAttribute("aria-selected", "true");
});

test("copies and pastes a frame with its nested text", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Nested label",
    });
    selectCanvasFrame(frame.element);
  });
  await page.locator('[data-frame-id="1"]').focus();
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");

  await expect(page.locator('[data-canvas-root-stack] > [data-frame-id="2"]')).toHaveCount(1);
  await expect(page.locator('[data-frame-id="2"] > [data-text-id="2"]')).toHaveText("Nested label");
});

test("duplicates a text layer with independent color runs", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    const record = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Red black",
    });
    record.element.innerHTML = '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">Red</span> black';
    selectCanvasText(record.element);
    renderTree();
  });

  const texts = page.locator("[data-canvas-root-stack] > [data-text-id]");
  const original = texts.nth(0);
  const duplicate = texts.nth(1);
  await page.keyboard.press("ControlOrMeta+d");

  await expect(texts).toHaveCount(2);
  await expect(duplicate).toHaveText("Red black");
  await expect(duplicate.locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(duplicate.locator('[data-rich-text-color="#FF0000"]')).toHaveCSS("color", "rgb(255, 0, 0)");
  await expect(original.locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(texts).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(texts).toHaveCount(2);
  await expect(duplicate.locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
});

test("wraps selected frames and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const firstTreeItem = page.locator('[data-selection-layer-key="frame:1"]');
  const secondTreeItem = page.locator('[data-selection-layer-key="frame:2"]');
  const wrapper = component.locator(':scope > [data-frame-id="3"]');
  const wrapperTreeItem = page.locator('[data-selection-layer-key="frame:3"]');

  await frameTool.click();
  await component.click({ position: { x: 50, y: 50 } });
  await page.keyboard.press("ControlOrMeta+d");
  await firstTreeItem.click();
  await secondTreeItem.click({ modifiers: ["Control"] });

  await expect(firstTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(secondTreeItem).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Shift+a");

  await expect(wrapper).toBeVisible();
  await expect(wrapper.locator(':scope > [data-frame-id="1"]')).toBeVisible();
  await expect(wrapper.locator(':scope > [data-frame-id="2"]')).toBeVisible();
  await expect(wrapperTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(firstTreeItem).toHaveAttribute("aria-level", "3");
  await expect(secondTreeItem).toHaveAttribute("aria-level", "3");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(wrapper).toHaveCount(0);
  await expect(component.locator(':scope > [data-frame-id="1"]')).toBeVisible();
  await expect(component.locator(':scope > [data-frame-id="2"]')).toBeVisible();

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(wrapper).toBeVisible();
  await expect(wrapperTreeItem).toHaveAttribute("aria-selected", "true");
});

test("reorders a selected frame and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const frameTool = page.getByRole("button", { name: "Frame", exact: true });
  const component = page.locator("[data-canvas-root-stack]");
  const frameOrder = () => component.locator(":scope > [data-frame-id]").evaluateAll(
    (frames) => frames.map((frame) => frame.dataset.frameId),
  );

  await frameTool.click();
  await component.click({ position: { x: 50, y: 50 } });
  await page.keyboard.press("ControlOrMeta+d");
  await expect.poll(frameOrder).toEqual(["1", "2"]);

  await page.keyboard.press("[");
  await expect.poll(frameOrder).toEqual(["2", "1"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(frameOrder).toEqual(["1", "2"]);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(frameOrder).toEqual(["2", "1"]);
});

test("reorders sibling frames with drag and drop", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const firstFrame = component.locator(':scope > [data-frame-id="1"]');
  const secondFrame = component.locator(':scope > [data-frame-id="2"]');
  const frameOrder = () => component.locator(":scope > [data-frame-id]").evaluateAll(
    (frames) => frames.map((frame) => frame.dataset.frameId),
  );

  await page.evaluate(() => {
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    createCanvasFrame(0, 0, currentComponent.frameRecord);
  });
  await expect.poll(frameOrder).toEqual(["1", "2"]);

  await dragLayer(page, secondFrame, firstFrame, { x: 0.1, y: 0.5 });
  await expect.poll(frameOrder).toEqual(["2", "1"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(frameOrder).toEqual(["1", "2"]);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(frameOrder).toEqual(["2", "1"]);
});

test("drags a text layer into a frame and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const component = page.locator("[data-canvas-root-stack]");
  const frame = component.locator(':scope > [data-frame-id="1"]');
  const rootText = component.locator(':scope > [data-text-id="1"]');
  const nestedText = frame.locator(':scope > [data-text-id="1"]');
  const textTreeItem = page.locator('[data-selection-layer-key="text:1"]');

  await page.evaluate(() => {
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Drag me",
    });
  });
  await expect(rootText).toBeVisible();

  await dragLayer(page, rootText, frame);
  await expect(nestedText).toBeVisible();
  await expect(textTreeItem).toHaveAttribute("aria-level", "3");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(rootText).toBeVisible();
  await expect(textTreeItem).toHaveAttribute("aria-level", "2");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(nestedText).toBeVisible();
  await expect(textTreeItem).toHaveAttribute("aria-level", "3");
});

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

  await page.keyboard.press("\\");
  await expect(parentTreeItem).toHaveAttribute("aria-selected", "true");
  await expect(childTreeItem).toHaveAttribute("aria-selected", "false");

  await page.keyboard.press("Enter");
  await expect(childTreeItem).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("Shift+Enter");
  await expect(parentTreeItem).toHaveAttribute("aria-selected", "true");
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

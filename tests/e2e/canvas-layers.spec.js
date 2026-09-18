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

test("lists flex children in the same order they appear on the canvas", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) {
      createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    }
    renderTree();
  });

  const treeLabels = page.locator('[data-selection-layer-key^="frame:"] .tree-node-label');
  await expect(treeLabels).toHaveText(["Frame 1", "Frame 2", "Frame 3", "Frame 4", "Frame 5"]);

  const frames = page.locator("[data-canvas-root-stack] > .canvas-frame");
  const horizontalPositions = await frames.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().left));
  expect(horizontalPositions).toEqual([...horizontalPositions].sort((a, b) => a - b));

  await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.direction = "vertical";
    currentComponent.frameRecord.element.style.flexDirection = "column";
  });
  const verticalPositions = await frames.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().top));
  expect(verticalPositions).toEqual([...verticalPositions].sort((a, b) => a - b));
});

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

test("names new frames sequentially from existing frame names", async ({ page }) => {
  await openApp(page);
  const names = await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    deleteLayers([{ type: "frame", id: first.id }, { type: "frame", id: second.id }]);
    const replacement = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const next = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    return {
      ids: [replacement.id, next.id],
      names: [replacement.name, next.name],
      labels: [replacement.element.getAttribute("aria-label"), next.element.getAttribute("aria-label")],
    };
  });

  expect(names).toEqual({
    ids: [3, 4],
    names: ["Frame 1", "Frame 2"],
    labels: ["Frame 1", "Frame 2"],
  });
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

test("shows sibling layers in canvas layout order", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    createCanvasFrame(0, 0, currentComponent.frameRecord);
  });
  const treeOrder = () => page.locator(
    '.tree-node[data-selection-layer-key^="frame:"]',
  ).evaluateAll((nodes) => nodes.map((node) => node.dataset.selectionLayerKey));

  await expect.poll(treeOrder).toEqual(["frame:1", "frame:2"]);
  await page.locator('[data-selection-layer-key="frame:1"]').click();
  await page.keyboard.press("]");
  await expect.poll(treeOrder).toEqual(["frame:2", "frame:1"]);
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

const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("duplicating four variant roots matches paste without nesting layers", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Button" });
    for (let index = 0; index < 3; index += 1) addVariantInstance();
    variantModel.getInstances().forEach((instance, index) => {
      upsertLocalVariantOverride(instance, `text:1`, "color", ["#ff0000", "#00ff00", "#0000ff", "#ffffff"][index]);
    });
    selectVariantInstancesState(variantModel.getInstances().map((instance) => instance.id));
    renderTree();
  });
  await page.locator(".variant-preview").first().focus();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+d");
  await expect(page.locator(".variant-preview")).toHaveCount(8);
  await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(4);
  await expect(page.locator(".variant-preview .variant-preview")).toHaveCount(0);
  await expect(page.locator(".variant-preview .canvas-frame .canvas-frame")).toHaveCount(0);
  await expect(page.locator(".variant-preview .canvas-frame > .canvas-text")).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => [frameRecords.length, textRecords.length])).toEqual([1, 1]);
  const duplicated = await page.evaluate(() => structuredClone(variantModel.getInstances().slice(4)));
  await page.keyboard.press("Control+z");
  await expect(page.locator(".variant-preview")).toHaveCount(4);
  await page.keyboard.press("Control+v");
  await expect(page.locator(".variant-preview")).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => variantModel.getInstances().slice(4))).toEqual(duplicated);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".variant-preview")).toHaveCount(4);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".variant-preview")).toHaveCount(8);
});

for (const action of ["duplicate", "paste"]) {
  test(`${action} creates variants from the original component`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      createCanvasText(currentComponent.frameRecord, 0, 0, {
        beginEditing: false, isNew: false, textContent: "Original content",
      });
      selectComponentState(currentComponent.id);
      renderTree();
    });
    await page.locator("[data-selection-component-id]").first().focus();
    await expect(page.locator(".variant-preview")).toHaveCount(0);
    if (action === "paste") {
      await page.keyboard.press("Control+c");
      await expect(page.locator(".variant-preview")).toHaveCount(0);
      await page.keyboard.press("Control+v");
    } else {
      await page.keyboard.press("Control+d");
    }
    await expect(page.locator(".variant-preview")).toHaveCount(2);
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(1);
    for (const preview of await page.locator(".variant-preview").all()) {
      await expect(preview.locator(".canvas-text")).toHaveText("Original content");
    }
    await page.keyboard.press("Control+z");
    await expect(page.locator(".variant-preview")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => selectionState.kind)).toBe("component");
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".variant-preview")).toHaveCount(2);
  });
}

for (const count of [1, 2]) {
  test(`copies and pastes ${count} variants with keyboard shortcuts`, async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Add variant preview" }).click();
    await page.evaluate((count) => {
      const instances = variantModel.getInstances();
      upsertLocalVariantOverride(instances[0], "component", "gap", "27px");
      upsertLocalVariantOverride(instances[1], "component", "gap", "33px");
      selectVariantInstancesState(instances.slice(0, count).map((instance) => instance.id));
      renderTree();
    }, count);
    const expected = await page.evaluate(() => variantModel.getInstances()
      .filter((instance) => getSelectedVariantInstanceIds().includes(instance.id))
      .map((instance) => ({ propValues: structuredClone(instance.propValues), overrides: [structuredClone(getEffectiveVariantOverride(instance, "component", "gap"))] })));
    await page.locator(".variant-preview").first().focus();
    await page.keyboard.press("Control+c");
    await expect(page.locator(".variant-preview")).toHaveCount(2);
    await page.evaluate(() => {
      upsertLocalVariantOverride(variantModel.getInstances()[0], "component", "gap", "41px");
      selectCanvasState();
      renderTree();
    });
    await page.keyboard.press("Control+v");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count);
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(count);
    await expect.poll(() => page.evaluate(() => variantModel.getInstances()
      .filter((instance) => getSelectedVariantInstanceIds().includes(instance.id))
      .map((instance) => ({ propValues: instance.propValues, overrides: instance.overrides })))).toEqual(expected);
    await page.keyboard.press("Control+v");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count * 2);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count * 2);
  });
}

for (const shortcut of ["Shift+A"]) {
  test(`wraps variant children with ${shortcut} and preserves selection`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      for (const textContent of ["First", "Second"]) {
        createCanvasText(currentComponent.frameRecord, 0, 0, { beginEditing: false, isNew: false, textContent });
      }
      selectComponentState(currentComponent.id);
      renderTree();
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const ids = await page.evaluate(() => {
      const ids = variantModel.getInstances().map((instance) => instance.id);
      selectVariantInstancesState(ids);
      renderTree();
      return ids;
    });
    await page.locator(".variant-preview").last().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
    await page.keyboard.press("Control+a");
    await expect(page.locator(".variant-preview .canvas-frame")).toHaveCount(0);
    await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
    await page.keyboard.press(shortcut);
    await expect(page.locator(".variant-preview .canvas-frame.is-selected")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => getSelectedVariantInstanceIds())).toEqual(ids);
    for (const root of await page.locator(".variant-preview .canvas-root-stack").all()) {
      await expect(root.locator(":scope > .canvas-frame > .canvas-text")).toHaveCount(2);
      await expect(root.locator(":scope > .canvas-text")).toHaveCount(0);
    }
    await page.keyboard.press("Control+z");
    await expect(page.locator(".variant-preview .canvas-frame")).toHaveCount(0);
    await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
  });
}

for (const variantCount of [1, 2]) {
  test(`Shift+Enter on focused variant text drills up with ${variantCount} selected variants`, async ({ page }) => {
    await openApp(page);
    const keys = await page.evaluate(() => {
      const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
      const text = createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
      selectComponentState(currentComponent.id);
      renderTree();
      return { frame: `frame:${frame.id}`, text: `text:${text.id}` };
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const ids = await page.evaluate(({ variantCount, keys }) => {
      const ids = variantModel.getInstances().slice(0, variantCount).map((instance) => instance.id);
      selectVariantInstancesLayerTargetsState(ids, [keys.text]);
      renderTree();
      return ids;
    }, { variantCount, keys });
    await page.locator(".variant-preview .canvas-text.is-selected").first().focus();
    if (variantCount > 1) {
      await page.keyboard.press("Enter");
      await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
    }
    await page.keyboard.press("Shift+Enter");
    await expect.poll(() => page.evaluate(() => ({
      ids: getSelectedVariantInstanceIds(), targets: getSelectedVariantLayerTargets(),
    }))).toEqual({ ids, targets: [keys.frame] });
    await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
    await expect(page.locator(`[data-selection-layer-key="${keys.frame}"]`)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("");
    if (variantCount === 1) {
      await page.keyboard.press("Enter");
      await page.locator(".variant-preview .canvas-text.is-selected").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('.variant-preview .canvas-text[contenteditable="true"]')).toHaveCount(1);
    }
  });
}

for (const variantCount of [1, 2, 3]) {
for (const collapseDepth of [1, 2, 3]) {
  test(`preserves all children in ${variantCount} variants and collapses Tab at depth ${collapseDepth}`, async ({ page }) => {
    await openApp(page);
    const path = await page.evaluate(() => {
      const path = [[], [], []];
      for (let outerIndex = 0; outerIndex < 2; outerIndex += 1) {
        const outer = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
        path[0].push(`frame:${outer.id}`);
        for (let innerIndex = 0; innerIndex < 2; innerIndex += 1) {
          const inner = createCanvasFrame(0, 0, outer, { select: false });
          path[1].push(`frame:${inner.id}`);
          for (const textContent of ["First", "Second"]) {
            const label = createCanvasText(inner, 0, 0, { beginEditing: false, isNew: false, textContent });
            path[2].push(`text:${label.id}`);
          }
        }
      }
      selectComponentState(currentComponent.id);
      renderTree();
      return path;
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const ids = await page.evaluate((variantCount) => {
      const ids = variantModel.getInstances().slice(0, variantCount).map((instance) => instance.id);
      selectVariantInstancesState(ids, ids[ids.length - 1]);
      renderTree();
      return ids;
    }, variantCount);
    await page.locator(".variant-preview").nth(variantCount - 1).focus();
    for (let depth = 0; depth < collapseDepth; depth += 1) {
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => ({
        ids: getSelectedVariantInstanceIds(), targets: getSelectedVariantLayerTargets(),
      }))).toEqual({ ids, targets: path[depth] });
      const type = path[depth][0].split(":")[0];
      await expect(page.locator(`.variant-preview .canvas-${type}.is-selected`)).toHaveCount(variantCount * path[depth].length);
    }
    if (collapseDepth === 3) {
      await page.keyboard.press("Enter");
      await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
    }
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => ({
      ids: getSelectedVariantInstanceIds(), targets: getSelectedVariantLayerTargets(),
    }))).toEqual({ ids: [ids[0]], targets: [path[collapseDepth - 1][0]] });
    await expect(page.locator(".variant-preview .is-selected")).toHaveCount(1);
  });
}
}

test("drills every selected variant and frame branch from the layer tree", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    for (let index = 0; index < 2; index += 1) {
      const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
      createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: `Label ${index}` });
    }
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    const unselected = variantModel.getInstances()[2];
    upsertLocalVariantOverride(unselected, "frame:1", "gap", "16px");
    selectVariantInstancesState(variantModel.getInstances().slice(0, 2).map((instance) => instance.id));
    renderTree();
  });
  const frames = page.locator('[data-selection-layer-key^="frame:"]');
  await frames.nth(0).click();
  await frames.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.locator(".variant-preview .canvas-frame.is-selected")).toHaveCount(4);
  const roots = page.locator(".variant-preview .canvas-root-stack");
  const rootGap = await roots.first().evaluate((element) => getComputedStyle(element).gap);
  await page.locator("#frame-gap").fill("28");
  await page.locator("#frame-gap").press("Tab");
  for (const frame of await page.locator(".variant-preview .canvas-frame.is-selected").all()) {
    await expect(frame).toHaveCSS("gap", "28px");
  }
  await expect(roots.first()).toHaveCSS("gap", rootGap);
  await expect(roots.nth(2).locator(".canvas-frame").first()).toHaveCSS("gap", "16px");
  await frames.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
  await expect(page.locator('[data-selection-layer-key^="text:"].is-selected')).toHaveCount(2);
  await expect(page.locator(".variant-preview").nth(2)).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
  await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
  await page.locator('[data-selection-layer-key^="text:"]').first().focus();
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".variant-preview .canvas-frame.is-selected")).toHaveCount(4);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
});

test("applies variant component gap after wrapping text and duplicating its frame", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Label",
    });
    selectCanvasText(text.element);
    wrapSelectedLayersInFrame();
    duplicateSelectedLayer();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  const roots = page.locator(".variant-preview .canvas-root-stack");
  await roots.nth(0).click({ position: { x: 1, y: 1 } });
  await roots.nth(1).click({ position: { x: 1, y: 1 }, modifiers: ["Shift"] });
  await page.locator("#frame-gap").fill("32");
  await page.locator("#frame-gap").press("Tab");
  for (const root of await roots.all()) {
    await expect(root).toHaveCSS("gap", "32px");
    await expect.poll(() => root.locator(":scope > .canvas-frame").evaluateAll((elements) => {
      const [first, second] = elements.map((element) => element.getBoundingClientRect());
      return Math.round(second.left - first.right);
    })).toBe(32);
  }
});

for (const selectionMethod of ["shift", "marquee"]) {
  test(`drills selected variant roots down and up after ${selectionMethod} selection`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      canvasRootStack.style.padding = "20px";
      const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
      createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
      selectComponentState(currentComponent.id);
      renderTree();
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const previews = page.locator(".variant-preview");
    const roots = previews.locator(".canvas-root-stack");
    if (selectionMethod === "shift") {
      const first = await roots.nth(0).boundingBox();
      const second = await roots.nth(1).boundingBox();
      await roots.nth(0).click({ position: { x: first.width - 12, y: first.height - 12 } });
      await roots.nth(1).click({ position: { x: second.width - 12, y: second.height - 12 }, modifiers: ["Shift"] });
    } else {
      const first = await roots.nth(0).boundingBox();
      const last = await roots.nth(1).boundingBox();
      await page.mouse.move(first.x - 4, first.y - 4);
      await page.mouse.down();
      await page.mouse.move(last.x + last.width + 4, Math.max(first.y + first.height, last.y + last.height) + 4, { steps: 8 });
      await page.mouse.up();
    }
    await expect(roots.locator(".canvas-frame.is-selected")).toHaveCount(0);
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
    await page.evaluate(() => {
      expandedFrameIds.clear();
      isComponentExpanded = false;
      renderTree();
    });
    await previews.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(roots.locator(".canvas-frame.is-selected")).toHaveCount(2);
    await expect(page.locator('[data-selection-layer-key="frame:1"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(roots.locator(".canvas-text.is-selected")).toHaveCount(2);
    await expect(page.locator('[data-selection-layer-key="text:1"]')).toBeVisible();
    await expect(page.locator('[data-selection-layer-key="text:1"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Shift+Enter");
    await expect(roots.locator(".canvas-frame.is-selected")).toHaveCount(2);
    await page.keyboard.press("\\");
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
    await page.keyboard.press("Shift+Enter");
    await expect.poll(() => page.evaluate(() => selectionState.kind)).toBe("component");
    await page.keyboard.press("Enter");
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
  });
}

async function createVariantGroupedColorFixture(page) {
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "";
    canvasRootStack.style.backgroundColor = "";
    const textRecord = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Variant color",
    });
    textRecord.element.dataset.textColor = "#336699";
    textRecord.element.style.color = "#336699";
    createCanvasVector({
      name: "Variant icon",
      width: 24,
      height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="#336699"/></svg>',
    }, 0, 0, currentComponent.frameRecord, { select: false });
    selectComponentState(currentComponent.id);
    renderTree();
  });
}

test("starts new variant text with an empty caret", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const previews = page.locator(".variant-preview");
  const selectedRoot = previews.nth(1).locator(".canvas-root-stack");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await selectedRoot.click({ position: { x: 40, y: 40 } });

  const text = selectedRoot.locator(":scope > .canvas-text");
  await expect(text).toHaveCount(1);
  await expect(text).toBeFocused();
  await expect(text).toHaveText("");
  await expect.poll(() => text.evaluate((element) => {
    const selection = window.getSelection();
    if (selection?.isCollapsed !== true || !element.contains(selection.anchorNode) || selection.rangeCount === 0) {
      return false;
    }
    const contents = document.createRange();
    contents.selectNodeContents(element);
    return selection.getRangeAt(0).compareBoundaryPoints(Range.END_TO_END, contents) === 0;
  })).toBe(true);
});

test("creates variant previews and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const previews = page.locator(".variant-preview");
  await expect(previews).toHaveCount(0);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  await expect(previews).toHaveCount(2);
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(previews).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(previews).toHaveCount(2);
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
});

test("shift-clicks variant component roots into and out of one selection", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  await roots.nth(0).click();
  await roots.nth(1).click({ modifiers: ["Shift"] });
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
  await expect(roots.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(roots.nth(1)).toHaveAttribute("aria-selected", "true");

  await roots.nth(0).click({ modifiers: ["Shift"] });
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");

  await roots.nth(2).click();
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "true");
});

test("marquee-selects one or multiple variant component roots with the same interaction", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectCanvasState();
    renderTree();
  });

  const canvas = page.getByRole("region", { name: "Canvas" });
  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  const canvasBounds = await canvas.boundingBox();
  const firstBounds = await roots.nth(0).boundingBox();
  const secondBounds = await roots.nth(1).boundingBox();
  expect(canvasBounds).not.toBeNull();
  expect(firstBounds).not.toBeNull();
  expect(secondBounds).not.toBeNull();

  await page.mouse.move(
    Math.max(canvasBounds.x + 1, firstBounds.x - 8),
    Math.max(canvasBounds.y + 1, firstBounds.y - 8),
  );
  await page.mouse.down();
  await page.mouse.move(
    secondBounds.x + secondBounds.width + 2,
    Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) + 2,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");

  await page.mouse.move(
    Math.max(canvasBounds.x + 1, firstBounds.x - 8),
    Math.max(canvasBounds.y + 1, firstBounds.y - 8),
  );
  await page.mouse.down();
  await page.mouse.move(
    firstBounds.x + firstBounds.width + 2,
    firstBounds.y + firstBounds.height + 2,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
});

test("changes only the selected variant fill and supports undo and redo", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Add variant preview" }).click();
  const roots = page.locator(".variant-preview .canvas-root-stack");
  await expect(roots).toHaveCount(2);

  const colorHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(roots.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgb(255, 255, 255)");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(roots.nth(0)).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(roots.nth(1)).toHaveCSS("background-color", "rgb(204, 85, 0)");
});

test("changes grouped colors only in the selected variant", async ({ page }) => {
  await openApp(page);
  await createVariantGroupedColorFixture(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const previews = page.locator(".variant-preview");
  const section = page.locator("[data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);

  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(previews.nth(0).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(previews.nth(0).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(51, 102, 153)");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(previews.nth(1).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(previews.nth(1).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(51, 102, 153)");
});

test("refreshes variant selection colors after a background edit", async ({ page }) => {
  await openApp(page);
  await createVariantGroupedColorFixture(page);
  await page.evaluate(() => {
    canvasRootStack.dataset.frameColor = "#FFFFFF";
    canvasRootStack.dataset.frameColorOpacity = "100";
    canvasRootStack.style.backgroundColor = "#FFFFFF";
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const section = page.locator("[data-selection-colors]");
  const controls = section.locator('[data-color-control="selection"]');
  await expect(controls).toHaveCount(2);
  const backgroundHex = page.getByRole("textbox", { name: "Frame background hex value" });
  await backgroundHex.fill("CC5500");
  await backgroundHex.press("Enter");

  await expect(controls).toHaveCount(2);
  await expect(section.getByRole("textbox", { name: "Selection color 1 hex value" })).toHaveValue("CC5500");
  await expect(section.getByRole("textbox", { name: "Selection color 2 hex value" })).toHaveValue("336699");
});

test("propagates grouped colors from a parent variant to inheriting variants", async ({ page }) => {
  await openApp(page);
  await createVariantGroupedColorFixture(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => selectVariantInstance(1));

  const previews = page.locator(".variant-preview");
  const section = page.locator("[data-selection-colors]");
  await expect(section.locator('[data-color-control="selection"]')).toHaveCount(1);

  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("CC5500");
  await colorHex.press("Enter");
  await expect(previews.nth(0).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(previews.nth(0).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(204, 85, 0)");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(204, 85, 0)");
  await expect(previews.nth(1).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(204, 85, 0)");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(previews.nth(0).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(51, 102, 153)");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(51, 102, 153)");
});

test("propagates grouped base colors to variants without overrides", async ({ page }) => {
  await openApp(page);
  await createVariantGroupedColorFixture(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectComponentState(currentComponent.id);
    renderTree();
  });

  const previews = page.locator(".variant-preview");
  const section = page.locator("[data-selection-colors]");
  const colorHex = section.getByRole("textbox", { name: "Selection color 1 hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");

  await expect(previews.nth(0).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(122, 62, 157)");
  await expect(previews.nth(0).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(122, 62, 157)");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveCSS("color", "rgb(122, 62, 157)");
  await expect(previews.nth(1).locator('[data-vector-id="1"] path')).toHaveCSS("fill", "rgb(122, 62, 157)");
});

test("preserves inheritance while bulk-editing variants with and without local overrides", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  await page.evaluate(() => {
    const [first, second] = variantModel.getInstances();
    upsertLocalVariantOverride(first, "component:0", "backgroundColor", "#CC0000");
    upsertLocalVariantOverride(first, "component:0", "outlineColor", "#0000CC");
    upsertLocalVariantOverride(first, "component:0", "outlineColorOpacity", "100");
    upsertLocalVariantOverride(first, "component:0", "outlineWeight", "1");
    renderVariantInstances();
    selectVariantInstances([first.id, second.id], second.id);
    updateInspector();
  });

  const previews = page.locator(".variant-preview");
  const roots = previews.locator(".canvas-root-stack");
  const selectionColors = page.locator("[data-frame-inspector] > [data-selection-colors]");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);
  const inheritedFill = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await expect(inheritedFill).toHaveValue("CC0000");
  await inheritedFill.fill("CC5500");

  for (let index = 0; index < 3; index += 1) {
    await expect(roots.nth(index)).toHaveCSS("background-color", "rgb(204, 85, 0)");
  }

  const width = page.getByRole("combobox", { name: "Frame width" });
  await width.fill("180");
  await width.press("Enter");
  for (let index = 0; index < 3; index += 1) {
    await expect(roots.nth(index)).toHaveCSS("width", "180px");
  }

  let localOverrides = await page.evaluate(() => variantModel.getInstances().map((instance) => ({
    background: getLocalVariantOverride(instance, "component:0", "backgroundColor")?.value ?? null,
    width: getLocalVariantOverride(instance, "component:0", "width")?.value ?? null,
  })));
  expect(localOverrides).toEqual([
    { background: "#CC5500", width: "180px" },
    { background: null, width: null },
    { background: null, width: null },
  ]);

  await page.evaluate(() => {
    const [first, second] = variantModel.getInstances();
    upsertLocalVariantOverride(second, "component:0", "backgroundColor", "#336699");
    upsertLocalVariantOverride(second, "component:0", "width", "140px");
    renderVariantInstances();
    selectVariantInstances([first.id, second.id], second.id);
    updateInspector();
  });

  await page.getByRole("button", { name: "Add frame fill" }).click();
  await width.fill("200");
  await width.press("Enter");
  for (let index = 0; index < 3; index += 1) {
    await expect(roots.nth(index)).toHaveCSS("background-color", "rgb(204, 85, 0)");
    await expect(roots.nth(index)).toHaveCSS("width", "200px");
  }

  localOverrides = await page.evaluate(() => variantModel.getInstances().map((instance) => ({
    background: getLocalVariantOverride(instance, "component:0", "backgroundColor")?.value ?? null,
    width: getLocalVariantOverride(instance, "component:0", "width")?.value ?? null,
  })));
  expect(localOverrides).toEqual([
    { background: "#CC5500", width: "200px" },
    { background: "#CC5500", width: "200px" },
    { background: null, width: null },
  ]);
});

test("bulk edits selected frame sizing inside one variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const first = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const second = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    first.element.dataset.width = "100";
    first.element.style.width = "100px";
    second.element.dataset.width = "140";
    second.element.style.width = "140px";
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    const targets = ["frame:1", "frame:2"];
    selectVariantLayerTargetsState(selectedVariantInstanceId, targets, targets.at(-1));
    syncElementSelectionStyles();
    updateInspector();
  });

  const previews = page.locator(".variant-preview");
  const widthInput = page.getByRole("combobox", { name: "Frame width" });
  await expect(widthInput).toHaveValue("");
  await expect(widthInput).toHaveAttribute("placeholder", "Mixed");
  await widthInput.fill("180");
  await widthInput.press("Enter");

  await expect(previews.nth(0).locator('[data-frame-id="1"]')).toHaveCSS("width", "100px");
  await expect(previews.nth(0).locator('[data-frame-id="2"]')).toHaveCSS("width", "140px");
  await expect(previews.nth(1).locator('[data-frame-id="1"]')).toHaveCSS("width", "180px");
  await expect(previews.nth(1).locator('[data-frame-id="2"]')).toHaveCSS("width", "180px");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(previews.nth(1).locator('[data-frame-id="1"]')).toHaveCSS("width", "100px");
  await expect(previews.nth(1).locator('[data-frame-id="2"]')).toHaveCSS("width", "140px");
});

test("bulk edits multiple selected text layers in one variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "First variant text",
    });
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Second variant text",
    });
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectVariantLayerTargetsState(2, ["text:1", "text:2"], "text:2");
    renderTree();
  });

  const previews = page.locator(".variant-preview");
  const fontSize = page.locator("#text-size");
  await fontSize.fill("24");
  await fontSize.press("Enter");
  const widthControl = page.locator('[data-size-combobox="text-width"]');
  await widthControl.getByRole("button", { name: "Open text width sizing options" }).click();
  await widthControl.getByRole("option", { name: "Fill container" }).click();
  const colorHex = page.getByRole("textbox", { name: "Text color hex value" });
  await colorHex.fill("7A3E9D");
  await colorHex.press("Enter");

  for (let index = 1; index <= 2; index += 1) {
    await expect(previews.nth(0).locator(`[data-text-id="${index}"]`)).toHaveCSS("font-size", "14px");
    await expect(previews.nth(0).locator(`[data-text-id="${index}"]`)).toHaveCSS("color", "rgb(0, 0, 0)");
    await expect(previews.nth(0).locator(`[data-text-id="${index}"]`)).toHaveAttribute("data-width-mode", "hug");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveCSS("font-size", "24px");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveCSS("color", "rgb(122, 62, 157)");
    await expect(previews.nth(1).locator(`[data-text-id="${index}"]`)).toHaveAttribute("data-width-mode", "fill");
  }
});

test("bulk edits vector dimensions and colors inside one variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const definitions = [
      { name: "First vector", width: 24, height: 24, color: "#CC0000" },
      { name: "Second vector", width: 36, height: 40, color: "#00AA00" },
    ];
    definitions.forEach((definition) => createCanvasVector({
      name: definition.name,
      width: definition.width,
      height: definition.height,
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="${definition.width}" height="${definition.height}"><path d="M2 2h20v20H2z" fill="${definition.color}"/></svg>`,
    }, 0, 0, currentComponent.frameRecord, { select: false }));
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => selectVariantInstance(1, {
    layerTargets: ["vector:1", "vector:2"],
  }));

  const previews = page.locator(".variant-preview");
  const selectedVectors = previews.nth(0).locator("[data-vector-id]");
  const inheritedVectors = previews.nth(1).locator("[data-vector-id]");
  const width = page.getByRole("spinbutton", { name: "Vector width" });
  const height = page.getByRole("spinbutton", { name: "Vector height" });
  const selectionColors = page.locator("[data-vector-inspector] > [data-selection-colors]");

  await expect(page.getByRole("heading", { name: "Vectors", exact: true })).toBeVisible();
  await expect(width).toHaveAttribute("placeholder", "Mixed");
  await expect(height).toHaveAttribute("placeholder", "Mixed");
  await expect(selectionColors.locator('[data-color-control="selection"]')).toHaveCount(2);

  const firstColor = selectionColors.getByRole("textbox", { name: "Selection color 1 hex value" });
  await firstColor.fill("EE4400");
  await firstColor.press("Enter");
  await width.fill("60");
  await width.press("Tab");
  await height.fill("70");
  await height.press("Tab");

  for (const vectors of [selectedVectors, inheritedVectors]) {
    await expect(vectors.nth(0).locator("path")).toHaveCSS("fill", "rgb(238, 68, 0)");
    await expect(vectors.nth(1).locator("path")).toHaveCSS("fill", "rgb(0, 170, 0)");
    for (let index = 0; index < 2; index += 1) {
      await expect(vectors.nth(index)).toHaveCSS("width", "60px");
      await expect(vectors.nth(index)).toHaveCSS("height", "70px");
    }
  }

  const overrides = await page.evaluate(() => variantModel.getInstances().map((instance) => (
    (instance.overrides ?? []).filter((override) => (
      override.target.startsWith("vector:")
      && ["width", "height", "fill"].includes(override.property)
    ))
  )));
  expect(overrides[0]).toEqual(expect.arrayContaining([
    { target: "vector:1", property: "fill", value: "#EE4400" },
    { target: "vector:1", property: "width", value: "60px" },
    { target: "vector:2", property: "width", value: "60px" },
    { target: "vector:1", property: "height", value: "70px" },
    { target: "vector:2", property: "height", value: "70px" },
  ]));
  expect(overrides[1]).toEqual([]);
});

test("preserves character-range colors in a variant", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Red black",
    });
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectVariantLayerTargetsState(2, ["text:1"], "text:1");
    renderTree();
    const text = document.querySelector('.variant-preview[data-variant-instance-id="2"] [data-text-id="1"]');
    const range = document.createRange();
    range.setStart(text.firstChild, 0);
    range.setEnd(text.firstChild, 3);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });

  const fillHex = page.getByRole("textbox", { name: "Text color hex value" });
  await fillHex.fill("FF0000");
  await fillHex.press("Enter");
  await page.evaluate(() => renderVariantInstances());

  const previews = page.locator(".variant-preview");
  await expect(previews.nth(0).locator('[data-rich-text-color="#FF0000"]')).toHaveCount(0);
  await expect(previews.nth(1).locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(previews.nth(1).locator('[data-text-id="1"]')).toHaveText("Red black");
});

test("uses current inherited run colors when a variant root is selected", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const record = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Red black",
    });
    record.element.innerHTML = '<span data-rich-text-color="#FF0000" data-rich-text-color-opacity="100" style="color: #FF0000">Red</span> black';
    syncTextRecordContent(record, record.element.textContent, { writeElement: false });
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectVariantLayerTargetsState(2, ["text:1"], "text:1");
    renderVariantInstances();
    const record = getSelectedTextRecord();
    applyTextRangeColor(record, {
      element: record.element,
      textId: record.id,
      start: 0,
      end: 3,
      variantInstanceId: 2,
    }, "#00AA00", 100);
    selectVariantState(2, null);
    renderVariantInstances();
    updateInspector();
  });

  const previews = page.locator(".variant-preview");
  await expect(previews.nth(0).locator('[data-rich-text-color="#FF0000"]')).toHaveText("Red");
  await expect(previews.nth(1).locator('[data-rich-text-color="#00AA00"]')).toHaveText("Red");
  const selectionColors = await page.locator("[data-selection-colors] [data-color-hex]").evaluateAll(
    (inputs) => inputs.map((input) => input.value),
  );
  expect(selectionColors).toContain("00AA00");
  expect(selectionColors).toContain("000000");
  expect(selectionColors).not.toContain("FF0000");
});

test("reorders variant previews and supports undo and redo", async ({ page }) => {
  await openApp(page);

  const addVariant = page.getByRole("button", { name: "Add variant preview" });
  const previews = page.locator(".variant-preview");
  const previewOrder = () => previews.evaluateAll((elements) => (
    elements.map((element) => element.dataset.variantInstanceId)
  ));

  await addVariant.click();
  await addVariant.click();
  await expect(previews).toHaveCount(3);
  await expect.poll(previewOrder).toEqual(["1", "2", "3"]);

  await previews.nth(2).focus();
  await previews.nth(2).press("ArrowLeft");
  await expect.poll(previewOrder).toEqual(["1", "3", "2"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(previewOrder).toEqual(["1", "2", "3"]);

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(previewOrder).toEqual(["1", "3", "2"]);
});

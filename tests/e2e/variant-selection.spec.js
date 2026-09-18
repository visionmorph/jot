const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
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

test("assigns a Boolean prop value to every shift-clicked variant", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const roots = page.locator(".variant-preview .canvas-root-stack");
  await roots.nth(0).click();
  await roots.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("switch", { name: "visible value" }).click();

  await expect.poll(() => page.evaluate(() => {
    const propId = variantModel.getProps()[0].id;
    return variantModel.getVariants().map((variant) => variant.propValues[propId]);
  })).toEqual([false, false, true]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => page.evaluate(() => {
    const propId = variantModel.getProps()[0].id;
    return variantModel.getVariants().map((variant) => variant.propValues[propId]);
  })).toEqual([true, true, true]);
});

test("assigns an enum prop value to every shift-clicked variant", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  const addValue = page.getByRole("textbox", { name: "Add Custom value" });
  await addValue.fill("Primary");
  await addValue.press("Enter");
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const roots = page.locator(".variant-preview .canvas-root-stack");
  await roots.nth(0).click();
  await roots.nth(1).click({ modifiers: ["Shift"] });
  await page.getByRole("textbox", { name: "Custom value Primary" }).click();

  await expect.poll(() => page.evaluate(() => {
    const propId = variantModel.getProps()[0].id;
    return variantModel.getVariants().map((variant) => variant.propValues[propId]);
  })).toEqual(["Primary", "Primary", "Default"]);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => page.evaluate(() => {
    const propId = variantModel.getProps()[0].id;
    return variantModel.getVariants().map((variant) => variant.propValues[propId]);
  })).toEqual(["Default", "Default", "Default"]);
});

test("creates a new enum value without assigning it to the selected variant", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();

  const selectedVariantId = await page.evaluate(() => selectedVariantId);
  const addValue = page.getByRole("textbox", { name: "Add Custom value" });
  await addValue.fill("Primary");
  await addValue.press("Enter");

  const newValueTag = page.getByRole("textbox", { name: "Custom value Primary" }).locator("..");
  await expect(newValueTag).not.toHaveClass(/is-active/);
  await expect.poll(() => page.evaluate((variantId) => {
    const propId = variantModel.getProps()[0].id;
    return getVariant(variantId).propValues[propId];
  }, selectedVariantId)).toBe("Default");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByRole("textbox", { name: "Custom value Primary" })).toHaveCount(0);
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
    firstBounds.y + firstBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    firstBounds.x + 2,
    firstBounds.y + firstBounds.height / 2 + 8,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(previews.nth(2)).toHaveAttribute("aria-selected", "false");
});

test("Ctrl-marquee keeps selecting children across every overlapped variant", async ({ page }) => {
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
    addVariant();
    selectCanvasState();
    renderTree();
  });

  const roots = page.locator(".variant-preview .canvas-root-stack");
  const firstRoot = roots.nth(0);
  const firstText = firstRoot.locator('[data-text-id="1"]');
  const firstVector = firstRoot.locator('[data-vector-id="1"]');
  const rootBounds = await firstRoot.boundingBox();
  const textBounds = await firstText.boundingBox();
  const vectorBounds = await firstVector.boundingBox();

  await page.keyboard.down("Control");
  await page.mouse.move(rootBounds.x + 4, rootBounds.y + 4);
  await page.mouse.down();
  await page.mouse.move(
    Math.max(textBounds.x + textBounds.width, vectorBounds.x + vectorBounds.width) + 2,
    Math.max(textBounds.y + textBounds.height, vectorBounds.y + vectorBounds.height) + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");

  await expect(firstRoot).toHaveAttribute("aria-selected", "false");
  await expect(firstText).toHaveAttribute("aria-selected", "true");
  await expect(firstVector).toHaveAttribute("aria-selected", "true");
  await expect(roots.nth(1).locator('[data-text-id="1"]')).toHaveAttribute("aria-selected", "false");
  await expect(roots.nth(1).locator('[data-vector-id="1"]')).toHaveAttribute("aria-selected", "false");

  const secondRoot = roots.nth(1);
  const secondBounds = await secondRoot.boundingBox();
  await page.evaluate(() => {
    selectCanvasState();
    syncVariantSelectionUI();
  });
  await page.keyboard.down("Control");
  await page.mouse.move(
    textBounds.x + textBounds.width / 2,
    textBounds.y + textBounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    secondBounds.x + secondBounds.width + 2,
    secondBounds.y + secondBounds.height + 2,
    { steps: 8 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");

  for (let index = 0; index < 2; index += 1) {
    await expect(roots.nth(index)).toHaveAttribute("aria-selected", "false");
    await expect(roots.nth(index).locator('[data-text-id="1"]')).toHaveAttribute("aria-selected", "true");
    await expect(roots.nth(index).locator('[data-vector-id="1"]')).toHaveAttribute("aria-selected", "true");
  }
});

test("Ctrl-marquee selects partial child hits, rolls up enclosed variants, and keeps root depth", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false, isNew: false, textContent: "Child text",
    });
    addVariant();
    selectCanvasState();
    renderTree();
  });

  const roots = page.locator(".variant-preview .canvas-root-stack");
  const previews = page.locator(".variant-preview");
  const firstBounds = await roots.nth(0).boundingBox();
  const secondBounds = await roots.nth(1).boundingBox();
  const firstText = roots.nth(0).locator('[data-text-id="1"]');
  const secondText = roots.nth(1).locator('[data-text-id="1"]');
  const firstTextBounds = await firstText.boundingBox();
  const secondTextBounds = await secondText.boundingBox();
  await page.keyboard.down("Control");
  await page.mouse.move(firstBounds.x - 8, firstBounds.y - 8);
  await page.mouse.down();
  await page.mouse.move(
    firstTextBounds.x + firstTextBounds.width + 2,
    firstTextBounds.y + firstTextBounds.height + 2,
    { steps: 4 },
  );
  await expect(roots.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(firstText).toHaveAttribute("aria-selected", "true");

  await page.mouse.move(
    firstBounds.x + firstBounds.width + 2,
    firstBounds.y + firstBounds.height + 2,
    { steps: 8 },
  );
  await expect(roots.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(firstText).toHaveAttribute("aria-selected", "false");

  await page.mouse.move(
    secondTextBounds.x + secondTextBounds.width + 2,
    Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) + 2,
    { steps: 4 },
  );
  await expect(roots.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(roots.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(secondText).toHaveAttribute("aria-selected", "true");

  await page.mouse.move(
    secondBounds.x + secondBounds.width + 2,
    Math.max(firstBounds.y + firstBounds.height, secondBounds.y + secondBounds.height) + 2,
    { steps: 4 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(previews.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(previews.nth(1)).toHaveAttribute("aria-selected", "true");
});

test("assigns a Boolean prop value to every marquee-selected variant", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Boolean" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectCanvasState();
    renderTree();
  });

  const canvas = page.getByRole("region", { name: "Canvas" });
  const roots = page.locator(".variant-preview .canvas-root-stack");
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
  await page.getByRole("switch", { name: "visible value" }).click();

  await expect.poll(() => page.evaluate(() => {
    const propId = variantModel.getProps()[0].id;
    return variantModel.getVariants().map((variant) => variant.propValues[propId]);
  })).toEqual([false, false, true]);
});

test("assigns an enum prop value to every marquee-selected variant", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Add prop" }).click();
  await page.getByRole("option", { name: "Variant" }).click();
  const addValue = page.getByRole("textbox", { name: "Add Custom value" });
  await addValue.fill("Primary");
  await addValue.press("Enter");
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    selectCanvasState();
    renderTree();
  });

  const canvas = page.getByRole("region", { name: "Canvas" });
  const roots = page.locator(".variant-preview .canvas-root-stack");
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
  await page.getByRole("textbox", { name: "Custom value Primary" }).click();

  await expect.poll(() => page.evaluate(() => {
    const propId = variantModel.getProps()[0].id;
    return variantModel.getVariants().map((variant) => variant.propValues[propId]);
  })).toEqual(["Primary", "Primary", "Default"]);
});


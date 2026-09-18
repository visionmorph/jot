const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
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
  await page.evaluate(() => selectVariant(1));

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
    const [first, second] = variantModel.getVariants();
    upsertLocalVariantOverride(first, "component:0", "backgroundColor", "#CC0000");
    upsertLocalVariantOverride(first, "component:0", "outlineColor", "#0000CC");
    upsertLocalVariantOverride(first, "component:0", "outlineColorOpacity", "100");
    upsertLocalVariantOverride(first, "component:0", "outlineWeight", "1");
    renderVariants();
    selectVariants([first.id, second.id], second.id);
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

  let localOverrides = await page.evaluate(() => variantModel.getVariants().map((variant) => ({
    background: getLocalVariantOverride(variant, "component:0", "backgroundColor")?.value ?? null,
    width: getLocalVariantOverride(variant, "component:0", "width")?.value ?? null,
  })));
  expect(localOverrides).toEqual([
    { background: "#CC5500", width: "180px" },
    { background: null, width: null },
    { background: null, width: null },
  ]);

  await page.evaluate(() => {
    const [first, second] = variantModel.getVariants();
    upsertLocalVariantOverride(second, "component:0", "backgroundColor", "#336699");
    upsertLocalVariantOverride(second, "component:0", "width", "140px");
    renderVariants();
    selectVariants([first.id, second.id], second.id);
    updateInspector();
  });

  await page.getByRole("button", { name: "Add frame fill" }).click();
  await width.fill("200");
  await width.press("Enter");
  for (let index = 0; index < 3; index += 1) {
    await expect(roots.nth(index)).toHaveCSS("background-color", "rgb(204, 85, 0)");
    await expect(roots.nth(index)).toHaveCSS("width", "200px");
  }

  localOverrides = await page.evaluate(() => variantModel.getVariants().map((variant) => ({
    background: getLocalVariantOverride(variant, "component:0", "backgroundColor")?.value ?? null,
    width: getLocalVariantOverride(variant, "component:0", "width")?.value ?? null,
  })));
  expect(localOverrides).toEqual([
    { background: "#CC5500", width: "200px" },
    { background: "#CC5500", width: "200px" },
    { background: null, width: null },
  ]);
});


const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function setup(page) {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Same name" });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Same name" });
    createCanvasVector({
      name: "Icon", width: 24, height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z"/></svg>',
    }, 0, 0, frame, { select: false });
    addVariantInstance();
    addVariantInstance();
    upsertLocalVariantOverride(variantModel.getInstances()[1], "text:1", "textContent", "Different label");
    renderTree();
  });
}

for (const target of ["text:1", "frame:1", "vector:1", null]) {
  test(`matches canonical ${target ?? "component root"} across variants`, async ({ page }) => {
    await setup(page);
    const ids = await page.evaluate((target) => {
      const ids = variantModel.getInstances().map((instance) => instance.id);
      selectVariantInstance(ids[1], { render: false, layerTarget: target });
      return ids;
    }, target);
    await page.locator(".variant-preview").nth(1).focus();
    await page.keyboard.press("Control+Alt+a");
    expect(await page.evaluate(() => getSelectedVariantInstanceIds())).toEqual(ids);
    expect(await page.evaluate(() => selectedVariantInstanceId)).toBe(ids[1]);
    expect(await page.evaluate(() => getSelectedVariantLayerTargets())).toEqual(target ? [target] : []);
    const selector = target
      ? `.canvas-${target.split(":")[0]}.is-selected`
      : ".canvas-root-stack.is-selected";
    await expect(page.locator(`.variant-preview ${selector}`)).toHaveCount(ids.length);
    if (target === "text:1") {
      await page.locator("#text-size").fill("32");
      await page.locator("#text-size").press("Enter");
      for (const preview of await page.locator(".variant-preview").all()) {
        await expect(preview.locator('[data-text-id="1"]')).toHaveCSS("font-size", "32px");
        await expect(preview.locator('[data-text-id="2"]')).not.toHaveCSS("font-size", "32px");
      }
    }
  });
}

test("does nothing for multiple selections, canvas-only identities, or editing", async ({ page }) => {
  await setup(page);
  for (const mode of ["layers", "roots", "canvas", "component", "empty", "editing"]) {
    const before = await page.evaluate((mode) => {
      const ids = variantModel.getInstances().map((instance) => instance.id);
      if (mode === "layers") selectVariantLayerTargetsState(ids[0], ["text:1", "text:2"]);
      if (mode === "roots") selectVariantInstancesState(ids.slice(0, 2));
      if (mode === "canvas") selectLayerKeys(["text:1"]);
      if (mode === "component") selectComponentState();
      if (mode === "empty") selectCanvasState();
      if (mode === "editing") selectVariantState(ids[0], "text:1");
      renderTree();
      return captureSelectionState();
    }, mode);
    if (mode === "editing") await page.locator("#text-size").focus();
    else await page.locator(".variant-preview").first().focus();
    await page.keyboard.press("Control+Alt+a");
    expect(await page.evaluate(() => captureSelectionState())).toEqual(before);
  }
});

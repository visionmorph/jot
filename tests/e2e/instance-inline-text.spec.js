const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

for (const useTextTool of [false, true]) test(`edits instance labels ${useTextTool ? "with text-tool single click" : "with double click"}`, async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Link", beginEditing: false, isNew: false });
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source);
    addComponentInstance(owner, source);
    addVariant();
    variantModel.getVariants().forEach(v => v.parentVariantId = null);
    renderTree();
  });
  const first = page.locator('.variant-preview').first().locator('[data-component-instance-id="1"] .canvas-text');
  if (useTextTool) {
    await page.evaluate(() => selectTool("text"));
    await first.click();
  } else await first.dblclick();
  await expect(first).toHaveAttribute("contenteditable", "true");
  await page.keyboard.type("Overview");
  await page.keyboard.press("Escape");
  await expect(first).toHaveText("Overview");
  await expect(first).toHaveAttribute("contenteditable", "false");
  await expect(page.locator('.variant-preview').last().locator('[data-component-instance-id="1"] .canvas-text')).toHaveText("Link");
  await expect(page.locator('.variant-preview').first().locator('[data-component-instance-id="2"] .canvas-text')).toHaveText("Link");
  await page.keyboard.press("Control+z");
  await expect(first).toHaveText("Link");
  await page.keyboard.press("Control+Shift+z");
  await expect(first).toHaveText("Overview");
});

const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

for (const type of ["frame", "text"]) {
  for (const dimension of ["width", "height"]) {
    test(`variant ${type} ${dimension} stays positive when typing and scrubbing`, async ({ page }) => {
      await openApp(page);
      await page.evaluate((type) => {
        createCanvasText(currentComponent.frameRecord, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
        addVariantInstance();
        selectVariantInstance(variantModel.getInstances()[0].id, { render: false, layerTarget: type === "text" ? "text:1" : null });
      }, type);
      const input = page.locator(`[data-${type === "text" ? "text-layer" : "frame"}-size="${dimension}"]`);
      await input.fill("-20");
      await input.press("Enter");
      await expect(input).toHaveValue("1");
      await input.fill("20");
      await input.press("Enter");
      const prefix = input.locator('xpath=ancestor::*[@data-size-combobox]').locator('[data-text-input-prefix]');
      const bounds = await prefix.boundingBox();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds.x - 100, bounds.y + bounds.height / 2);
      await page.mouse.up();
      await expect(input).toHaveValue("1");
      expect(await page.evaluate(({ type, dimension }) => {
        const target = type === "text" ? "text:1" : "component:0";
        return getEffectiveVariantOverride(variantModel.getInstances()[0], target, dimension)?.value;
      }, { type, dimension })).toBe("1px");
    });
  }
}

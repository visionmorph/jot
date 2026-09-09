const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

for (const type of ["frame", "text", "vector"]) {
  test(`tree-hidden ${type} leaves variant layout and restores on show`, async ({ page }) => {
    await openApp(page);
    await page.evaluate((type) => {
      let record;
      if (type === "frame") {
        record = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
        createCanvasText(record, 0, 0, { beginEditing: false, isNew: false, textContent: "Nested" });
      } else if (type === "text") {
        record = createCanvasText(currentComponent.frameRecord, 0, 0, {
          beginEditing: false, isNew: false, textContent: "Target",
        });
        record.element.style.display = "inline-flex";
      } else {
        record = createCanvasVector({
          name: "Target", width: 24, height: 24,
          source: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z"/></svg>',
        }, 0, 0, currentComponent.frameRecord, { select: false });
      }
      record.name = "Target";
      const sibling = createCanvasText(currentComponent.frameRecord, 0, 0, {
        beginEditing: false, isNew: false, textContent: "Sibling",
      });
      sibling.element.dataset.testSibling = "true";
      addVariantInstance();
      if (type === "text") {
        variantModel.getInstances().forEach((instance) => {
          upsertLocalVariantOverride(instance, "text:1", "display", "flow-root");
        });
        selectVariantState(variantModel.getInstances()[0].id, "text:1");
      } else selectComponentState();
      renderTree();
    }, type);
    const targets = page.locator(`.variant-preview [data-${type}-id="1"]`);
    const siblings = page.locator('.variant-preview [data-test-sibling]');
    const offsets = () => siblings.evaluateAll((elements) => elements.map((element) =>
      element.getBoundingClientRect().left - element.closest('.canvas-root-stack').getBoundingClientRect().left));
    const before = await offsets();
    expect(before.every((offset) => offset > 10)).toBe(true);
    await page.getByRole("button", { name: "Hide Target", exact: true }).click({ force: true });
    for (const target of await targets.all()) await expect(target).toHaveCSS("display", "none");
    await expect.poll(offsets).toEqual(before.map(() => 10));
    await page.getByRole("button", { name: "Show Target", exact: true }).click({ force: true });
    for (const target of await targets.all()) await expect(target).toBeVisible();
    await expect.poll(offsets).toEqual(before);
  });
}

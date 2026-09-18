const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("ordinary canvas and tree selection show each instance child's inspector", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord);
    createCanvasText(frame, 0, 0, { textContent: "Child label", beginEditing: false, isNew: false });
    createCanvasVector({ name: "Child vector", width: 24, height: 24,
      source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#336699" d="M0 0h24v24H0z"/></svg>' }, 0, 0, frame);
    commitCanvasComponentData();
    activateComponent(owner);
    addComponentInstance(owner, source, { name: "Children" });
  });
  const wrapper = page.locator('[data-canvas-root-stack] > [data-component-instance-id="1"]');
  await wrapper.locator(".canvas-text").click();
  await expect(page.locator("[data-text-inspector]")).toBeVisible();
  expect(await page.evaluate(() => getSelectedNestedInstanceLayer()?.target.type)).toBe("text");
  await wrapper.locator(".canvas-vector").click();
  await expect(page.locator("[data-vector-inspector]")).toBeVisible();
  expect(await page.evaluate(() => getSelectedNestedInstanceLayer()?.target.type)).toBe("vector");
  await wrapper.locator(".canvas-frame").click({ position: { x: 95, y: 95 } });
  await expect(page.locator("[data-frame-inspector]")).toBeVisible();
  expect(await page.evaluate(() => getSelectedNestedInstanceLayer()?.target.type)).toBe("frame");
  await page.locator('.tree-node[data-selection-layer-key="component-instance:1"]')
    .getByRole("button", { name: "Expand Children" }).click();
  const frameRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"frame\\\""]');
  await frameRow.getByRole("button", { name: "Expand Frame 1" }).click();
  await frameRow.locator(".tree-node-label").click();
  await expect(page.locator("[data-frame-inspector]")).toBeVisible();
  const textRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"text\\\""]');
  await textRow.locator(".tree-node-label").click();
  await expect(page.locator("[data-text-inspector]")).toBeVisible();
  const vectorRow = page.locator('.tree-node--instance-child[data-selection-layer-identity*="\\\"vector\\\""]');
  await vectorRow.locator(".tree-node-label").click();
  await expect(page.locator("[data-vector-inspector]")).toBeVisible();
});

const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("source rename propagates across owners and source undo/redo", async ({ page }) => {
  await openApp(page);
  const data = await page.evaluate(() => {
    const source = currentComponent.id;
    const firstOwner = addComponent().id;
    addComponentInstance(firstOwner, source, { name: "Component 1" });
    addComponentInstance(firstOwner, source, { name: "Component 1" });
    createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const secondOwner = addComponent().id;
    addComponentInstance(secondOwner, source, { name: "Component 1" });
    activateComponent(source);
    recordHistory();
    applyTreeNodeName("component", currentComponent, "Link", currentComponent);
    renderTree();
    commitCanvasComponentData();
    return { source, firstOwner, secondOwner };
  });
  const names = () => page.evaluate(({ firstOwner, secondOwner }) => [firstOwner, secondOwner].flatMap(id => getComponentDefinition(id).layers
    .filter(layer => layer.type === "component-instance").map(layer => layer.name)), data);
  expect(await names()).toEqual(["Link", "Link", "Link"]);
  await page.evaluate(() => undoWorkspaceChange());
  expect(await names()).toEqual(["Component 1", "Component 1", "Component 1"]);
  await page.evaluate(() => redoWorkspaceChange());
  expect(await names()).toEqual(["Link", "Link", "Link"]);
  await page.evaluate(firstOwner => { activateComponent(firstOwner); undoWorkspaceChange(); }, data.firstOwner);
  expect(await names()).toEqual(["Link", "Link", "Link"]);
  const instances = page.locator('[data-canvas-root-stack] > .canvas-component-instance');
  await expect(instances).toHaveCount(2);
  await expect(instances.first()).toHaveAttribute("aria-label", "Link");
  await expect(instances.last()).toHaveAttribute("aria-label", "Link");
});

test("renaming an inactive source refreshes selected instances without changing references", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const source = currentComponent.id;
    const owner = addComponent().id;
    addComponentInstance(owner, source, { name: "Component 1" });
    selectComponentInstance(1);
    const history = undoHistory.length;
    const definition = getComponentDefinition(source);
    definition.componentName = "Link";
    updateComponentDefinition(source, definition);
    return { source, owner, history };
  });
  await expect(page.locator('[data-canvas-root-stack] > .canvas-component-instance')).toHaveAttribute("aria-label", "Link");
  await expect(page.locator('.component-instance-inspector h2')).toHaveText("Link");
  expect(await page.evaluate(() => undoHistory.length)).toBe(result.history);
  expect(await page.evaluate(() => getComponentDefinition(currentComponent.id).layers[0].sourceComponentId)).toBe(result.source);
  await page.evaluate(() => restoreWorkspaceState(JSON.parse(JSON.stringify(captureWorkspaceState()))));
  await expect(page.locator('[data-canvas-root-stack] > .canvas-component-instance')).toHaveAttribute("aria-label", "Link");
});

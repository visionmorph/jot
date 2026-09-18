const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("duplicating and deleting an instance remaps only its placed overrides", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    activateComponent(owner);
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const instance = addComponentInstance(owner, source, { parentId: frame.id });
    addVariant();
    const variant = variantModel.getVariants().at(-1);
    const target = createPlacedLayerIdentity(owner, [instance.id], createSourceLayerIdentity(source, "component", 0));
    upsertLocalVariantOverride(variant, target, "opacity", "0.5");
    selectCanvasFrame(getFrameRecord(frame.id).element);
    duplicateSelectedLayer();
    const paths = () => getVariant(variant.id).overrides.map(o => normalizeLayerIdentity(o.target).instancePath);
    const copied = paths();
    deleteLayers([{ type: "frame", id: 2 }]);
    const remaining = paths();
    undoWorkspaceChange();
    return { copied, remaining, restored: paths() };
  });
  expect(result).toEqual({ copied: [[1], [2]], remaining: [[1]], restored: [[1], [2]] });
});

test("instance references survive tree operations, switching, JSON and history", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    addVariant();
    const variantId = variantModel.getVariants().at(-1).id;
    activateComponent(owner);
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const instance = addComponentInstance(owner, source, { variantId, parentId: frame.id });
    const before = captureWorkspaceState();
    selectCanvasFrame(getFrameRecord(frame.id).element);
    duplicateSelectedLayer();
    const instances = captureWorkspaceState().layers.filter(n => n.type === "component-instance");
    const copied = instances.find(n => n.id !== instance.id);
    const moved = moveLayer({ type: "component-instance", id: copied.id }, null, 0);
    deleteLayers([{ type: "component-instance", id: copied.id }]);
    undoWorkspaceChange();
    const restored = getLayerRecord({ type: "component-instance", id: copied.id }).parentId === null;
    redoWorkspaceChange();
    const removed = !getLayerRecord({ type: "component-instance", id: copied.id });
    restoreWorkspaceState(JSON.parse(JSON.stringify(before)));
    activateComponent(source);
    activateComponent(owner);
    const saved = getComponentDefinition(owner);
    return { moved, restored, removed, ids: instances.map(n => n.id),
      references: instances.every(n => n.sourceComponentId === source && n.variantId === variantId),
      same: JSON.stringify(saved.layers) === JSON.stringify(before.layers),
      next: saved.nextComponentInstanceId, version: saved.schemaVersion };
  });
  expect(result).toEqual({ moved: true, restored: true, removed: true, ids: [1, 2], references: true, same: true, next: 2, version: 4 });
});

test("rejects invalid references, parents and indirect dependency cycles atomically", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const a = currentComponent.id;
    const b = addComponent().id;
    const c = addComponent().id;
    addComponentInstance(a, b);
    addComponentInstance(b, c);
    const before = JSON.stringify(getComponentDefinition(c));
    const history = undoHistory.length;
    const attempts = [() => addComponentInstance(c, a), () => addComponentInstance(c, c),
      () => addComponentInstance(c, 999), () => addComponentInstance(c, a, { variantId: 999 }),
      () => addComponentInstance(c, a, { parentId: 999 }),
      () => addComponentInstance(c, -1)];
    const rejected = attempts.map(fn => { try { fn(); return false; } catch { return true; } });
    return { rejected, unchanged: before === JSON.stringify(getComponentDefinition(c)), sameHistory: history === undoHistory.length };
  });
  expect(result).toEqual({ rejected: [true, true, true, true, true, true], unchanged: true, sameHistory: true });
});

test("retains missing source and variant IDs without substituting a replacement", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const owner = currentComponent.id;
    const source = addComponent().id;
    addVariant();
    const variantId = variantModel.getVariants().at(-1).id;
    const instance = addComponentInstance(owner, source, { variantId });
    const definition = getComponentDefinition(source);
    definition.variants = definition.variants.filter(v => v.id !== variantId);
    updateComponentDefinition(source, definition);
    const missingVariant = getComponentInstanceStatus(instance).status;
    undoWorkspaceChange();
    const recoveredVariant = getComponentInstanceStatus(instance).status;
    selectComponentState(source);
    deleteSelectedComponent();
    const missingComponent = getComponentInstanceStatus(instance).status;
    const preserved = getComponentDefinition(owner).layers[0].variantId === variantId;
    undoWorkspaceChange();
    const recoveredComponent = getComponentInstanceStatus(instance).status;
    return { missingVariant, recoveredVariant, missingComponent, preserved, recoveredComponent };
  });
  expect(result).toEqual({ missingVariant: "missing-variant", recoveredVariant: "ready", missingComponent: "missing-component", preserved: true, recoveredComponent: "ready" });
});

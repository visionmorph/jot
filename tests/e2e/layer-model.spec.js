const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

async function createMixedTree(page) {
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, { textContent: "Label", beginEditing: false, isNew: false });
    createCanvasVector({ name: "Icon", width: 24, height: 24, source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' }, 0, 0, frame, { select: false });
    addVariant();
    upsertLocalVariantOverride(variantModel.getVariants()[1], "text:1", "color", "#336699");
    selectCanvasFrame(frame.element);
  });
}

test("migrates split collections and preserves typed IDs, order, selection and variants", async ({ page }) => {
  await openApp(page);
  await createMixedTree(page);
  const result = await page.evaluate(() => {
    selectVariantState(variantModel.getVariants()[1].id, "text:1");
    const legacy = captureWorkspaceState();
    const variants = structuredClone(legacy.variants);
    legacy.schemaVersion = 1;
    for (const [type, collection] of [["frame", "frames"], ["text", "texts"], ["vector", "vectors"]]) {
      legacy[collection] = legacy.layers.filter((node) => node.type === type).map((node) => {
        const entry = { ...node };
        delete entry.type;
        if (type !== "frame") { entry.parentFrameId = entry.parentId; delete entry.parentId; }
        return entry;
      });
    }
    delete legacy.layers;
    restoreWorkspaceState(JSON.parse(JSON.stringify(legacy)));
    const saved = captureWorkspaceState();
    return {
      version: saved.schemaVersion,
      nodes: saved.layers.map(({ type, id, parentId }) => ({ type, id, parentId })),
      children: getLayerChildren(1).map(({ type, record }) => `${type}:${record.id}`),
      selection: selectedVariantLayerTarget,
      sameVariants: JSON.stringify(saved.variants) === JSON.stringify(variants),
      clean: !["frames", "texts", "vectors"].some((key) => Object.hasOwn(saved, key))
        && saved.layers.every((node) => !Object.hasOwn(node, "parentFrameId")),
    };
  });
  expect(result).toEqual({ version: 4, nodes: [
    { type: "frame", id: 1, parentId: null },
    { type: "text", id: 1, parentId: 1 },
    { type: "vector", id: 1, parentId: 1 },
  ], children: ["text:1", "vector:1"], selection: "text:1", sameVariants: true, clean: true });
});

test("duplicates and deletes a mixed subtree with override cleanup and undo", async ({ page }) => {
  await openApp(page);
  await createMixedTree(page);
  const result = await page.evaluate(() => {
    const originalHistory = undoHistory.length;
    duplicateSelectedLayer();
    const copyChildren = getLayerChildren(2).map(({ type, record }) => `${type}:${record.id}`);
    const variantId = variantModel.getVariants()[1].id;
    const copiedOverride = getLocalVariantOverride(getVariant(variantId), "text:2", "color")?.value;
    componentProps.push({ id: nextComponentPropId++, type: "string", name: "label", property: "textContent", targetTextId: 2, defaultValue: "Label" });
    const before = JSON.stringify(captureWorkspaceState().layers);
    const historyBeforeDelete = undoHistory.length;
    deleteLayers([{ type: "frame", id: 2 }, { type: "text", id: 2 }]);
    const remaining = layerRecords.map((record) => `${record.type}:${record.id}`);
    const cleaned = !getLocalVariantOverride(getVariant(variantId), "text:2", "color")
      && !componentProps.some((prop) => prop.targetTextId === 2);
    const oneDelete = undoHistory.length === historyBeforeDelete + 1;
    undoWorkspaceChange();
    const restored = JSON.stringify(captureWorkspaceState().layers) === before
      && getLocalVariantOverride(getVariant(variantId), "text:2", "color")?.value === "#336699"
      && componentProps.some((prop) => prop.targetTextId === 2);
    redoWorkspaceChange();
    return { copyChildren, copiedOverride, remaining, cleaned, restored, oneDelete,
      oneDuplicate: historyBeforeDelete === originalHistory + 1, finalCount: layerRecords.length };
  });
  expect(result).toEqual({ copyChildren: ["text:2", "vector:2"], copiedOverride: "#336699",
    remaining: ["frame:1", "text:1", "vector:1"], cleaned: true, restored: true,
    oneDelete: true, oneDuplicate: true, finalCount: 3 });
});

test("shared move operations reject missing parents, cycles and non-container targets atomically", async ({ page }) => {
  await openApp(page);
  await createMixedTree(page);
  const result = await page.evaluate(() => {
    const child = createCanvasFrame(0, 0, getFrameRecord(1), { select: false });
    const before = JSON.stringify(captureWorkspaceState());
    const historySize = undoHistory.length;
    const attempts = [
      moveLayer({ type: "frame", id: 1 }, child.id, 0),
      moveLayer({ type: "text", id: 1 }, 999, 0),
      moveLayers([{ type: "text", id: 1 }, { type: "vector", id: 1 }], 999, 0),
      moveLayerRelative({ type: "vector", id: 1 }, { type: "text", id: 1 }, "inside"),
      moveLayer({ type: "unknown", id: 1 }, null, 0),
    ];
    return { attempts, same: JSON.stringify(captureWorkspaceState()) === before, sameHistory: undoHistory.length === historySize };
  });
  expect(result).toEqual({ attempts: [false, false, false, false, false], same: true, sameHistory: true });
});

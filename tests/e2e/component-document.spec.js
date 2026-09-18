const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("round trips plain component data into fresh interactive layers and preserves history", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    frame.element.dataset.direction = "vertical";
    frame.element.style.padding = "17px";
    const text = createCanvasText(frame, 0, 0, { textContent: "Account", beginEditing: false, isNew: false });
    text.element.innerHTML = '<span data-rich-text-color="#FF0000" style="color: rgb(255, 0, 0)">Account</span>';
    createCanvasVector({ name: "Icon", width: 24, height: 24, source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>' }, 0, 0, frame);
    componentProps.push({ id: nextComponentPropId++, name: "label", type: "string", property: "textContent", targetTextId: text.id, defaultValue: "Account" });
    addVariant();
    const variant = variantModel.getVariants()[1];
    upsertLocalVariantOverride(variant, `text:${text.id}`, "color", "#336699");
    selectVariantState(variant.id, `text:${text.id}`);
    const snapshot = captureWorkspaceState();
    const oldElements = [...frameRecords, ...textRecords, ...vectorRecords].map((record) => record.element);
    const parsed = JSON.parse(JSON.stringify(snapshot));
    restoreWorkspaceState(parsed);
    const fresh = [...frameRecords, ...textRecords, ...vectorRecords].every((record) => !oldElements.includes(record.element));
    const restored = captureWorkspaceState();
    const same = JSON.stringify(restored) === JSON.stringify(parsed);
    selectCanvasFrame(getFrameRecord(frame.id).element);
    recordHistory();
    getFrameRecord(frame.id).element.style.padding = "29px";
    undoWorkspaceChange();
    const undo = getFrameRecord(frame.id).element.style.padding;
    redoWorkspaceChange();
    const redo = getFrameRecord(frame.id).element.style.padding;
    selectCanvasState();
    getTextRecord(text.id).element.click();
    return { fresh, same, undo, redo, selectedText: getSelectedLayerKeys(), plain: !JSON.stringify(snapshot).includes('"record":') };
  });
  expect(result).toEqual({ fresh: true, same: true, undo: "17px", redo: "29px", selectedText: ["text:1"], plain: true });
});

test("reads, edits and renders an inactive definition without changing the active canvas", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const sourceId = currentComponent.id;
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Account", beginEditing: false, isNew: false });
    const sourceText = getTextRecord(1).element;
    addComponent();
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Tabs", beginEditing: false, isNew: false });
    const activeId = currentComponent.id;
    const activeElement = getTextRecord(1).element;
    const before = JSON.stringify(captureWorkspaceState());
    const definition = getComponentDefinition(sourceId);
    sourceText.textContent = "Discarded old view";
    const first = renderComponentDefinition(definition);
    const second = renderComponentDefinition(JSON.parse(JSON.stringify(definition)));
    first.querySelector('[data-text-id="1"]').textContent = "Only first view";
    const isolated = second.textContent === "Account" && getComponentDefinition(sourceId).layers[0].textContent === "Account";
    definition.layers[0].textContent = "Billing";
    definition.layers[0].richTextHtml = "Billing";
    definition.layers[0].attributes["aria-label"] = "Billing";
    updateComponentDefinition(sourceId, definition);
    const unchanged = currentComponent.id === activeId && getTextRecord(1).element === activeElement
      && JSON.stringify(captureWorkspaceState()) === before;
    const updated = renderComponentDefinition(getComponentDefinition(sourceId)).textContent;
    activateComponent(sourceId);
    const activated = getTextRecord(1).element.textContent;
    undoWorkspaceChange();
    const undone = getTextRecord(1).element.textContent;
    return { isolated, unchanged, updated, activated, undone };
  });
  expect(result).toEqual({ isolated: true, unchanged: true, updated: "Billing", activated: "Billing", undone: "Account" });
});

test("rejects broken hierarchy and duplicate IDs before touching canvas or history", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    saveCurrentComponentWorkspace();
    const original = getComponentDefinition(currentComponent.id);
    const element = getFrameRecord(1).element;
    const historySize = undoHistory.length;
    const failures = [
      (definition) => { definition.layers[0].parentId = 1; },
      (definition) => { definition.layers[0].parentId = 999; },
      (definition) => { definition.layers.push(structuredClone(definition.layers[0])); },
      (definition) => { definition.schemaVersion = 999; },
    ].map((change) => {
      const definition = structuredClone(original);
      change(definition);
      try { updateComponentDefinition(currentComponent.id, definition); return false; }
      catch { return true; }
    });
    return { failures, sameElement: getFrameRecord(1).element === element, sameHistory: undoHistory.length === historySize,
      sameDefinition: JSON.stringify(original) === JSON.stringify(getComponentDefinition(currentComponent.id)) };
  });
  expect(result).toEqual({ failures: [true, true, true, true], sameElement: true, sameHistory: true, sameDefinition: true });
});

test("legacy layer records migrate without retaining elements or sharing data", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord);
    const snapshot = captureWorkspaceState();
    delete snapshot.schemaVersion;
    snapshot.layers[0].record = frame;
    delete snapshot.layers[0].id;
    snapshot.frames = snapshot.layers;
    delete snapshot.layers;
    restoreWorkspaceState(snapshot);
    snapshot.frames[0].dataset.width = "999";
    const saved = structuredClone(captureWorkspaceState());
    return { id: saved.layers[0].id, hasRecord: Object.hasOwn(saved.layers[0], "record"), width: saved.layers[0].dataset.width };
  });
  expect(result).toEqual({ id: 1, hasRecord: false, width: "100" });
});

test("normal inspector edits commit to plain definitions", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Hello", beginEditing: false, isNew: false }));
  await page.evaluate(() => { getTextRecord(1).element.textContent = "Updated"; });
  await expect.poll(() => page.evaluate(() => getComponentDefinition(currentComponent.id).layers[0].textContent)).toBe("Updated");
});

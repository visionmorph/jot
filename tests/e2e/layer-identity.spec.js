const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("resolves stable repeated and nested placements without confusing their source", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const defs = new Map([
      [1, { componentId: 1, layers: [
        { type: "component-instance", id: 10, sourceComponentId: 2, name: "First", order: 1 },
        { type: "component-instance", id: 20, sourceComponentId: 2, name: "Second", order: 2 },
      ] }],
      [2, { componentId: 2, layers: [
        { type: "text", id: 1, textContent: "Label" },
        { type: "component-instance", id: 30, sourceComponentId: 3 },
      ] }],
      [3, { componentId: 3, layers: [{ type: "text", id: 1, textContent: "Nested" }] }],
    ]);
    const read = (id) => defs.get(id);
    const source = createSourceLayerIdentity(2, "text", 1);
    const first = createPlacedLayerIdentity(1, [10], source);
    const second = createPlacedLayerIdentity(1, [20], source);
    const nested = createPlacedLayerIdentity(1, [20, 30], createSourceLayerIdentity(3, "text", 1));
    const firstKey = getLayerIdentityKey(first);
    defs.get(1).layers.reverse();
    defs.get(1).layers.forEach((node, index) => { node.name = "Renamed"; node.order = index; });
    const selection = createLayerIdentitySelection([first, second, JSON.parse(JSON.stringify(first))], second);
    const selected = selection.identities.map((identity) => resolveLayerIdentity(identity, read)?.node.textContent);
    const resolvedNested = resolveLayerIdentity(nested, read)?.node.textContent;
    defs.get(2).layers.push({ type: "component-instance", id: 40, sourceComponentId: 1 });
    const cycle = createPlacedLayerIdentity(1, [10, 40], createSourceLayerIdentity(1, "component", 0));
    const wrongSource = createPlacedLayerIdentity(1, [10], createSourceLayerIdentity(3, "text", 1));
    const cycleRejected = resolveLayerIdentity(cycle, read) === null;
    const wrongSourceRejected = resolveLayerIdentity(wrongSource, read) === null;
    defs.get(1).layers = defs.get(1).layers.filter((node) => node.id !== 10);
    return {
      distinct: !sameLayerIdentity(first, second), sameSource: sameLayerSource(first, second),
      stableKey: firstKey === getLayerIdentityKey(JSON.parse(JSON.stringify(first))), selected, resolvedNested,
      primary: sameLayerIdentity(selection.primaryIdentity, second), cycleRejected, wrongSourceRejected,
      deletedRejected: resolveLayerIdentity(first, read) === null,
      secondStillResolves: Boolean(resolveLayerIdentity(second, read)),
    };
  });
  expect(result).toEqual({ distinct: true, sameSource: true, stableKey: true, selected: ["Label", "Label"],
    resolvedNested: "Nested", primary: true, cycleRejected: true, wrongSourceRejected: true,
    deletedRejected: true, secondStillResolves: true });
});

test("DOM lookup isolates repeated labels and never crosses an instance boundary implicitly", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    const root = document.createElement("div");
    setRenderedLayerScope(root, 1);
    const ownLabel = document.createElement("div");
    ownLabel.dataset.textId = "1";
    ownLabel.textContent = "Owner";
    root.append(ownLabel);
    const source = createSourceLayerIdentity(2, "text", 1);
    const identities = [10, 20].map((id) => createPlacedLayerIdentity(1, [id], source));
    for (const id of [10, 20]) {
      const child = document.createElement("div");
      setRenderedLayerScope(child, 1, 2, [id]);
      const label = document.createElement("div");
      label.dataset.textId = "1";
      label.textContent = String(id);
      child.append(label);
      root.append(child);
    }
    const values = identities.map((identity) => findVariantTarget(root, identity)?.textContent);
    applyVariantOperation(root, { target: identities[1], property: "textContent", value: "Changed" });
    const changed = identities.map((identity) => findVariantTarget(root, getLayerIdentityKey(identity))?.textContent);
    return { values, changed, owner: findVariantTarget(root, "text:1")?.textContent,
      noImplicitChild: findVariantTarget(root, source) === null,
      noMissingFallback: findVariantTarget(root, createPlacedLayerIdentity(1, [999], source)) === null };
  });
  expect(result).toEqual({ values: ["10", "20"], changed: ["10", "Changed"], owner: "Owner", noImplicitChild: true, noMissingFallback: true });
});

test("migrates local selection, rules and overrides into qualified snapshot references", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Label", beginEditing: false, isNew: false });
    addVariant();
    const variantId = variantModel.getVariants()[1].id;
    upsertLocalVariantOverride(getVariant(variantId), "text:1", "color", "#336699");
    const legacy = captureWorkspaceState();
    legacy.schemaVersion = 2;
    legacy.variants[1].overrides[0].target = "text:1";
    legacy.variantRules = [{ id: 1, target: "text:1", property: "color", value: "#000000", conditions: { 1: true } }];
    legacy.selection = { kind: "layers", componentId: currentComponent.id, keys: ["text:1"], primaryKey: "text:1" };
    restoreWorkspaceState(legacy);
    const saved = captureWorkspaceState();
    const source = createSourceLayerIdentity(currentComponent.id, "text", 1);
    const placed = createPlacedLayerIdentity(currentComponent.id, [], source);
    const selectionBefore = getSelectedLayerIdentities();
    const overrideValue = getLocalVariantOverride(getVariant(variantId), source, "color")?.value;
    duplicateSelectedLayer();
    const copied = captureWorkspaceState().variants[1].overrides.find((override) => override.target.id === 2);
    undoWorkspaceChange();
    const restored = sameLayerIdentity(getSelectedLayerIdentities()[0], placed);
    return { schema: saved.schemaVersion, selection: sameLayerIdentity(saved.selection.keys[0], placed),
      sourceOverride: sameLayerIdentity(saved.variants[1].overrides[0].target, source),
      sourceRule: sameLayerIdentity(saved.variantRules[0].target, source),
      selectionBefore: sameLayerIdentity(selectionBefore[0], placed), overrideValue,
      copiedId: copied.target.id, copiedComponentId: copied.target.componentId, componentId: currentComponent.id, restored };
  });
  expect(result).toMatchObject({ schema: 4, selection: true, sourceOverride: true, sourceRule: true,
    selectionBefore: true, overrideValue: "#336699", copiedId: 2, restored: true });
  expect(result.copiedComponentId).toBe(result.componentId);
});

test("foreign and nested addresses cannot select or resolve a same-ID active layer", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    createCanvasText(currentComponent.frameRecord, 0, 0, { textContent: "Local", beginEditing: false, isNew: false });
    addVariant();
    selectLayerKeys(["text:1"]);
    const local = createSourceLayerIdentity(currentComponent.id, "text", 1);
    const foreign = createSourceLayerIdentity(currentComponent.id + 1, "text", 1);
    const nested = createPlacedLayerIdentity(currentComponent.id, [10], foreign);
    const before = JSON.stringify(captureSelectionState());
    const rejected = [foreign, nested].every((identity) => !selectLayerKeys([identity])
      && !selectVariantsLayerTargetsState([1, 2], [identity])
      && getElementForLayerKey(identity) === null && getLayerRecord(identity) === null);
    return { rejected, unchanged: before === JSON.stringify(captureSelectionState()),
      local: getLayerRecord(local) === getTextRecord(1),
      needsExplicitOwner: (() => { try { normalizeLayerIdentity("text:1"); return false; } catch { return true; } })() };
  });
  expect(result).toEqual({ rejected: true, unchanged: true, local: true, needsExplicitOwner: true });
});

test("placed overrides stay separate through JSON restoration", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    addVariant();
    const variantId = variantModel.getVariants()[1].id;
    const source = createSourceLayerIdentity(2, "text", 1);
    const first = createPlacedLayerIdentity(currentComponent.id, [10], source);
    const second = createPlacedLayerIdentity(currentComponent.id, [20], source);
    upsertLocalVariantOverride(getVariant(variantId), first, "color", "#112233");
    upsertLocalVariantOverride(getVariant(variantId), second, "color", "#445566");
    const snapshot = JSON.parse(JSON.stringify(captureWorkspaceState()));
    restoreWorkspaceState(snapshot);
    return { values: [first, second].map((identity) => getEffectiveVariantOverride(getVariant(variantId), identity, "color")?.value),
      paths: snapshot.variants[1].overrides.map((override) => override.target.instancePath),
      localMissing: getLocalVariantOverride(getVariant(variantId), "text:1", "color") === null };
  });
  expect(result).toEqual({ values: ["#112233", "#445566"], paths: [[10], [20]], localMissing: true });
});

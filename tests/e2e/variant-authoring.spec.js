const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");

test("hovering a variant label triggers the preview root hover state", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    addVariant();
    clearLayerSelection();
  });

  const preview = page.locator(".variant-preview").first();
  const root = preview.locator(".canvas-root-stack");
  await page.mouse.move(1, 1);
  await expect(root).toHaveCSS("outline-style", "none");
  await preview.locator(".variant-preview-label").hover();
  await expect(root).toHaveCSS("outline-style", "solid");
  await expect(root).toHaveCSS("outline-width", "1px");
});

test("variant labels omit default states and compact active states", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    addComponentProp("enum");
    const interactionProp = componentProps.at(-1);
    interactionProp.name = "Interaction";
    interactionProp.property = "state";
    interactionProp.options = ["default", "hover"];
    interactionProp.defaultValue = "default";
    syncComponentPropVariantDefinition(interactionProp, { render: false });

    addComponentProp("enum");
    const focusProp = componentProps.at(-1);
    focusProp.name = "Focus";
    focusProp.property = "focus";
    focusProp.options = ["none", "focus"];
    focusProp.defaultValue = "none";
    syncComponentPropVariantDefinition(focusProp, { render: false });

    addComponentProp("boolean");
    const selectedProp = componentProps.at(-1);
    selectedProp.name = "Selected";
    selectedProp.property = "selected";
    selectedProp.defaultValue = false;
    syncComponentPropVariantDefinition(selectedProp, { render: false });

    addVariant({ render: false });
    const activeVariant = addVariant({ render: false });
    setVariantPropValue(activeVariant, interactionProp.variantPropId, "hover");
    setVariantPropValue(activeVariant, focusProp.variantPropId, "focus");
    setVariantBooleanValue(activeVariant,
      variantModel.getProps().find((candidate) => candidate.id === selectedProp.variantPropId), true);
    renderVariants();
  });

  await expect(page.locator(".variant-preview-label")).toHaveText([
    "Base component",
    "Variant 1",
    "hover-focus-selected",
  ]);
});

test("a lone component preview keeps the component tree name after props are added", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    currentComponent.name = "Card";
    addComponentProp("boolean");
    const prop = componentProps.at(-1);
    prop.name = "Selected";
    prop.property = "selected";
    prop.defaultValue = false;
    syncComponentPropVariantDefinition(prop, { render: false });
    renderTree();
  });

  await expect(page.locator("[data-component-preview-label]")).toHaveText("Card");
  await expect(page.locator(".variant-preview")).toHaveCount(0);
  await expect(page.locator(".tree-node--component .tree-node-label")).toHaveText("Card");
});

test("state-less variant labels follow preview order and omit copy names", async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    const first = addVariant({ render: false });
    const second = addVariant({ render: false });
    renderVariants();
    return { first: first.id, second: second.id };
  });

  const labelFor = (id) => page.locator(`.variant-preview[data-variant-id="${id}"] .variant-preview-label`);
  await expect(labelFor(ids.first)).toHaveText("Variant 1");
  await expect(labelFor(ids.second)).toHaveText("Variant 2");

  await page.evaluate((secondId) => reorderVariant(secondId, 1), ids.second);
  await expect(labelFor(ids.second)).toHaveText("Variant 1");
  await expect(labelFor(ids.first)).toHaveText("Variant 2");

  await page.locator(`.variant-preview[data-variant-id="${ids.second}"]`).focus();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator(".variant-preview-label")).toHaveText([
    "Base component",
    "Variant 1",
    "Variant 2",
    "Variant 3",
  ]);
});

test("reordering no-props variants promotes the first preview to the inheritance base", async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    ensureInitialVariant();
    const first = addVariant({ render: false });
    const second = addVariant({ render: false });
    const authoredBase = variantModel.getVariants()[0];
    upsertLocalVariantOverride(authoredBase, "component:0", "backgroundColor", "#ff0000");
    upsertLocalVariantOverride(first, "component:0", "gap", "20px");
    upsertLocalVariantOverride(second, "component:0", "borderRadius", "8px");
    renderVariants();
    return { base: authoredBase.id, first: first.id, second: second.id };
  });

  await page.evaluate((secondId) => reorderVariant(secondId, 0), ids.second);

  await expect(page.locator(`.variant-preview[data-variant-id="${ids.second}"] .variant-preview-label`))
    .toHaveText("Base component");
  await expect.poll(() => page.evaluate(({ base, first, second }) => {
    const variants = Object.fromEntries(variantModel.getVariants().map((variant) => [variant.id, variant]));
    return {
      order: variantModel.getVariants().map((variant) => variant.id),
      newBaseParent: variants[second].parentVariantId,
      oldBaseParent: variants[base].parentVariantId,
      firstParent: variants[first].parentVariantId,
      newBaseOverrides: resolveVariantOperations(variants[second])
        .map(({ target, property, value }) => ({ target, property, value })),
    };
  }, ids)).toEqual({
    order: [ids.second, ids.base, ids.first],
    newBaseParent: null,
    oldBaseParent: ids.second,
    firstParent: ids.second,
    newBaseOverrides: [
      { target: "component:0", property: "backgroundColor", value: "#ff0000" },
      { target: "component:0", property: "gap", value: "20px" },
      { target: "component:0", property: "borderRadius", value: "8px" },
    ],
  });
});

test("reordering variants with props preserves the authored base and inheritance", async ({ page }) => {
  await openApp(page);
  const ids = await page.evaluate(() => {
    addComponentProp("enum");
    const interactionProp = componentProps.at(-1);
    interactionProp.name = "Interaction";
    interactionProp.property = "state";
    interactionProp.options = ["default", "hover"];
    interactionProp.defaultValue = "default";
    syncComponentPropVariantDefinition(interactionProp, { render: false });
    addComponentProp("boolean");
    const selectedProp = componentProps.at(-1);
    selectedProp.name = "Selected";
    selectedProp.property = "selected";
    selectedProp.defaultValue = false;
    syncComponentPropVariantDefinition(selectedProp, { render: false });

    ensureInitialVariant();
    const base = getAuthoredDefaultVariant();
    const promoted = addVariant({ render: false });
    setVariantPropValue(promoted, interactionProp.variantPropId, "hover");
    setVariantBooleanValue(promoted,
      variantModel.getProps().find((prop) => prop.id === selectedProp.variantPropId), true);
    upsertLocalVariantOverride(base, "component:0", "backgroundColor", "#ff0000");
    upsertLocalVariantOverride(promoted, "component:0", "borderRadius", "8px");
    renderVariants();
    return { base: base.id, promoted: promoted.id };
  });

  await page.evaluate((promotedId) => reorderVariant(promotedId, 0), ids.promoted);

  await expect(page.locator(`.variant-preview[data-variant-id="${ids.base}"] .variant-preview-label`))
    .toHaveText("Base component");
  await expect.poll(() => page.evaluate(({ base, promoted }) => {
    const interactionProp = componentProps.find((prop) => prop.name === "Interaction");
    const selectedProp = componentProps.find((prop) => prop.name === "Selected");
    const interactionAxis = variantModel.getProps().find((prop) => prop.id === interactionProp.variantPropId);
    const selectedAxis = variantModel.getProps().find((prop) => prop.id === selectedProp.variantPropId);
    return {
      defaultVariant: getAuthoredDefaultVariant()?.id,
      interactionOptions: interactionProp.options,
      interactionDefault: getVariantPropDefaultValue(interactionAxis),
      selectedDefault: getVariantPropDefaultValue(selectedAxis),
      promotedParent: getVariant(promoted).parentVariantId,
      oldBaseParent: getVariant(base).parentVariantId,
    };
  }, ids)).toEqual({
    defaultVariant: ids.base,
    interactionOptions: ["default", "hover"],
    interactionDefault: "default",
    selectedDefault: false,
    promotedParent: ids.base,
    oldBaseParent: null,
  });
});

test("restores legacy variant names and captures only the new snapshot names", async ({ page }) => {
  await openApp(page);
  const result = await page.evaluate(() => {
    addVariant();
    const variants = structuredClone(variantModel.getVariants());
    const snapshot = captureWorkspaceState();
    snapshot.variantModelVersion = 3;
    snapshot.variantInstances = snapshot.variants;
    snapshot.nextVariantInstanceId = snapshot.nextVariantId;
    delete snapshot.variants;
    delete snapshot.nextVariantId;
    const ids = variants.map((variant) => variant.id);
    snapshot.selection = {
      kind: "variants",
      componentId: currentComponent.id,
      instanceIds: ids,
      primaryInstanceId: ids[1],
      targetsByInstance: Object.fromEntries(ids.map((id) => [id, []])),
    };
    restoreWorkspaceState(snapshot);
    const restored = captureWorkspaceState();
    const restoredIds = getSelectedVariantIds();
    snapshot.selection = { kind: "variant", componentId: currentComponent.id, instanceId: ids[1] };
    restoreWorkspaceState(snapshot);
    const singleId = selectedVariantId;
    delete snapshot.selection;
    snapshot.selectedVariantInstanceId = ids[0];
    restoreWorkspaceState(snapshot);
    const legacyId = selectedVariantId;
    const added = addVariant();
    return {
      sameVariants: JSON.stringify(restored.variants) === JSON.stringify(variants),
      version: restored.variantModelVersion,
      clean: !Object.hasOwn(restored, "variantInstances") && !Object.hasOwn(restored, "nextVariantInstanceId")
        && !Object.hasOwn(restored.selection, "instanceIds") && !Object.hasOwn(restored.selection, "targetsByInstance"),
      restoredIds, ids, singleId, legacyId,
      nextIdPreserved: added.id === restored.nextVariantId,
    };
  });
  expect(result.sameVariants).toBe(true);
  expect(result.version).toBe(4);
  expect(result.clean).toBe(true);
  expect(result.restoredIds).toEqual(result.ids);
  expect(result.singleId).toBe(result.ids[1]);
  expect(result.legacyId).toBe(result.ids[0]);
  expect(result.nextIdPreserved).toBe(true);
});

for (const handleSelector of ['[data-padding-handle="left"]', '[data-gap-handle]']) {
  test(`keeps first-click variant selection when ${handleSelector} appears before release`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      createCanvasText(currentComponent.frameRecord, 0, 0, { beginEditing: false, isNew: false, textContent: "One" });
      createCanvasText(currentComponent.frameRecord, 0, 0, { beginEditing: false, isNew: false, textContent: "Two" });
      addVariant();
      selectVariant(variantModel.getVariants()[0].id, { render: false });
    });
    const handle = page.locator(handleSelector).first();
    await expect(handle).toBeVisible();
    const bounds = await handle.boundingBox();
    await page.evaluate(() => clearLayerSelection());
    await expect(page.locator(".resize-overlay")).toBeHidden();

    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await expect(handle).toBeVisible();
    await expect.poll(() => page.evaluate(() => getSelectedVariantIds())).toEqual([1]);
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => getSelectedVariantIds())).toEqual([1]);
    await expect(handle).toBeVisible();

    await page.getByRole("region", { name: "Canvas" }).click({ position: { x: 20, y: 20 } });
    await expect.poll(() => page.evaluate(() => getSelectedVariantIds())).toEqual([]);
    await expect(page.locator(".resize-overlay")).toBeHidden();
  });
}

test("clicking variant spacing handles selects the whole variant without editing spacing", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    frame.element.style.gap = "20px";
    frame.element.dataset.gap = "20";
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "One" });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Two" });
    addVariant();
    selectVariant(variantModel.getVariants()[0].id, { render: false, layerTarget: "frame:1" });
  });

  await page.locator('[data-padding-handle="left"]').click();
  await expect.poll(() => page.evaluate(() => getSelectedVariantLayerTargets())).toEqual([]);
  await expect.poll(() => page.evaluate(() => getLocalVariantOverride(
    variantModel.getVariants()[0], "frame:1", "paddingLeft",
  ))).toBeNull();

  await page.evaluate(() => {
    selectVariant(variantModel.getVariants()[0].id, { render: false, layerTarget: "frame:1" });
  });
  await page.locator('[data-gap-handle]').first().click();
  await expect.poll(() => page.evaluate(() => getSelectedVariantLayerTargets())).toEqual([]);
  await expect.poll(() => page.evaluate(() => getLocalVariantOverride(
    variantModel.getVariants()[0], "frame:1", "gap",
  ))).toBeNull();
});

test("shows and independently edits colors across drilled-down variants", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    frame.element.dataset.frameColor = "";
    frame.element.style.backgroundColor = "";
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
    for (let index = 0; index < 2; index += 1) addVariant();
    variantModel.getVariants().forEach((variant, index) => {
      upsertLocalVariantOverride(variant, "text:1", "color", ["#ff0000", "#0000ff", "#00ff00"][index]);
    });
    selectVariantsState(variantModel.getVariants().slice(0, 2).map((variant) => variant.id));
    renderTree();
  });
  await page.locator(".variant-preview").nth(1).focus();
  const colors = page.locator('[data-selection-colors] [data-color-hex]');
  for (const type of ["frame", "text"]) {
    await page.keyboard.press("Enter");
    await expect(page.locator(`.variant-preview .canvas-${type}.is-selected`)).toHaveCount(2);
    await expect(colors).toHaveCount(2);
    await expect.poll(() => colors.evaluateAll((inputs) => inputs.map((input) => input.value.toLowerCase()).sort()))
      .toEqual(["0000ff", "ff0000"]);
  }
  const red = page.locator('[data-selection-colors] [data-color-hex]').filter({ visible: true });
  const redIndex = await colors.evaluateAll((inputs) => inputs.findIndex((input) => input.value.toLowerCase() === "ff0000"));
  await red.nth(redIndex).fill("ffaa00");
  await red.nth(redIndex).press("Enter");
  const texts = page.locator(".variant-preview .canvas-text");
  await expect(texts.nth(0)).toHaveCSS("color", "rgb(255, 170, 0)");
  await expect(texts.nth(1)).toHaveCSS("color", "rgb(0, 0, 255)");
  await expect(texts.nth(2)).toHaveCSS("color", "rgb(0, 255, 0)");
  await page.keyboard.press("Control+z");
  await expect(texts.nth(0)).toHaveCSS("color", "rgb(255, 0, 0)");
});

test("duplicating four variant roots matches paste without nesting layers", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Button" });
    for (let index = 0; index < 3; index += 1) addVariant();
    variantModel.getVariants().forEach((variant, index) => {
      upsertLocalVariantOverride(variant, `text:1`, "color", ["#ff0000", "#00ff00", "#0000ff", "#ffffff"][index]);
    });
    selectVariantsState(variantModel.getVariants().map((variant) => variant.id));
    renderTree();
  });
  await page.locator(".variant-preview").first().focus();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+d");
  await expect(page.locator(".variant-preview")).toHaveCount(8);
  await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(4);
  await expect(page.locator(".variant-preview .variant-preview")).toHaveCount(0);
  await expect(page.locator(".variant-preview .canvas-frame .canvas-frame")).toHaveCount(0);
  await expect(page.locator(".variant-preview .canvas-frame > .canvas-text")).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => [frameRecords.length, textRecords.length])).toEqual([1, 1]);
  const duplicated = await page.evaluate(() => structuredClone(variantModel.getVariants().slice(4)));
  await page.keyboard.press("Control+z");
  await expect(page.locator(".variant-preview")).toHaveCount(4);
  await page.keyboard.press("Control+v");
  await expect(page.locator(".variant-preview")).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => variantModel.getVariants().slice(4))).toEqual(duplicated);
  await page.keyboard.press("Control+z");
  await expect(page.locator(".variant-preview")).toHaveCount(4);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".variant-preview")).toHaveCount(8);
});

for (const action of ["duplicate", "paste"]) {
  test(`${action} creates variants from the original component`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      createCanvasText(currentComponent.frameRecord, 0, 0, {
        beginEditing: false, isNew: false, textContent: "Original content",
      });
      selectComponentState(currentComponent.id);
      renderTree();
    });
    await page.locator("[data-selection-component-id]").first().focus();
    await expect(page.locator(".variant-preview")).toHaveCount(0);
    if (action === "paste") {
      await page.keyboard.press("Control+c");
      await expect(page.locator(".variant-preview")).toHaveCount(0);
      await page.keyboard.press("Control+v");
    } else {
      await page.keyboard.press("Control+d");
    }
    await expect(page.locator(".variant-preview")).toHaveCount(2);
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(1);
    for (const preview of await page.locator(".variant-preview").all()) {
      await expect(preview.locator(".canvas-text")).toHaveText("Original content");
    }
    await page.keyboard.press("Control+z");
    await expect(page.locator(".variant-preview")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => selectionState.kind)).toBe("component");
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".variant-preview")).toHaveCount(2);
  });
}

for (const action of ["duplicate", "paste"]) {
  test(`${action} from the original component preserves layout inheritance`, async ({ page }) => {
    await openApp(page);
    await page.locator("[data-selection-component-id]").first().focus();
    if (action === "paste") {
      await page.keyboard.press("ControlOrMeta+c");
      await page.keyboard.press("ControlOrMeta+v");
    } else {
      await page.keyboard.press("ControlOrMeta+d");
    }

    const roots = page.locator(".variant-preview .canvas-root-stack");
    await expect(roots).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => {
      const [base, copy] = variantModel.getVariants();
      return { baseId: base.id, copyParentId: copy.parentVariantId, copyOverrides: copy.overrides };
    })).toEqual({ baseId: 1, copyParentId: 1, copyOverrides: [] });

    await roots.nth(0).click();
    await page.locator("#frame-gap").fill("18");
    await page.locator("#frame-gap").press("Tab");
    await page.getByRole("spinbutton", { name: "Radius" }).fill("9");
    await page.getByRole("spinbutton", { name: "Radius" }).press("Tab");
    await page.getByRole("textbox", { name: "Horizontal padding" }).fill("24");
    await page.getByRole("textbox", { name: "Horizontal padding" }).press("Tab");
    await page.getByRole("textbox", { name: "Vertical padding" }).fill("16");
    await page.getByRole("textbox", { name: "Vertical padding" }).press("Tab");

    for (const root of await roots.all()) {
      await expect(root).toHaveCSS("gap", "18px");
      await expect(root).toHaveCSS("border-radius", "9px");
      await expect(root).toHaveCSS("padding-left", "24px");
      await expect(root).toHaveCSS("padding-right", "24px");
      await expect(root).toHaveCSS("padding-top", "16px");
      await expect(root).toHaveCSS("padding-bottom", "16px");
    }
    await expect.poll(() => page.evaluate(() => variantModel.getVariants()[1].overrides)).toEqual([]);
  });
}

for (const count of [1, 2]) {
  test(`copies and pastes ${count} variants with keyboard shortcuts`, async ({ page }) => {
    await openApp(page);
    await page.getByRole("button", { name: "Add variant preview" }).click();
    await page.evaluate((count) => {
      const variants = variantModel.getVariants();
      upsertLocalVariantOverride(variants[0], "component", "gap", "27px");
      upsertLocalVariantOverride(variants[1], "component", "gap", "33px");
      selectVariantsState(variants.slice(0, count).map((variant) => variant.id));
      renderTree();
    }, count);
    const expected = await page.evaluate(() => variantModel.getVariants()
      .filter((variant) => getSelectedVariantIds().includes(variant.id))
      .map((variant) => ({ propValues: structuredClone(variant.propValues), overrides: [structuredClone(getEffectiveVariantOverride(variant, "component", "gap"))] })));
    await page.locator(".variant-preview").first().focus();
    await page.keyboard.press("Control+c");
    await expect(page.locator(".variant-preview")).toHaveCount(2);
    await page.evaluate(() => {
      upsertLocalVariantOverride(variantModel.getVariants()[0], "component", "gap", "41px");
      selectCanvasState();
      renderTree();
    });
    await page.keyboard.press("Control+v");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count);
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(count);
    await expect.poll(() => page.evaluate(() => variantModel.getVariants()
      .filter((variant) => getSelectedVariantIds().includes(variant.id))
      .map((variant) => ({ propValues: variant.propValues, overrides: variant.overrides })))).toEqual(expected);
    await page.keyboard.press("Control+v");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count * 2);
    await page.keyboard.press("Control+z");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator(".variant-preview")).toHaveCount(2 + count * 2);
  });
}

for (const shortcut of ["Shift+A"]) {
  test(`wraps variant children with ${shortcut} and preserves selection`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      for (const textContent of ["First", "Second"]) {
        createCanvasText(currentComponent.frameRecord, 0, 0, { beginEditing: false, isNew: false, textContent });
      }
      selectComponentState(currentComponent.id);
      renderTree();
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const ids = await page.evaluate(() => {
      const ids = variantModel.getVariants().map((variant) => variant.id);
      selectVariantsState(ids);
      renderTree();
      return ids;
    });
    await page.locator(".variant-preview").last().focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
    await page.keyboard.press("Control+a");
    await expect(page.locator(".variant-preview .canvas-frame")).toHaveCount(0);
    await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
    await page.keyboard.press(shortcut);
    await expect(page.locator(".variant-preview .canvas-frame.is-selected")).toHaveCount(2);
    await expect.poll(() => page.evaluate(() => getSelectedVariantIds())).toEqual(ids);
    for (const root of await page.locator(".variant-preview .canvas-root-stack").all()) {
      await expect(root.locator(":scope > .canvas-frame > .canvas-text")).toHaveCount(2);
      await expect(root.locator(":scope > .canvas-text")).toHaveCount(0);
    }
    await page.keyboard.press("Control+z");
    await expect(page.locator(".variant-preview .canvas-frame")).toHaveCount(0);
    await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
  });
}

for (const variantCount of [1, 2]) {
  test(`Shift+Enter on focused variant text drills up with ${variantCount} selected variants`, async ({ page }) => {
    await openApp(page);
    const keys = await page.evaluate(() => {
      const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
      const text = createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
      selectComponentState(currentComponent.id);
      renderTree();
      return { frame: `frame:${frame.id}`, text: `text:${text.id}` };
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const ids = await page.evaluate(({ variantCount, keys }) => {
      const ids = variantModel.getVariants().slice(0, variantCount).map((variant) => variant.id);
      selectVariantsLayerTargetsState(ids, [keys.text]);
      renderTree();
      return ids;
    }, { variantCount, keys });
    await page.locator(".variant-preview .canvas-text.is-selected").first().focus();
    if (variantCount > 1) {
      await page.keyboard.press("Enter");
      await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
    }
    await page.keyboard.press("Shift+Enter");
    await expect.poll(() => page.evaluate(() => ({
      ids: getSelectedVariantIds(), targets: getSelectedVariantLayerTargets(),
    }))).toEqual({ ids, targets: [keys.frame] });
    await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
    await expect(page.locator(`[data-selection-layer-key="${keys.frame}"]`)).toHaveAttribute("aria-selected", "true");
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("");
    if (variantCount === 1) {
      await page.keyboard.press("Enter");
      await page.locator(".variant-preview .canvas-text.is-selected").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator('.variant-preview .canvas-text[contenteditable="true"]')).toHaveCount(1);
    }
  });
}

for (const variantCount of [1, 2, 3]) {
for (const collapseDepth of [1, 2, 3]) {
  test(`preserves all children in ${variantCount} variants and collapses Tab at depth ${collapseDepth}`, async ({ page }) => {
    await openApp(page);
    const path = await page.evaluate(() => {
      const path = [[], [], []];
      for (let outerIndex = 0; outerIndex < 2; outerIndex += 1) {
        const outer = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
        path[0].push(`frame:${outer.id}`);
        for (let innerIndex = 0; innerIndex < 2; innerIndex += 1) {
          const inner = createCanvasFrame(0, 0, outer, { select: false });
          path[1].push(`frame:${inner.id}`);
          for (const textContent of ["First", "Second"]) {
            const label = createCanvasText(inner, 0, 0, { beginEditing: false, isNew: false, textContent });
            path[2].push(`text:${label.id}`);
          }
        }
      }
      selectComponentState(currentComponent.id);
      renderTree();
      return path;
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const ids = await page.evaluate((variantCount) => {
      const ids = variantModel.getVariants().slice(0, variantCount).map((variant) => variant.id);
      selectVariantsState(ids, ids[ids.length - 1]);
      renderTree();
      return ids;
    }, variantCount);
    await page.locator(".variant-preview").nth(variantCount - 1).focus();
    for (let depth = 0; depth < collapseDepth; depth += 1) {
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => ({
        ids: getSelectedVariantIds(), targets: getSelectedVariantLayerTargets(),
      }))).toEqual({ ids, targets: path[depth] });
      const type = path[depth][0].split(":")[0];
      await expect(page.locator(`.variant-preview .canvas-${type}.is-selected`)).toHaveCount(variantCount * path[depth].length);
    }
    if (collapseDepth === 3) {
      await page.keyboard.press("Enter");
      await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
    }
    await page.keyboard.press("Tab");
    await expect.poll(() => page.evaluate(() => ({
      ids: getSelectedVariantIds(), targets: getSelectedVariantLayerTargets(),
    }))).toEqual({ ids: [ids[0]], targets: [path[collapseDepth - 1][0]] });
    await expect(page.locator(".variant-preview .is-selected")).toHaveCount(1);
  });
}
}

test("drills every selected variant and frame branch from the layer tree", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    for (let index = 0; index < 2; index += 1) {
      const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
      createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: `Label ${index}` });
    }
    selectComponentState(currentComponent.id);
    renderTree();
  });
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  await page.evaluate(() => {
    const unselected = variantModel.getVariants()[2];
    upsertLocalVariantOverride(unselected, "frame:1", "gap", "16px");
    selectVariantsState(variantModel.getVariants().slice(0, 2).map((variant) => variant.id));
    renderTree();
  });
  const frames = page.locator('[data-selection-layer-key^="frame:"]');
  await frames.nth(0).click();
  await frames.nth(1).click({ modifiers: ["Shift"] });
  await expect(page.locator(".variant-preview .canvas-frame.is-selected")).toHaveCount(4);
  const roots = page.locator(".variant-preview .canvas-root-stack");
  const rootGap = await roots.first().evaluate((element) => getComputedStyle(element).gap);
  await page.locator("#frame-gap").fill("28");
  await page.locator("#frame-gap").press("Tab");
  for (const frame of await page.locator(".variant-preview .canvas-frame.is-selected").all()) {
    await expect(frame).toHaveCSS("gap", "28px");
  }
  await expect(roots.first()).toHaveCSS("gap", rootGap);
  await expect(roots.nth(2).locator(".canvas-frame").first()).toHaveCSS("gap", "16px");
  await frames.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
  await expect(page.locator('[data-selection-layer-key^="text:"].is-selected')).toHaveCount(2);
  await expect(page.locator(".variant-preview").nth(2)).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Enter");
  await expect(page.locator('.variant-preview [contenteditable="true"]')).toHaveCount(0);
  await expect(page.locator(".variant-preview .canvas-text.is-selected")).toHaveCount(4);
  await page.locator('[data-selection-layer-key^="text:"]').first().focus();
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".variant-preview .canvas-frame.is-selected")).toHaveCount(4);
  await page.keyboard.press("Shift+Enter");
  await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
});

test("applies variant component gap after wrapping text and duplicating its frame", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    canvasRootStack.style.padding = "20px";
    const text = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Label",
    });
    selectCanvasText(text.element);
    wrapSelectedLayersInFrame();
    duplicateSelectedLayer();
  });
  await page.locator("[data-selection-component-id]").first().click();
  await page.getByRole("button", { name: "Add variant preview" }).click();
  const roots = page.locator(".variant-preview .canvas-root-stack");
  await expect(roots).toHaveCount(2);
  await roots.nth(0).click({ position: { x: 10, y: 10 } });
  await roots.nth(1).click({ position: { x: 10, y: 10 }, modifiers: ["Shift"] });
  await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
  await page.locator("#frame-gap").fill("32");
  await page.locator("#frame-gap").press("Tab");
  for (const root of await roots.all()) {
    await expect(root).toHaveCSS("gap", "32px");
    await expect.poll(() => root.locator(":scope > .canvas-frame").evaluateAll((elements) => {
      const [first, second] = elements.map((element) => element.getBoundingClientRect());
      return Math.round(second.left - first.right);
    })).toBe(32);
  }
});

for (const selectionMethod of ["shift", "marquee"]) {
  test(`drills selected variant roots down and up after ${selectionMethod} selection`, async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      canvasRootStack.style.padding = "20px";
      const frame = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
      createCanvasText(frame, 0, 0, { beginEditing: false, isNew: false, textContent: "Label" });
      selectComponentState(currentComponent.id);
      renderTree();
    });
    await page.getByRole("button", { name: "Add variant preview" }).click();
    const previews = page.locator(".variant-preview");
    const roots = previews.locator(".canvas-root-stack");
    if (selectionMethod === "shift") {
      const first = await roots.nth(0).boundingBox();
      const second = await roots.nth(1).boundingBox();
      await roots.nth(0).click({ position: { x: first.width - 12, y: first.height - 12 } });
      await roots.nth(1).click({ position: { x: second.width - 12, y: second.height - 12 }, modifiers: ["Shift"] });
    } else {
      const first = await roots.nth(0).boundingBox();
      const last = await roots.nth(1).boundingBox();
      await page.mouse.move(first.x - 4, first.y - 4);
      await page.mouse.down();
      await page.mouse.move(last.x + last.width + 4, Math.max(first.y + first.height, last.y + last.height) + 4, { steps: 8 });
      await page.mouse.up();
    }
    await expect(roots.locator(".canvas-frame.is-selected")).toHaveCount(0);
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
    await page.evaluate(() => {
      expandedFrameIds.clear();
      isComponentExpanded = false;
      renderTree();
    });
    await previews.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(roots.locator(".canvas-frame.is-selected")).toHaveCount(2);
    await expect(page.locator('[data-selection-layer-key="frame:1"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(roots.locator(".canvas-text.is-selected")).toHaveCount(2);
    await expect(page.locator('[data-selection-layer-key="text:1"]')).toBeVisible();
    await expect(page.locator('[data-selection-layer-key="text:1"]')).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Shift+Enter");
    await expect(roots.locator(".canvas-frame.is-selected")).toHaveCount(2);
    await page.keyboard.press("\\");
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
    await page.keyboard.press("Shift+Enter");
    await expect.poll(() => page.evaluate(() => selectionState.kind)).toBe("component");
    await page.keyboard.press("Enter");
    await expect(page.locator(".variant-preview .canvas-root-stack.is-selected")).toHaveCount(2);
  });
}

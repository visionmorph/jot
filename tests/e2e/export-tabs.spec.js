const { test, expect } = require("playwright/test");
const { openApp } = require("../support/open-app.cjs");
const { exportBehavioralTabs, mountGeneratedTabs } = require("../support/export-fixtures.cjs");

test("generates React output with the authored component styles", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => createReactComponentSource("TestComponent"));

  expect(source).toContain("const TestComponent = React.forwardRef(function TestComponent({ className, style, ...rest }, ref)");
  expect(source).toContain("<div {...rest} ref={ref} className={className}");
  expect(source).toContain("...style");
  expect(source).toContain("export default TestComponent;");
  expect(source).toContain('display: "inline-flex"');
  expect(source).toContain('flexDirection: "row"');
  expect(source).toContain('padding: "10px"');
  expect(source).toContain('backgroundColor: "#FFFFFF"');
});

test("exports a semantic Selected Boolean prop on a tab button", async ({ page }) => {
  await openApp(page);
  const sources = await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    addComponentProp("boolean");
    const prop = componentProps.at(-1);
    setBooleanPropProperty(prop, "selected");
    const base = createReactComponentSource("Tab");
    addVariant();
    return { base, variants: createReactComponentSource("Tab") };
  });
  expect(sources.base).toContain('role="tab" aria-selected={selected}');
  expect(sources.variants).toContain('role="tab" aria-selected={selected}');
  expect(sources.base).not.toContain('outline: "none"');
  expect(sources.variants).not.toContain('outline: "none"');
  expect(sources.base).not.toContain("aria-checked=");
});

test("exports disabled tabs with native button semantics", async ({ page }) => {
  await openApp(page);
  const source = await page.evaluate(() => {
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "selected");
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "disabled");
    return createReactComponentSource("Tab");
  });

  expect(source).toContain('disabled={disabled}');
  expect(source).toContain('aria-disabled={disabled || undefined}');
  expect(source).not.toContain('event.preventDefault()');
  expect(source).not.toContain('event.stopPropagation()');
});

test("keeps disabled out of the Interaction state axis", async ({ page }) => {
  await openApp(page);
  const disabledDefault = await page.evaluate(() => {
    currentComponent.frameRecord.element.setAttribute("role", "tablist");
    addComponentProp("enum");
    const stateProp = componentProps.at(-1);
    setEnumComponentPropProperty(stateProp, "state");
    const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
    const stateAxes = getStateVariantAxes();
    const exportProps = getExportComponentProps({
      allocateIdentifier,
      excludedVariantPropIds: new Set(stateAxes.map(axis => axis.id)),
    });
    return getDisabledStateExportProp(allocateIdentifier, exportProps)?.defaultValue;
  });

  expect(disabledDefault).toBeUndefined();
});

test("exports repeated semantic tabs as an accessible data-driven collection", async ({ page }) => {
  await openApp(page);
  const { files, implicitSource, nonVariantSource, verticalSource } = await page.evaluate(() => {
    const tabsId = currentComponent.id;
    const tabItemId = addComponent().id;
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    const text = createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Tab", beginEditing: false, isNew: false });
    addComponentProp("boolean");
    const selected = componentProps.at(-1);
    setBooleanPropProperty(selected, "selected");
    addComponentProp("boolean");
    const disabled = componentProps.at(-1);
    setBooleanPropProperty(disabled, "disabled");
    const selectedAxis = variantModel.getProps().find(axis => axis.id === selected.variantPropId);
    const selectedVariant = addVariant({ render: false });
    setVariantPropValue(selectedVariant, selectedAxis.id, true);
    commitCanvasComponentData();

    activateComponent(tabsId);
    addComponentInstance(tabsId, tabItemId);
    addComponentInstance(tabsId, tabItemId, { variantId: selectedVariant.id });
    const definition = getComponentDefinition(tabsId);
    definition.layers[0].labelOverrides = [{
      target: createSourceLayerIdentity(tabItemId, "text", text.id), value: "Overview",
    }];
    definition.layers[1].labelOverrides = [{
      target: createSourceLayerIdentity(tabItemId, "text", text.id), value: "Profile",
    }];
    definition.layers[0].layerOverrides = [{
      target: createSourceLayerIdentity(tabItemId, "text", text.id), property: "color", value: "#2456AA",
    }];
    updateComponentDefinition(tabsId, definition);
    commitCanvasComponentData();

    const original = downloadExportFile;
    const captureExport = () => {
      const result = {};
      downloadExportFile = (name, content) => { result[name] = content; };
      exportAllComponents();
      return result;
    };
    try {
      const implicitFiles = captureExport();
      currentComponent.frameRecord.element.setAttribute("role", "tablist");
      addComponentProp("boolean");
      setBooleanPropProperty(componentProps.at(-1), "disabled");
      commitCanvasComponentData();
      const nonVariantFiles = captureExport();
      const sizeAxis = variantModel.addProp({ name: "size", type: "enum", options: ["sm", "md"], defaultValue: "sm" });
      const mediumVariant = addVariant({ render: false });
      setVariantPropValue(mediumVariant, sizeAxis.id, "md");
      upsertLocalVariantOverride(mediumVariant, "component:0", "flexDirection", "column");
      commitCanvasComponentData();
      const files = captureExport();
      currentComponent.frameRecord.element.dataset.direction = "vertical";
      currentComponent.frameRecord.element.style.flexDirection = "column";
      commitCanvasComponentData();
      const verticalFiles = captureExport();
      return {
        files,
        implicitSource: implicitFiles["Component1.jsx"],
        nonVariantSource: nonVariantFiles["Component1.jsx"],
        verticalSource: verticalFiles["Component1.jsx"],
      };
    } finally {
      downloadExportFile = original;
    }
  });

  const source = files["Component1.jsx"];
  expect(implicitSource).not.toContain("const baseDefaultItems =");
  expect(implicitSource).not.toContain('role="tablist"');
  expect(nonVariantSource).toContain("const defaultItems =");
  expect(nonVariantSource).not.toContain("const baseDefaultItems =");
  expect(nonVariantSource).not.toContain('const variantStyleAxisOrder');
  expect(nonVariantSource).toContain('const variantClassName = "Component1"');
  expect(nonVariantSource).not.toContain("const styleValues =");
  expect(nonVariantSource).toContain('role="tablist"');
  expect(nonVariantSource).toContain('disabled = false');
  expect(nonVariantSource).toContain('aria-disabled={disabled || undefined}');
  expect(nonVariantSource).toContain('const itemDisabled = disabled || item.disabled');
  expect(nonVariantSource).toContain('const enabledItems = disabled ? [] : resolvedItems.filter(item => !item.disabled)');
  expect(nonVariantSource).toContain('disabled={itemDisabled}');
  expect(nonVariantSource).toContain('if (disabled) return;');
  expect(nonVariantSource).not.toContain('<div disabled={disabled}');
  expect(nonVariantSource).toContain("resolvedItems.map((item, index)");
  expect(source).toContain("const defaultItems =");
  expect(source).not.toContain("const baseDefaultItems =");
  expect(source).not.toContain("const defaultItemVariantDeltas =");
  expect(source).not.toContain("const defaultItemVariantAxisOrder =");
  expect(source).not.toContain("const defaultItemCombinationCorrections =");
  expect(source).toContain('const itemInstanceOverrides = mergeInstanceOverrides(item.instanceOverrides, item.label == null ? {} : { labels: { "text:1": item.label } })');
  expect(source).toContain('"value":"overview","instanceId":1,"selected":false,"label":"Overview"');
  expect(source).toContain('"value":"profile","instanceId":2,"selected":true,"label":"Profile"');
  expect(source).not.toContain('"ariaLabel":"Component 2"');
  expect(source).toContain('"instanceOverrides":{"labels":{"text:1":"Overview"},"styles":{"text:1":{"color":"#2456AA"}}}');
  expect(source).not.toContain("getDefaultItems(");
  expect(source).toContain("const resolvedItems = items ?? defaultItems");
  expect(source).toContain('typeof item.value !== "string"');
  expect(source).toContain("Component1 requires every item.value to be a string.");
  expect(source).toContain("const seenItemValues = new Set()");
  expect(source).toContain("const duplicateItem = resolvedItems.find");
  expect(source).toContain("Component1 requires every item.value to be unique. Duplicate value:");
  expect(source).toContain("selectableItems.find(item => item.selected)?.value");
  expect(source).toContain("const selectableItems = disabled ? resolvedItems : enabledItems");
  expect(source).toContain("const selectedItemIsAvailable = selectableItems.some(item => item.value === selectedValue)");
  expect(source).toContain("const fallbackFocusableValue = disabled || selectedItemIsAvailable ? undefined : enabledItems[0]?.value");
  expect(source).toContain("const activeValue = selectedItemIsAvailable ? selectedValue : disabled ? authoredDefaultValue : isControlled ? undefined : fallbackFocusableValue");
  expect(source).toContain("const selected = item.value === activeValue");
  expect(source).toContain("const isControlled = valueProp !== undefined");
  expect(source).toContain("const selectedValue = isControlled ? valueProp : internalValue");
  expect(source).toContain("if (isControlled || disabled || internalValue === activeValue) return");
  expect(source).toContain("setInternalValue(activeValue)");
  expect(source).not.toContain("lastControlledCorrection");
  expect(source).not.toContain("onValueChange?.(fallbackFocusableValue)");
  expect(source).toContain("if (nextValue === activeValue) return");
  expect(source).not.toContain("Object.is(");
  expect(source).toContain("value: valueProp");
  expect(source).toContain("onValueChange");
  expect(source).toContain('role="tablist"');
  expect(source).not.toContain('orientation = "horizontal"');
  expect(source).toContain('const orientationByVariant = {"$sm":"horizontal","$md":"vertical"}');
  expect(source).toContain('const orientationVariantAxes = ["size"]');
  expect(source).toContain('const getVariantValue = (table, axes, values) =>');
  expect(source).toContain('const orientation = getVariantValue(orientationByVariant, orientationVariantAxes, styleValues) ?? "horizontal"');
  expect(source).toContain('aria-orientation={orientation}');
  expect(source).toContain('const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight"');
  expect(source).toContain('const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft"');
  expect(verticalSource).not.toContain("const orientationByVariant =");
  expect(verticalSource).toContain('const orientation = "vertical"');
  expect(verticalSource).not.toContain("const styleValues =");
  expect(source).toContain("const isFocusable = !itemDisabled && (selected || item.value === fallbackFocusableValue)");
  expect(source).not.toContain("resolvedItems.some(candidate => candidate.value === selectedValue");
  expect(source).toContain("tabIndex={isFocusable ? 0 : -1}");
  expect(source).not.toContain('event.key === "ArrowRight" || event.key === "ArrowDown"');
  expect(source).toContain('event.key === "Home"');
  expect(source).toContain('{...(item.panelId == null ? {} : { "aria-controls": item.panelId })}');
  expect(source).not.toContain('aria-controls={item.panelId}');
  expect(source).toContain('-tab-${toDomId(item.value)}-${index + 1}');
  expect(source).not.toContain('-panel-${toDomId(item.value)}');
  expect(source).toContain("resolvedItems.map((item, index)");
  expect(source).toContain("const instanceKey = item.instanceId ?? index + 1");
  expect(source).not.toContain("const sharedItemWrapperStylesByVariant =");
  expect(source).not.toContain("const sharedItemWrapperStyle");
  expect(source).not.toContain("...sharedItemWrapperStyle");
  expect(source).not.toContain('"component-instance:1": {  }');
  expect(source).not.toContain('"component-instance:2": {  }');
  expect(source).toContain('const authoredWrapperStyle = variantStyles[`component-instance:${instanceKey}`]');
  expect(source).toContain("const itemWrapperStyle = { ...authoredWrapperStyle, ...item.wrapperStyle }");
  expect(source).not.toContain('?? variantStyles["component-instance:1"]');
  expect(source).not.toContain('<div role="presentation"');
  expect(source).not.toContain('<React.Fragment key={item.value}>');
  expect(source).toContain('style={{ ...itemWrapperStyle, ...item.props?.style }}');
  expect(source).toContain("instanceOverrides={mergeInstanceOverrides(itemInstanceOverrides");
  const tabItemMarkup = source.match(/<Component2\s[\s\S]*?\/>/)?.[0] ?? "";
  expect(tabItemMarkup.match(/\bdisabled=/g)).toHaveLength(1);
  expect(tabItemMarkup).toContain("disabled={itemDisabled}");
  expect(source.indexOf("const baseStyles = {")).toBeLessThan(source.indexOf("const Component1 = React.forwardRef"));
  const { transformWithEsbuild } = await import("vite");
  await expect(transformWithEsbuild(nonVariantSource, "Component1.jsx", { loader: "jsx" })).resolves.toHaveProperty("code");
  await expect(transformWithEsbuild(source, "Component1.jsx", { loader: "jsx" })).resolves.toHaveProperty("code");
});

test("lowers authored tab panels into ordered accessible tab relationships", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const tabsId = currentComponent.id;
    const tabItemId = addComponent().id;
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Tab", beginEditing: false, isNew: false });
    addComponentProp("boolean");
    const selected = componentProps.at(-1);
    setBooleanPropProperty(selected, "selected");
    const selectedAxis = variantModel.getProps().find(axis => axis.id === selected.variantPropId);
    const selectedVariant = addVariant({ render: false });
    setVariantPropValue(selectedVariant, selectedAxis.id, true);
    commitCanvasComponentData();

    activateComponent(tabsId);
    currentComponent.frameRecord.element.setAttribute("role", "tablist");
    commitCanvasComponentData();
    addComponentInstance(tabsId, tabItemId);
    addComponentInstance(tabsId, tabItemId, { variantId: selectedVariant.id });
    const firstPanel = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    const secondPanel = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    firstPanel.element.setAttribute("role", "tabpanel");
    secondPanel.element.setAttribute("role", "tabpanel");
    createCanvasText(firstPanel, 0, 0,
      { textContent: "First panel", beginEditing: false, isNew: false });
    createCanvasText(secondPanel, 0, 0,
      { textContent: "Second panel", beginEditing: false, isNew: false });
    commitCanvasComponentData();

    const original = downloadExportFile;
    const files = {};
    downloadExportFile = (name, content) => { files[name] = content; };
    try {
      exportAllComponents();
      return files["Component1.jsx"];
    } finally {
      downloadExportFile = original;
    }
  });

  expect(source).toContain('const panelId = item.panelId ?? (index < 2 ? `${tabListId}-panel-${toDomId(item.value)}-${index + 1}` : undefined)');
  expect(source).toContain('{...(panelId == null ? {} : { "aria-controls": panelId })}');
  expect(source).toContain('role="tabpanel"');
  expect(source).toContain('id={resolvedItems[0]?.panelId ?? `${tabListId}-panel-${toDomId(resolvedItems[0]?.value)}-1`}');
  expect(source).toContain('aria-labelledby={resolvedItems[0]?.id ?? `${tabListId}-tab-${toDomId(resolvedItems[0]?.value)}-1`}');
  expect(source).toContain('id={resolvedItems[1]?.panelId ?? `${tabListId}-panel-${toDomId(resolvedItems[1]?.value)}-2`}');
  expect(source).toContain('aria-labelledby={resolvedItems[1]?.id ?? `${tabListId}-tab-${toDomId(resolvedItems[1]?.value)}-2`}');
  expect(source).toContain('hidden={activeValue !== resolvedItems[0]?.value}');
  expect(source).toContain('hidden={activeValue !== resolvedItems[1]?.value}');
  expect(source).toContain('{resolvedItems[0]?.panel !== undefined ? ((typeof resolvedItems[0].panel === "string" || typeof resolvedItems[0].panel === "number") ? <>');
  expect(source).toContain('{resolvedItems[0].panel}</span>');
  expect(source).toContain('{resolvedItems[1]?.panel !== undefined ? ((typeof resolvedItems[1].panel === "string" || typeof resolvedItems[1].panel === "number") ? <>');
  expect(source).toContain('{resolvedItems[1].panel}</span>');
  expect(source).toContain('...(activeValue !== resolvedItems[0]?.value ? { display: "none" } : {})');
  expect(source).toContain('...(activeValue !== resolvedItems[1]?.value ? { display: "none" } : {})');
  const { transformWithEsbuild } = await import("vite");
  await expect(transformWithEsbuild(source, "Component1.jsx", { loader: "jsx" })).resolves.toHaveProperty("code");
});

test("lowers a nested tab list with one shared dynamic panel inside a neutral Tabs root", async ({ page }) => {
  await openApp(page);

  const source = await page.evaluate(() => {
    const tabsId = currentComponent.id;
    const tabItemId = addComponent().id;
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    createCanvasText(currentComponent.frameRecord, 0, 0,
      { textContent: "Tab", beginEditing: false, isNew: false });
    addComponentProp("boolean");
    const selected = componentProps.at(-1);
    setBooleanPropProperty(selected, "selected");
    const selectedAxis = variantModel.getProps().find(axis => axis.id === selected.variantPropId);
    const selectedVariant = addVariant({ render: false });
    setVariantPropValue(selectedVariant, selectedAxis.id, true);
    commitCanvasComponentData();

    activateComponent(tabsId);
    const tabList = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    tabList.element.setAttribute("role", "tablist");
    commitCanvasComponentData();
    addComponentInstance(tabsId, tabItemId, { parentId: tabList.id });
    addComponentInstance(tabsId, tabItemId, { parentId: tabList.id, variantId: selectedVariant.id });
    const firstPanel = createCanvasFrame(0, 0, currentComponent.frameRecord, { select: false });
    firstPanel.element.setAttribute("role", "tabpanel");
    createCanvasText(firstPanel, 0, 0,
      { textContent: "First panel", beginEditing: false, isNew: false });
    commitCanvasComponentData();

    const files = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { files[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return files["Component1.jsx"];
  });

  expect(source).toContain('<div {...rest} ref={ref} className={[variantClassName, className]');
  expect(source).toContain('id={tabListId} role="tablist"');
  expect(source).not.toContain('aria-disabled={false || undefined}');
  expect(source).toContain('const itemDisabled = Boolean(item.disabled)');
  expect(source).not.toContain('const itemDisabled = false || item.disabled');
  expect(source).toContain('const tabListId = `tabs-${toDomId(generatedId)}`');
  expect(source).toContain('role="tabpanel"');
  expect(source).toContain('panelId: panelIdProp');
  expect(source).toContain('const panelId = panelIdProp ?? `${tabListId}-panel`');
  expect(source).toContain('const activeIndex = resolvedItems.findIndex(item => item.value === activeValue)');
  expect(source).toContain('const activeItem = activeIndex >= 0 ? resolvedItems[activeIndex] : undefined');
  expect(source).toContain('const panelContent = activeItem?.panel');
  expect(source).toContain('const hasCustomPanel = panelContent !== undefined');
  expect(source).toContain('const isPrimitivePanel = typeof panelContent === "string" || typeof panelContent === "number"');
  expect(source).toContain('aria-controls={panelId}');
  expect(source).not.toContain('panelId == null');
  expect(source).toContain('id={panelId}');
  expect(source).toContain('aria-labelledby={activeItem?.id ?? (activeItem ? `${tabListId}-tab-${toDomId(activeItem.value)}-${activeIndex + 1}` : undefined)}');
  expect(source).toContain('{hasCustomPanel ? (isPrimitivePanel ? <>');
  expect(source).toContain('{panelContent}</span>');
  expect(source).toContain('"First panel"');
  const { transformWithEsbuild } = await import("vite");
  await expect(transformWithEsbuild(source, "Component1.jsx", { loader: "jsx" })).resolves.toHaveProperty("code");
});

test("generated tabs implement roving focus and disable the complete collection", async ({ page }) => {
  await openApp(page);
  const files = await exportBehavioralTabs(page);
  await mountGeneratedTabs(page, files);
  await page.evaluate(() => window.renderExportedTabs());

  const tabs = page.getByRole("tab");
  const panels = page.getByRole("tabpanel", { includeHidden: true });
  await expect(tabs).toHaveCount(2);
  await expect(panels).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute("aria-controls", await panels.nth(0).getAttribute("id"));
  await expect(tabs.nth(1)).toHaveAttribute("aria-controls", await panels.nth(1).getAttribute("id"));
  await expect(panels.nth(0)).toHaveAttribute("aria-labelledby", await tabs.nth(0).getAttribute("id"));
  await expect(panels.nth(1)).toHaveAttribute("aria-labelledby", await tabs.nth(1).getAttribute("id"));
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeHidden();
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
  await tabs.nth(0).click();
  await expect.poll(() => page.evaluate(() => window.exportedTabChanges)).toEqual([]);
  await tabs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "-1");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "0");
  await expect(panels.nth(0)).toBeHidden();
  await expect(panels.nth(1)).toBeVisible();

  await page.evaluate(() => window.renderExportedTabs({ disabled: true }));
  await expect(tabs.nth(0)).toHaveAttribute("aria-disabled", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-disabled", "true");
  await expect(tabs.nth(0)).toBeDisabled();
  await expect(tabs.nth(1)).toBeDisabled();
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "-1");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
});

test("lowers icon-only tabs with an accessible label and no text layer", async ({ page }) => {
  await openApp(page);
  const source = await page.evaluate(() => {
    const tabsId = currentComponent.id;
    const tabItemId = addComponent().id;
    currentComponent.frameRecord.element.dataset.htmlTag = "button";
    addComponentProp("boolean");
    setBooleanPropProperty(componentProps.at(-1), "selected");
    componentProps.push({
      id: nextComponentPropId++,
      name: "ariaLabel",
      type: "string",
      defaultValue: "Icon tab",
      targetFrameId: currentComponent.frameRecord.id,
      targetTextId: null,
      targetVectorId: null,
      property: "ariaLabel",
    });
    commitCanvasComponentData();

    activateComponent(tabsId);
    addComponentInstance(tabsId, tabItemId);
    addComponentInstance(tabsId, tabItemId);
    currentComponent.frameRecord.element.setAttribute("role", "tablist");
    commitCanvasComponentData();

    const files = {};
    const original = downloadExportFile;
    downloadExportFile = (name, content) => { files[name] = content; };
    try { exportAllComponents(); } finally { downloadExportFile = original; }
    return files["Component1.jsx"];
  });

  expect(source).toContain('role="tablist"');
  expect(source).toContain('"ariaLabel":"Icon tab"');
  expect(source).toContain("ariaLabel={item.ariaLabel}");
  expect(source).toContain("tabIndex={isFocusable ? 0 : -1}");
  expect(source).toContain("const itemInstanceOverrides = item.instanceOverrides");
});

test("generated tabs keep an invalid controlled value unselected without changing the parent", async ({ page }) => {
  await openApp(page);
  const files = await exportBehavioralTabs(page);
  await mountGeneratedTabs(page, files);
  await page.evaluate(() => window.renderExportedTabs({
    value: "missing",
    items: [
      { value: "user settings", label: "User settings", panelId: "user-panel", panel: "Custom user panel" },
      { value: "user-settings", label: "User settings compact", panel: "Custom compact panel" },
    ],
  }));

  const tabs = page.getByRole("tab");
  const panels = page.getByRole("tabpanel", { includeHidden: true });
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect(tabs.nth(0)).toHaveAttribute("tabindex", "0");
  await expect(tabs.nth(1)).toHaveAttribute("tabindex", "-1");
  await expect.poll(() => page.evaluate(() => window.exportedTabChanges)).toEqual([]);
  const ids = await tabs.evaluateAll(elements => elements.map(element => element.id));
  expect(new Set(ids).size).toBe(2);
  await expect(tabs.nth(0)).toHaveAttribute("aria-controls", "user-panel");
  await expect(tabs.nth(1)).toHaveAttribute("aria-controls", await panels.nth(1).getAttribute("id"));
  await expect(panels.nth(0)).toHaveAttribute("id", "user-panel");
  await expect(panels.nth(0)).toHaveAttribute("aria-labelledby", await tabs.nth(0).getAttribute("id"));
  await expect(panels.nth(1)).toHaveAttribute("aria-labelledby", await tabs.nth(1).getAttribute("id"));
  await expect(panels.nth(0)).toHaveText("Custom user panel");
  await expect(panels.nth(1)).toHaveText("Custom compact panel");
  await expect(panels.nth(0).locator("span")).toHaveText("Custom user panel");
  await expect(panels.nth(1).locator("span")).toHaveText("Custom compact panel");
  await expect(panels.nth(0)).toBeHidden();
  await expect(panels.nth(1)).toBeHidden();
});

test("generated tabs reconcile uncontrolled state when the selected item disappears", async ({ page }) => {
  await openApp(page);
  const files = await exportBehavioralTabs(page);
  await mountGeneratedTabs(page, files);
  const bothItems = [
    { value: "overview", label: "Overview" },
    { value: "profile", label: "Profile" },
  ];
  await page.evaluate((items) => window.renderExportedTabs({
    defaultValue: "profile",
    items,
  }, true), bothItems);

  let tabs = page.getByRole("tab");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  await page.evaluate(() => window.renderExportedTabs({
    items: [{ value: "overview", label: "Overview" }],
  }, true));
  tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");

  await page.evaluate((items) => window.renderExportedTabs({ items }, true), bothItems);
  tabs = page.getByRole("tab");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "false");
  await expect.poll(() => page.evaluate(() => window.exportedTabChanges)).toEqual([]);
});

test("generated tabs reject duplicate custom item values", async ({ page }) => {
  await openApp(page);
  const files = await exportBehavioralTabs(page);
  await mountGeneratedTabs(page, files);
  await page.evaluate(() => window.renderExportedTabs({
    items: [
      { value: "duplicate", label: "First" },
      { value: "duplicate", label: "Second" },
    ],
  }));

  await expect(page.locator("[data-export-error]")).toContainText(
    "Component1 requires every item.value to be unique. Duplicate value: duplicate",
  );
});

test("generated tabs reject non-string item values", async ({ page }) => {
  await openApp(page);
  const files = await exportBehavioralTabs(page);
  await mountGeneratedTabs(page, files);
  await page.evaluate(() => window.renderExportedTabs({
    items: [
      { value: 1, label: "Numeric value" },
      { value: "1", label: "String value" },
    ],
  }));

  await expect(page.locator("[data-export-error]")).toContainText(
    "Component1 requires every item.value to be a string.",
  );
});

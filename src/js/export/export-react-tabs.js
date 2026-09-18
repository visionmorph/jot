/* Accessible, data-driven tab collection export generation. */

function getTabCollectionDescriptor(exportMetadata) {
  if (!exportMetadata) return null;
  const rootLayer = { type: "frame", record: currentComponent?.frameRecord };
  if (!rootLayer.record) return null;
  const rootChildren = getLayerChildren(null);
  const tabList = rootLayer.record.element.getAttribute("role") === "tablist"
    ? rootLayer
    : rootChildren.find(layer => (
      layer.type === "frame" && layer.record.element.getAttribute("role") === "tablist"
    ));
  if (!tabList) return null;
  const isRootTabList = tabList.record === rootLayer.record;
  const children = getLayerChildren(isRootTabList ? null : tabList.record.id);
  const instances = children.filter(layer => layer.type === "component-instance");
  if (instances.length < 2) return null;
  const sourceComponentId = instances[0].record.sourceComponentId;
  if (!instances.every(layer => layer.record.sourceComponentId === sourceComponentId)) return null;
  const itemMetadata = exportMetadata.get(sourceComponentId);
  if (!itemMetadata?.semantics?.selectedExportName) return null;
  const panelCandidates = isRootTabList
    ? children
    : rootChildren
      .filter(layer => layer !== tabList && layer.type === "frame")
      .flatMap(layer => [layer, ...getLayerChildren(layer.record.id)]);
  const panels = panelCandidates.filter(layer => (
    layer.type === "frame" && layer.record.element.getAttribute("role") === "tabpanel"
  ));
  return {
    instances,
    isRootTabList,
    itemMetadata,
    panels,
    sharedPanel: panels.length === 1 && instances.length > 1,
    tabList,
    separator: children.find(layer => (
      layer.type !== "component-instance" && !panels.includes(layer)
    )) ?? null,
  };
}

function createTabPanelSemanticAttributes(descriptor) {
  if (descriptor.sharedPanel) {
    const panel = descriptor.panels[0];
    return new Map([[
      getExportLayerKey(panel),
      ` id={panelId} aria-labelledby={activeItem?.id ?? (activeItem ? \`\${tabListId}-tab-\${toDomId(activeItem.value)}-\${activeIndex + 1}\` : undefined)} hidden={activeItem == null}`,
    ]]);
  }
  return new Map(descriptor.panels.map((panel, index) => {
    const panelItem = `resolvedItems[${index}]`;
    const panelValue = `${panelItem}?.value`;
    const panelId = `${panelItem}?.panelId ?? \`\${tabListId}-panel-\${toDomId(${panelValue})}-${index + 1}\``;
    const tabId = `${panelItem}?.id ?? \`\${tabListId}-tab-\${toDomId(${panelValue})}-${index + 1}\``;
    return [
      getExportLayerKey(panel),
      ` id={${panelId}} aria-labelledby={${tabId}} hidden={activeValue !== ${panelValue}}`,
    ];
  }));
}

function createTabPanelSemanticStyles(descriptor) {
  if (descriptor.sharedPanel) {
    const panel = descriptor.panels[0];
    return new Map([[
      getExportLayerKey(panel),
      'activeItem == null ? { display: "none" } : {}',
    ]]);
  }
  return new Map(descriptor.panels.map((panel, index) => {
    return [
      getExportLayerKey(panel),
      `activeValue !== resolvedItems[${index}]?.value ? { display: "none" } : {}`,
    ];
  }));
}

function createTabPanelContentOverrides(
  descriptor,
  exportProps,
  exportContext,
  exportClasses,
  toggleBindings,
  styleReference,
  variantAxes,
  exportMetadata,
) {
  const createContentOverride = (panel, itemExpression, contentState = null) => {
    const panelChildren = getLayerChildren(panel.record.id);
    const fallbackMarkup = panelChildren.map(child => renderExportLayer(
      child,
      4,
      exportProps,
      exportContext,
      exportClasses,
      toggleBindings,
      styleReference,
      variantAxes,
      exportMetadata,
    )).join("\n");
    const fallback = fallbackMarkup
      ? `<>\n${fallbackMarkup}\n        </>`
      : "null";
    const authoredText = panelChildren.length === 1 && panelChildren[0].type === "text"
      ? panelChildren[0]
      : null;
    const contentExpression = contentState?.contentExpression ?? `${itemExpression}.panel`;
    const hasContentExpression = contentState?.hasContentExpression ?? `${itemExpression}?.panel !== undefined`;
    const primitiveExpression = contentState?.primitiveExpression
      ?? `(typeof ${contentExpression} === "string" || typeof ${contentExpression} === "number")`;
    const styledTextMarkup = authoredText
      ? renderExportLayer(
        authoredText,
        4,
        exportProps,
        exportContext,
        exportClasses,
        toggleBindings,
        styleReference,
        variantAxes,
        exportMetadata,
        null,
        null,
        new Map([[getExportLayerKey(authoredText), `{${contentExpression}}`]]),
      )
      : "";
    const customContent = styledTextMarkup
      ? `(${primitiveExpression} ? <>\n${styledTextMarkup}\n        </> : ${contentExpression})`
      : contentExpression;
    return `        {${hasContentExpression} ? ${customContent} : ${fallback}}`;
  };
  if (descriptor.sharedPanel) {
    const panel = descriptor.panels[0];
    return new Map([[
      getExportLayerKey(panel),
      createContentOverride(panel, "activeItem", {
        contentExpression: "panelContent",
        hasContentExpression: "hasCustomPanel",
        primitiveExpression: "isPrimitivePanel",
      }),
    ]]);
  }
  return new Map(descriptor.panels.map((panel, index) => {
    return [
      getExportLayerKey(panel),
      createContentOverride(panel, `resolvedItems[${index}]`),
    ];
  }));
}

function createTabCollectionPanelsMarkup(
  descriptor,
  exportProps,
  exportContext,
  exportClasses,
  toggleBindings,
  styleReference,
  variantAxes,
  exportMetadata,
) {
  const semanticAttributes = createTabPanelSemanticAttributes(descriptor);
  const semanticStyles = createTabPanelSemanticStyles(descriptor);
  const contentOverrides = createTabPanelContentOverrides(
    descriptor,
    exportProps,
    exportContext,
    exportClasses,
    toggleBindings,
    styleReference,
    variantAxes,
    exportMetadata,
  );
  return descriptor.panels.map((panel, index) => {
    return renderExportLayer(
      panel,
      3,
      exportProps,
      exportContext,
      exportClasses,
      toggleBindings,
      styleReference,
      variantAxes,
      exportMetadata,
      semanticAttributes,
      null,
      contentOverrides,
      semanticStyles,
    );
  }).join("\n");
}

function getTabListDisabledExportName(exportProps, variantAxes, descriptor = null) {
  const rootId = descriptor?.tabList?.record.id ?? currentComponent?.frameRecord?.id;
  const disabledProp = exportProps.find((prop) =>
    prop.property === "disabled" && prop.targetFrameId === rootId);
  const disabledAxis = variantAxes.find((axis) => {
    const componentProp = getVariantAxisComponentProp(axis);
    return componentProp?.property === "disabled" && componentProp.targetFrameId === rootId;
  });
  return disabledProp?.exportName ?? disabledAxis?.exportName ?? null;
}

function getDefaultItemDelta(baseItem, nextItem) {
  const properties = new Set([...Object.keys(baseItem), ...Object.keys(nextItem)]);
  return Object.fromEntries([...properties].flatMap((property) => (
    JSON.stringify(baseItem[property]) === JSON.stringify(nextItem[property])
      ? []
      : [[property, nextItem[property]]]
  )));
}

function applyDefaultItemDeltas(baseItems, ...itemDeltaLists) {
  return baseItems.map((item, index) => Object.assign(
    {},
    item,
    ...itemDeltaLists.map((itemDeltas) => itemDeltas?.[index]),
  ));
}

function getDefaultItemDeltas(baseItems, nextItems) {
  return baseItems.map((item, index) => getDefaultItemDelta(item, nextItems[index] ?? {}));
}

function hasDefaultItemDeltas(itemDeltas) {
  return itemDeltas.some((itemDelta) => Object.keys(itemDelta).length > 0);
}

function serializeJavaScriptValue(value) {
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return `[${value.map(serializeJavaScriptValue).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).map(([key, entryValue]) => (
      `${JSON.stringify(key)}:${serializeJavaScriptValue(entryValue)}`
    )).join(",")}}`;
  }
  return JSON.stringify(value);
}

function createTabCollectionItemsSource(
  descriptor,
  exportVariants,
  axes,
  exportMetadata,
  baseEntry = exportVariants[0],
) {
  const usedValues = new Set();
  const selectedName = descriptor.itemMetadata.semantics.selectedExportName;
  const disabledName = descriptor.itemMetadata.semantics.disabledExportName;
  const labelName = descriptor.itemMetadata.semantics.labelExportName;
  const ariaLabelName = descriptor.itemMetadata.semantics.ariaLabelExportName;
  const forwardedItemPropNames = new Set(descriptor.itemMetadata.axes.flatMap((itemAxis) => (
    itemAxis.exportName !== disabledName
      && axes.some((axis) => axis.exportName === itemAxis.exportName)
      ? [itemAxis.exportName]
      : []
  )));
  const ownerDisabledAxis = axes.find((axis) => axis.exportName === disabledName);
  const defaultContext = createVariantExportContext(baseEntry?.variant);
  const valuesByInstanceId = new Map(descriptor.instances.map((layer, index) => {
    const record = getExportInstanceSettings(layer.record, defaultContext);
    const props = getExportInstanceProps(record, exportMetadata);
    const label = (labelName ? props[labelName] : undefined)
      ?? Object.values(props.instanceOverrides?.labels ?? {})[0]
      ?? descriptor.itemMetadata.semantics.labelDefaultValue
      ?? undefined;
    const accessibleName = (ariaLabelName ? props[ariaLabelName] : undefined)
      ?? descriptor.itemMetadata.semantics.ariaLabelDefaultValue
      ?? label;
    const baseValue = String(label ?? accessibleName ?? `Tab ${index + 1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `tab-${index + 1}`;
    let value = baseValue;
    let suffix = 2;
    while (usedValues.has(value)) value = `${baseValue}-${suffix++}`;
    usedValues.add(value);
    return [layer.record.id, value];
  }));
  const itemsByCombination = new Map(exportVariants.map(({ variant }) => {
    const context = createVariantExportContext(variant);
    const ownerIsDisabled = ownerDisabledAxis
      ? Boolean(getExportVariantAxisValue(variant, ownerDisabledAxis))
      : false;
    const items = descriptor.instances.map((layer, index) => {
      const record = getExportInstanceSettings(layer.record, context);
      const props = getExportInstanceProps(record, exportMetadata);
      const label = (labelName ? props[labelName] : undefined)
        ?? Object.values(props.instanceOverrides?.labels ?? {})[0]
        ?? descriptor.itemMetadata.semantics.labelDefaultValue
        ?? undefined;
      const ariaLabel = (ariaLabelName ? props[ariaLabelName] : undefined)
        ?? (label === undefined ? descriptor.itemMetadata.semantics.ariaLabelDefaultValue : undefined)
        ?? undefined;
      const itemProps = { ...props };
      delete itemProps[selectedName];
      if (labelName) delete itemProps[labelName];
      if (ariaLabelName) delete itemProps[ariaLabelName];
      if (disabledName) delete itemProps[disabledName];
      forwardedItemPropNames.forEach((name) => delete itemProps[name]);
      const instanceOverrides = itemProps.instanceOverrides;
      delete itemProps.instanceOverrides;
      return {
        value: valuesByInstanceId.get(layer.record.id),
        instanceId: layer.record.id,
        selected: Boolean(props[selectedName]),
        ...(label !== undefined ? { label } : {}),
        ...(ariaLabel !== undefined ? { ariaLabel } : {}),
        ...(disabledName && Boolean(props[disabledName]) && !ownerIsDisabled ? { disabled: true } : {}),
        ...(Object.keys(itemProps).length ? { props: itemProps } : {}),
        ...(instanceOverrides ? { instanceOverrides } : {}),
      };
    });
    return [getExportVariantCombinationKey(variant, axes), items];
  }));
  if (ownerDisabledAxis) {
    const otherAxes = axes.filter((axis) => axis.id !== ownerDisabledAxis.id);
    exportVariants.forEach(({ variant }) => {
      if (!getExportVariantAxisValue(variant, ownerDisabledAxis)) return;
      const enabledEntry = exportVariants.find(({ variant: candidate }) => (
        !getExportVariantAxisValue(candidate, ownerDisabledAxis)
        && otherAxes.every((axis) => (
          getExportVariantAxisValue(candidate, axis) === getExportVariantAxisValue(variant, axis)
        ))
      ));
      if (!enabledEntry) return;
      const items = itemsByCombination.get(getExportVariantCombinationKey(variant, axes));
      const enabledItems = itemsByCombination.get(getExportVariantCombinationKey(enabledEntry.variant, axes));
      items.forEach((item, index) => {
        if (enabledItems[index]?.disabled) item.disabled = true;
        else delete item.disabled;
      });
    });
  }
  const baseItems = itemsByCombination.get(getExportVariantCombinationKey(baseEntry?.variant, axes))
    ?? itemsByCombination.values().next().value
    ?? [];
  const itemDeltasByAxis = Object.fromEntries(axes.flatMap((axis) => {
    const valueDeltas = Object.fromEntries(getVariantPropValues(axis).flatMap((value) => {
      if (value === getExportVariantAxisDefaultValue(axis)) return [];
      const pair = findExportAxisDeltaPair(exportVariants, axes, axis, value);
      if (!pair) return [];
      const referenceItems = itemsByCombination.get(getExportVariantCombinationKey(pair.reference.variant, axes));
      const nextItems = itemsByCombination.get(getExportVariantCombinationKey(pair.variant.variant, axes));
      const itemDeltas = getDefaultItemDeltas(referenceItems, nextItems);
      return hasDefaultItemDeltas(itemDeltas) ? [[String(value), itemDeltas]] : [];
    }));
    return Object.keys(valueDeltas).length ? [[axis.exportName, valueDeltas]] : [];
  }));
  const itemDeltaAxes = axes.filter((axis) => Object.hasOwn(itemDeltasByAxis, axis.exportName));
  const itemDeltaAxisOrder = itemDeltaAxes.map((axis) => axis.exportName);
  const combinationCorrectionEntries = exportVariants.flatMap(({ variant }) => {
    const combinationKey = getExportVariantCombinationKey(variant, axes);
    const values = Object.fromEntries(axes.map((axis) => [
      axis.exportName,
      getExportVariantAxisValue(variant, axis),
    ]));
    const resolvedItems = applyDefaultItemDeltas(
      baseItems,
      ...itemDeltaAxisOrder.map((axis) => itemDeltasByAxis[axis]?.[String(values[axis])]),
    );
    const correction = getDefaultItemDeltas(resolvedItems, itemsByCombination.get(combinationKey));
    return hasDefaultItemDeltas(correction) ? [{ variant, value: correction }] : [];
  });
  const combinationCorrectionAxes = getReducedVariantAxes(combinationCorrectionEntries, axes);
  const combinationCorrections = createNestedVariantLookup(
    combinationCorrectionEntries,
    combinationCorrectionAxes,
  );
  const runtimeValues = axes.map((axis) => axis.exportName).join(", ");
  const hasCombinationCorrections = combinationCorrectionEntries.length > 0;
  if (itemDeltaAxisOrder.length === 0 && !hasCombinationCorrections) {
    return {
      staticSource: `const defaultItems = ${serializeJavaScriptValue(baseItems)};\n`,
      runtimeSource: "",
    };
  }
  const combinationCorrectionSource = hasCombinationCorrections
    ? `const defaultItemCombinationCorrections = ${serializeJavaScriptValue(combinationCorrections)};\nconst defaultItemCombinationAxisOrder = ${JSON.stringify(combinationCorrectionAxes.map((axis) => axis.exportName))};\n`
    : "";
  const resolvedItemsSource = hasCombinationCorrections
    ? `  const corrections = getVariantValue(defaultItemCombinationCorrections, defaultItemCombinationAxisOrder, values);\n  return corrections\n    ? variantItems.map((item, index) => Object.assign({}, item, corrections[index]))\n    : variantItems;`
    : "  return variantItems;";
  const runtimeStyleValues = runtimeValues ? `{ ${runtimeValues} }` : "{}";
  return {
    staticSource: `const baseDefaultItems = ${serializeJavaScriptValue(baseItems)};\nconst defaultItemVariantDeltas = ${serializeJavaScriptValue(itemDeltasByAxis)};\nconst defaultItemVariantAxisOrder = ${JSON.stringify(itemDeltaAxisOrder)};\n${combinationCorrectionSource}const getDefaultItems = (values) => {\n  const variantItems = baseDefaultItems.map((item, index) => Object.assign(\n    {},\n    item,\n    ...defaultItemVariantAxisOrder.map((axis) => defaultItemVariantDeltas[axis]?.[String(values[axis])]?.[index]),\n  ));\n${resolvedItemsSource}\n};\n`,
    runtimeSource: `  const defaultItems = getDefaultItems(${runtimeStyleValues});\n`,
  };
}

function getSharedStyle(styleObjects) {
  const [firstStyle] = styleObjects;
  if (!firstStyle) return {};
  return Object.fromEntries(Object.entries(firstStyle).filter(([property, value]) => (
    styleObjects.every((styleObject) => styleObject[property] === value)
  )));
}

function createTabCollectionWrapperStyleSource(descriptor, exportVariants, axes) {
  const styleEntries = exportVariants.map(({ variant }) => {
    const context = createVariantExportContext(variant);
    const instanceStyles = descriptor.instances.map((layer) => (
      getExportLayerStyleState(layer, [], context).style
    ));
    return { variant, value: getSharedStyle(instanceStyles) };
  });
  const styleAxes = getReducedVariantAxes(styleEntries, axes);
  if (styleAxes.length === 0) {
    const sharedStyle = styleEntries[0]?.value ?? {};
    if (Object.keys(sharedStyle).length === 0) {
      return { staticSource: "", runtimeSource: "", hasStyle: false };
    }
    return {
      staticSource: `const sharedItemWrapperStyle = ${JSON.stringify(sharedStyle)};\n`,
      runtimeSource: "",
      hasStyle: true,
    };
  }
  const stylesByVariant = createNestedVariantLookup(styleEntries, styleAxes);
  const fallbackValues = styleAxes.map((axis) => getExportVariantAxisValue(exportVariants[0]?.variant, axis));
  return {
    staticSource: `const sharedItemWrapperStylesByVariant = ${JSON.stringify(stylesByVariant)};\nconst sharedItemWrapperStyleVariantAxes = ${JSON.stringify(styleAxes.map((axis) => axis.exportName))};\n`,
    runtimeSource: `  const sharedItemWrapperStyle = getVariantValue(sharedItemWrapperStylesByVariant, sharedItemWrapperStyleVariantAxes, styleValues) ?? ${createNestedVariantAccess("sharedItemWrapperStylesByVariant", fallbackValues)} ?? {};\n`,
    hasStyle: true,
  };
}

function getTabListOrientation(record) {
  const flexDirection = String(record.element.style.flexDirection || "").trim().toLowerCase();
  if (flexDirection === "column" || flexDirection === "column-reverse") return "vertical";
  if (flexDirection === "row" || flexDirection === "row-reverse") return "horizontal";
  return record.element.dataset.direction === "vertical" ? "vertical" : "horizontal";
}

function createTabCollectionOrientationSource(exportVariants, axes, descriptor = null) {
  const rootLayer = descriptor?.tabList ?? { type: "frame", record: currentComponent.frameRecord };
  const orientationEntries = exportVariants.map(({ variant }) => {
    const context = createVariantExportContext(variant);
    const record = getVariantExportRecord("frame", rootLayer.record, context);
    return { variant, value: getTabListOrientation(record) };
  });
  const fallbackOrientation = orientationEntries[0]?.value ?? "horizontal";
  const orientationAxes = getReducedVariantAxes(orientationEntries, axes);
  if (orientationAxes.length === 0) {
    return { staticSource: "", runtimeSource: `  const orientation = ${JSON.stringify(fallbackOrientation)};\n` };
  }
  if (orientationAxes.length === 1 && orientationEntries.every((entry) => (
    entry.value === getExportVariantAxisValue(entry.variant, orientationAxes[0])
  ))) {
    return {
      staticSource: "",
      runtimeSource: `  const orientation = ${orientationAxes[0].exportName} === "vertical" ? "vertical" : "horizontal";\n`,
    };
  }
  const orientations = createNestedVariantLookup(orientationEntries, orientationAxes);
  return {
    staticSource: `const orientationByVariant = ${JSON.stringify(orientations)};\nconst orientationVariantAxes = ${JSON.stringify(orientationAxes.map((axis) => axis.exportName))};\n`,
    runtimeSource: `  const orientation = getVariantValue(orientationByVariant, orientationVariantAxes, styleValues) ?? ${JSON.stringify(fallbackOrientation)};\n`,
  };
}

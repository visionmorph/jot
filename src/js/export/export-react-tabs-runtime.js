/* React tab collection markup and runtime source generation. */

function createTabCollectionItemMarkup({
  ariaLabelAttribute,
  itemName,
  labelAttribute,
  panelAttribute,
  selectedName,
  sharedAxisAttributes,
  includeKey = true,
}) {
  const attributes = [
    "{...item.props}",
    sharedAxisAttributes.trim(),
    labelAttribute.trim(),
    ariaLabelAttribute.trim(),
    includeKey ? "key={item.value}" : "",
    `${selectedName}={selected}`,
    "disabled={itemDisabled}",
    `id={item.id ?? \`${"${tabListId}"}-tab-${"${toDomId(item.value)}"}-${"${index + 1}"}\`}`,
    panelAttribute.trim(),
    "tabIndex={isFocusable ? 0 : -1}",
    "ref={(node) => { if (node) tabRefs.current.set(item.value, node); else tabRefs.current.delete(item.value); }}",
    "onClick={(event) => { item.props?.onClick?.(event); if (!event.defaultPrevented && !itemDisabled) selectTab(item.value); }}",
    "onKeyDown={(event) => { item.props?.onKeyDown?.(event); if (!event.defaultPrevented && !itemDisabled) handleTabKeyDown(event, item.value); }}",
    "instanceOverrides={mergeInstanceOverrides(itemInstanceOverrides, instanceOverrides.children?.[instanceKey])}",
    "style={{ ...itemWrapperStyle, ...item.props?.style }}",
  ].filter(Boolean);
  return `<${itemName} ${attributes.join(" ")} />`;
}

function createTabCollectionComponentMarkup(
  descriptor,
  variantAxes,
  disabledExportName = null,
  hasSharedItemWrapperStyle = true,
  panelMarkup = "",
  tabListClassName = "",
) {
  const itemName = descriptor.itemMetadata.name;
  const selectedName = descriptor.itemMetadata.semantics.selectedExportName;
  const itemDisabledName = descriptor.itemMetadata.semantics.disabledExportName;
  const labelName = descriptor.itemMetadata.semantics.labelExportName;
  const labelOverrideKey = descriptor.itemMetadata.semantics.labelOverrideKey;
  const ariaLabelName = descriptor.itemMetadata.semantics.ariaLabelExportName;
  const labelAttribute = labelName ? ` ${labelName}={item.label}` : "";
  const labelOverrideSource = labelName || !labelOverrideKey
    ? "item.instanceOverrides"
    : `mergeInstanceOverrides(item.instanceOverrides, item.label == null ? {} : { labels: { ${JSON.stringify(labelOverrideKey)}: item.label } })`;
  const ariaLabelAttribute = ariaLabelName
    ? ` ${ariaLabelName}={item.ariaLabel}`
    : ' {...(item.ariaLabel == null ? {} : { "aria-label": item.ariaLabel })}';
  const sharedAxisAttributes = descriptor.itemMetadata.axes.flatMap(itemAxis => {
    if (itemAxis.exportName === itemDisabledName) return [];
    const ownerAxis = variantAxes.find(axis => axis.exportName === itemAxis.exportName);
    return ownerAxis ? [` ${itemAxis.exportName}={${ownerAxis.exportName}}`] : [];
  }).join("");
  const separatorKey = descriptor.separator ? getExportLayerKey(descriptor.separator) : null;
  const disabledValue = disabledExportName ?? "false";
  const tabListDisabledAttribute = disabledExportName
    ? ` aria-disabled={${disabledExportName} || undefined}`
    : "";
  const sharedWrapperStyleSpread = hasSharedItemWrapperStyle ? "...sharedItemWrapperStyle, " : "";
  const generatedPanelId = descriptor.panels.length && !descriptor.sharedPanel
    ? ` ?? (index < ${descriptor.panels.length} ? \`${"${tabListId}"}-panel-${"${toDomId(item.value)}"}-${"${index + 1}"}\` : undefined)`
    : "";
  const panelAttribute = descriptor.sharedPanel
    ? ' aria-controls={panelId}'
    : descriptor.panels.length
      ? ' {...(panelId == null ? {} : { "aria-controls": panelId })}'
    : ' {...(item.panelId == null ? {} : { "aria-controls": item.panelId })}';
  const itemMarkupOptions = {
    ariaLabelAttribute,
    itemName,
    labelAttribute,
    panelAttribute,
    selectedName,
    sharedAxisAttributes,
  };
  const itemMarkup = createTabCollectionItemMarkup(itemMarkupOptions);
  const renderedItemMarkup = separatorKey
    ? `<React.Fragment key={item.value}>
            {index > 0 && <div aria-hidden="true" style={variantStyles[${JSON.stringify(separatorKey)}]} />}
            ${createTabCollectionItemMarkup({ ...itemMarkupOptions, includeKey: false })}
          </React.Fragment>`
    : itemMarkup;
  const tabListKey = getExportLayerKey(descriptor.tabList);
  const openingMarkup = descriptor.isRootTabList
    ? `<div {...rest} id={tabListId} ref={ref} role="tablist" aria-label={ariaLabel} aria-orientation={orientation}${tabListDisabledAttribute} className={[variantClassName, className].filter(Boolean).join(" ")} style={{ ...variantStyles["component:0"], ...instanceOverrides.styles?.["component:0"], ...style }}>`
    : `<div id={tabListId} role="tablist" aria-label={ariaLabel} aria-orientation={orientation}${tabListDisabledAttribute}${tabListClassName ? ` className=${JSON.stringify(tabListClassName)}` : ""} style={{ ...variantStyles[${JSON.stringify(tabListKey)}], ...instanceOverrides.styles?.[${JSON.stringify(tabListKey)}] }}>`;
  return `    ${openingMarkup}
      {resolvedItems.map((item, index) => {
        const selected = item.value === activeValue;
        const itemDisabled = ${disabledExportName ? `${disabledExportName} || item.disabled` : "Boolean(item.disabled)"};
        const isFocusable = !itemDisabled && (selected || item.value === fallbackFocusableValue);
${descriptor.panels.length && !descriptor.sharedPanel ? `        const panelId = item.panelId${generatedPanelId};\n` : ""}        const instanceKey = item.instanceId ?? index + 1;
        const authoredWrapperStyle = variantStyles[\`component-instance:${"${instanceKey}"}\`];
        const itemWrapperStyle = { ${sharedWrapperStyleSpread}...authoredWrapperStyle, ...item.wrapperStyle };
        const itemInstanceOverrides = ${labelOverrideSource};
        return (
          ${renderedItemMarkup}
        );
      })}
${descriptor.isRootTabList && panelMarkup ? `${panelMarkup}\n` : ""}    </div>`;
}

function createTabCollectionValidationSource(componentName) {
  return `  const resolvedItems = items ?? defaultItems;
  const invalidValueItem = resolvedItems.find((item) => typeof item.value !== "string");
  if (invalidValueItem) {
    throw new Error(${JSON.stringify(`${componentName} requires every item.value to be a string.`)});
  }
  const seenItemValues = new Set();
  const duplicateItem = resolvedItems.find((item) => {
    if (seenItemValues.has(item.value)) return true;
    seenItemValues.add(item.value);
    return false;
  });
  if (duplicateItem) {
    throw new Error(${JSON.stringify(`${componentName} requires every item.value to be unique. Duplicate value: `)} + duplicateItem.value);
  }
`;
}

function createTabCollectionSelectionSource(disabledExportName) {
  const enabledItemsSource = disabledExportName
    ? `${disabledExportName} ? [] : resolvedItems.filter(item => !item.disabled)`
    : "resolvedItems.filter(item => !item.disabled)";
  const selectableItemsSource = disabledExportName
    ? `${disabledExportName} ? resolvedItems : enabledItems`
    : "enabledItems";
  const fallbackFocusableValueSource = disabledExportName
    ? `${disabledExportName} || selectedItemIsAvailable ? undefined : enabledItems[0]?.value`
    : "selectedItemIsAvailable ? undefined : enabledItems[0]?.value";
  const activeValueSource = disabledExportName
    ? `selectedItemIsAvailable ? selectedValue : ${disabledExportName} ? authoredDefaultValue : isControlled ? undefined : fallbackFocusableValue`
    : "selectedItemIsAvailable ? selectedValue : isControlled ? undefined : fallbackFocusableValue";
  return `  const enabledItems = ${enabledItemsSource};
  const selectableItems = ${selectableItemsSource};
  const authoredDefaultValue = selectableItems.find(item => item.selected)?.value ?? selectableItems[0]?.value;
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? authoredDefaultValue);
  const isControlled = valueProp !== undefined;
  const selectedValue = isControlled ? valueProp : internalValue;
  const selectedItemIsAvailable = selectableItems.some(item => item.value === selectedValue);
  const fallbackFocusableValue = ${fallbackFocusableValueSource};
  const activeValue = ${activeValueSource};
  const generatedId = React.useId();
  const tabListId = rest.id ?? \`tabs-${"${toDomId(generatedId)}"}\`;
`;
}

function createTabCollectionSharedPanelRuntimeSource(descriptor) {
  if (!descriptor?.sharedPanel) return "";
  return `  const activeIndex = resolvedItems.findIndex(item => item.value === activeValue);
  const activeItem = activeIndex >= 0 ? resolvedItems[activeIndex] : undefined;
  const panelId = panelIdProp ?? \`\${tabListId}-panel\`;
  const panelContent = activeItem?.panel;
  const hasCustomPanel = panelContent !== undefined;
  const isPrimitivePanel = typeof panelContent === "string" || typeof panelContent === "number";
`;
}

function createTabCollectionInteractionSource(disabledExportName) {
  const disabledGuard = disabledExportName ? `    if (${disabledExportName}) return;\n` : "";
  const reconciliationDisabledGuard = disabledExportName ? ` || ${disabledExportName}` : "";
  const reconciliationDisabledDependency = disabledExportName ? `, ${disabledExportName}` : "";
  return `  const tabRefs = React.useRef(new Map());
  React.useEffect(() => {
    if (isControlled${reconciliationDisabledGuard} || internalValue === activeValue) return;
    setInternalValue(activeValue);
  }, [isControlled${reconciliationDisabledDependency}, internalValue, activeValue]);
  const selectTab = (nextValue) => {
${disabledGuard}    if (nextValue === activeValue) return;
    if (!isControlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  };
  const handleTabKeyDown = (event, currentValue) => {
${disabledGuard}    const currentIndex = enabledItems.findIndex(item => item.value === currentValue);
    if (currentIndex < 0) return;
    const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
    const previousKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
    let nextIndex;
    if (event.key === nextKey) nextIndex = (currentIndex + 1) % enabledItems.length;
    else if (event.key === previousKey) nextIndex = (currentIndex - 1 + enabledItems.length) % enabledItems.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = enabledItems.length - 1;
    else return;
    event.preventDefault();
    const nextValue = enabledItems[nextIndex].value;
    tabRefs.current.get(nextValue)?.focus();
    selectTab(nextValue);
  };
`;
}

function createTabCollectionRuntimeSource(componentName, disabledExportName = null, descriptor = null) {
  return [
    createTabCollectionValidationSource(componentName),
    createTabCollectionSelectionSource(disabledExportName),
    createTabCollectionSharedPanelRuntimeSource(descriptor),
    createTabCollectionInteractionSource(disabledExportName),
  ].join("");
}


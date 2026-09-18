/* Top-level React component source assembly. */

function createReactComponentSource(
  componentName,
  cssClassName = createExportCssClassAllocator()(componentName),
  exportMetadata = null,
) {
  const hasVariants = variantModel.getVariants().length > 0;
  const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
  const variantAxes = hasVariants ? getExportVariantAxes(allocateIdentifier) : [];
  const stateAxes = hasVariants ? getStateVariantAxes() : [];
  const excludedVariantPropIds = new Set([...variantAxes, ...stateAxes].map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    allocateIdentifier,
    excludedVariantPropIds,
  });
  const disabledStateProp = getDisabledStateExportProp(allocateIdentifier, exportProps);
  if (disabledStateProp) exportProps.push(disabledStateProp);
  const toggleBindings = createExportToggleBindings(exportProps, variantAxes, allocateIdentifier);
  const defaultVariant = getDefaultVariant();
  const dependencies = exportMetadata ? [...new Set(layerRecords
    .filter(record => record.type === "component-instance")
    .map(record => record.sourceComponentId))] : [];
  const imports = dependencies.map(id => {
    const source = exportMetadata.get(id);
    if (!source) throw new Error(`Cannot export missing component ${id}.`);
    return `import ${source.name} from "./${source.name}";`;
  }).join("\n");
  const instanceOverrideMergeSource = createInstanceOverrideMergeSource(dependencies.length > 0);
  const instanceParameters = getExportInstanceParameters(exportMetadata);
  const tabCollection = getTabCollectionDescriptor(exportMetadata);
  if (tabCollection && !(hasVariants && defaultVariant)) {
    const exportVariants = [{ variant: null, key: "default" }];
    const rootLayer = { type: "frame", record: currentComponent.frameRecord };
    const variantStyleSource = createExportVariantStyleSource(
      rootLayer,
      exportProps,
      exportVariants,
      [],
      exportVariants[0],
    );
    const tabParameters = [
      ...getExportParameterRows(exportProps, toggleBindings),
      "items",
      "value: valueProp",
      "defaultValue",
      "onValueChange",
      ...(tabCollection.sharedPanel ? ["panelId: panelIdProp"] : []),
      `${JSON.stringify("aria-label")}: ariaLabel = ${JSON.stringify(componentName)}`,
      "instanceOverrides = {}",
    ];
    const parameterSource = createForwardRefParameterSource(tabParameters);
    const itemsSource = createTabCollectionItemsSource(tabCollection, exportVariants, [], exportMetadata);
    const wrapperStyleSource = createTabCollectionWrapperStyleSource(tabCollection, exportVariants, []);
    const orientationSource = createTabCollectionOrientationSource(exportVariants, [], tabCollection);
    const runtimeSource = createExportVariantRuntimeSource(cssClassName, [], {
      includeCombinationCorrections: variantStyleSource.hasCombinationCorrections,
      includeDynamicStyles: variantStyleSource.hasDynamicStyles,
      includeStyleValues: [
        itemsSource.runtimeSource,
        wrapperStyleSource.runtimeSource,
        orientationSource.runtimeSource,
      ].some((source) => source.includes("styleValues")),
      simpleRuntimeSource: variantStyleSource.simpleRuntimeSource,
    });
    const disabledExportName = getTabListDisabledExportName(exportProps, [], tabCollection);
    const tabRuntimeSource = createTabCollectionRuntimeSource(componentName, disabledExportName, tabCollection);
    const resolvedTabRuntimeSource = tabCollection.isRootTabList
      ? tabRuntimeSource
      : tabRuntimeSource.replace("const tabListId = rest.id ?? ", "const tabListId = ");
    const panelMarkup = tabCollection.isRootTabList ? createTabCollectionPanelsMarkup(
      tabCollection,
      exportProps,
      null,
      { cssClassName },
      toggleBindings,
      { values: "styleValues", styles: "variantStyles" },
      [],
      exportMetadata,
    ) : "";
    const tabListClassName = tabCollection.isRootTabList ? "" : getExportLayerClassName(
      cssClassName, getExportLayerKey(tabCollection.tabList),
    );
    const tabListMarkup = createTabCollectionComponentMarkup(
      tabCollection, [], disabledExportName, wrapperStyleSource.hasStyle, panelMarkup, tabListClassName,
    );
    const panelContentOverrides = createTabPanelContentOverrides(
      tabCollection,
      exportProps,
      null,
      { cssClassName },
      toggleBindings,
      { values: "styleValues", styles: "variantStyles" },
      [],
      exportMetadata,
    );
    const componentMarkup = tabCollection.isRootTabList ? tabListMarkup : renderExportLayer(
      rootLayer,
      2,
      exportProps,
      null,
      { cssClassName, rootScopeExpression: "variantClassName" },
      toggleBindings,
      { values: "styleValues", styles: "variantStyles" },
      [],
      exportMetadata,
      createTabPanelSemanticAttributes(tabCollection),
      new Map([[getExportLayerKey(tabCollection.tabList), tabListMarkup]]),
      panelContentOverrides,
      createTabPanelSemanticStyles(tabCollection),
    );
    const variantValueHelperSource = createVariantValueHelperSource(
      itemsSource.runtimeSource,
      wrapperStyleSource.runtimeSource,
      orientationSource.runtimeSource,
    );
    return `import React from "react";\n${imports ? `${imports}\n` : ""}\n${instanceOverrideMergeSource}${variantStyleSource.staticSource}${variantValueHelperSource}${itemsSource.staticSource}${wrapperStyleSource.staticSource}${orientationSource.staticSource}const toDomId = (value) => String(value).replace(/[^a-zA-Z0-9_-]+/g, "-");\n\nconst ${componentName} = React.forwardRef(function ${componentName}(${parameterSource}, ref) {\n${runtimeSource}${itemsSource.runtimeSource}${wrapperStyleSource.runtimeSource}${orientationSource.runtimeSource}${resolvedTabRuntimeSource}  return (\n${componentMarkup}\n  );\n});\n\nexport default ${componentName};\n`;
  }
  if (hasVariants && defaultVariant) {
    const exportVariants = getBaseExportVariantEntries(variantAxes, stateAxes);
    const defaultExportVariant = exportVariants.find(({ variant }) => variant === defaultVariant) ?? exportVariants[0];
    const rootLayer = { type: "frame", record: currentComponent.frameRecord };
    const variantStyleSource = createExportVariantStyleSource(
      rootLayer,
      exportProps,
      exportVariants,
      variantAxes,
      defaultExportVariant,
    );
    const stateStyleImport = stateAxes.length > 0 ? `import "./${componentName}.css";\n` : "";
    const context = createVariantExportContext(defaultExportVariant.variant);
    if (tabCollection) {
      const tabParameters = [
        ...getExportParameterRows(variantAxes, toggleBindings),
        ...getExportParameterRows(exportProps, toggleBindings),
        "items",
        "value: valueProp",
        "defaultValue",
        "onValueChange",
        ...(tabCollection.sharedPanel ? ["panelId: panelIdProp"] : []),
        `${JSON.stringify("aria-label")}: ariaLabel = ${JSON.stringify(componentName)}`,
        "instanceOverrides = {}",
      ];
      const parameterSource = createForwardRefParameterSource(tabParameters);
      const itemsSource = createTabCollectionItemsSource(
        tabCollection,
        exportVariants,
        variantAxes,
        exportMetadata,
        defaultExportVariant,
      );
      const wrapperStyleSource = createTabCollectionWrapperStyleSource(tabCollection, exportVariants, variantAxes);
      const orientationSource = createTabCollectionOrientationSource(exportVariants, variantAxes, tabCollection);
      const runtimeSource = createExportVariantRuntimeSource(cssClassName, variantAxes, {
        includeDefaultScope: stateAxes.length > 0,
        includeCombinationCorrections: variantStyleSource.hasCombinationCorrections,
        includeDynamicStyles: variantStyleSource.hasDynamicStyles,
        includeStyleValues: [
          itemsSource.runtimeSource,
          wrapperStyleSource.runtimeSource,
          orientationSource.runtimeSource,
        ].some((source) => source.includes("styleValues")),
        simpleRuntimeSource: variantStyleSource.simpleRuntimeSource,
      });
      const disabledExportName = getTabListDisabledExportName(exportProps, variantAxes, tabCollection);
      const tabRuntimeSource = createTabCollectionRuntimeSource(componentName, disabledExportName, tabCollection);
      const resolvedTabRuntimeSource = tabCollection.isRootTabList
        ? tabRuntimeSource
        : tabRuntimeSource.replace("const tabListId = rest.id ?? ", "const tabListId = ");
      const panelMarkup = tabCollection.isRootTabList ? createTabCollectionPanelsMarkup(
        tabCollection,
        exportProps,
        context,
        { cssClassName },
        toggleBindings,
        { values: "styleValues", styles: "variantStyles" },
        variantAxes,
        exportMetadata,
      ) : "";
      const tabListClassName = tabCollection.isRootTabList ? "" : getExportLayerClassName(
        cssClassName, getExportLayerKey(tabCollection.tabList),
      );
      const tabListMarkup = createTabCollectionComponentMarkup(
        tabCollection, variantAxes, disabledExportName, wrapperStyleSource.hasStyle, panelMarkup, tabListClassName,
      );
      const panelContentOverrides = createTabPanelContentOverrides(
        tabCollection,
        exportProps,
        context,
        { cssClassName },
        toggleBindings,
        { values: "styleValues", styles: "variantStyles" },
        variantAxes,
        exportMetadata,
      );
      const componentMarkup = tabCollection.isRootTabList ? tabListMarkup : renderExportLayer(
        rootLayer,
        2,
        exportProps,
        context,
        { cssClassName, rootScopeExpression: "variantClassName" },
        toggleBindings,
        { values: "styleValues", styles: "variantStyles" },
        variantAxes,
        exportMetadata,
        createTabPanelSemanticAttributes(tabCollection),
        new Map([[getExportLayerKey(tabCollection.tabList), tabListMarkup]]),
        panelContentOverrides,
        createTabPanelSemanticStyles(tabCollection),
      );
      const variantValueHelperSource = createVariantValueHelperSource(
        itemsSource.runtimeSource,
        wrapperStyleSource.runtimeSource,
        orientationSource.runtimeSource,
      );
      return `import React from "react";\n${imports ? `${imports}\n` : ""}${stateStyleImport}\n${instanceOverrideMergeSource}${variantStyleSource.staticSource}${variantValueHelperSource}${itemsSource.staticSource}${wrapperStyleSource.staticSource}${orientationSource.staticSource}const toDomId = (value) => String(value).replace(/[^a-zA-Z0-9_-]+/g, "-");\n\nconst ${componentName} = React.forwardRef(function ${componentName}(${parameterSource}, ref) {\n${runtimeSource}${itemsSource.runtimeSource}${wrapperStyleSource.runtimeSource}${orientationSource.runtimeSource}${resolvedTabRuntimeSource}  return (\n${componentMarkup}\n  );\n});\n\nexport default ${componentName};\n`;
    }
    const componentMarkup = renderExportLayer(
      { type: "frame", record: currentComponent.frameRecord },
      2,
      exportProps,
      context,
      { cssClassName, rootScopeExpression: "variantClassName" },
      toggleBindings,
      { values: "styleValues", styles: "variantStyles" },
      variantAxes,
      exportMetadata,
    );
    const defaultAxisParameters = getExportParameterRows(variantAxes, toggleBindings);
    const parameters = [
      ...defaultAxisParameters,
      ...getExportParameterRows(exportProps, toggleBindings),
      ...toggleBindings.map((binding) => binding.changeExportName),
      ...instanceParameters,
    ];
    const toggleStateSource = createExportToggleStateSource(toggleBindings);
    const ariaLabelSource = createExportAriaLabelSource(exportProps);
    const instanceSettingsSource = exportMetadata
      ? createExportInstanceSettingsSource(exportVariants, variantAxes, exportMetadata)
      : { staticSource: "", runtimeSource: "" };
    const runtimeSource = createExportVariantRuntimeSource(cssClassName, variantAxes, {
      includeDefaultScope: stateAxes.length > 0,
      includeCombinationCorrections: variantStyleSource.hasCombinationCorrections,
      includeDynamicStyles: variantStyleSource.hasDynamicStyles,
      includeStyleValues: instanceSettingsSource.runtimeSource.includes("styleValues"),
      simpleRuntimeSource: variantStyleSource.simpleRuntimeSource,
    });
    const parameterSource = createForwardRefParameterSource(parameters);
    const variantValueHelperSource = createVariantValueHelperSource(instanceSettingsSource.runtimeSource);
    return `import React from "react";\n${imports ? `${imports}\n` : ""}${stateStyleImport}\n${instanceOverrideMergeSource}${variantStyleSource.staticSource}${variantValueHelperSource}${instanceSettingsSource.staticSource}\nconst ${componentName} = React.forwardRef(function ${componentName}(${parameterSource}, ref) {\n${toggleStateSource}${ariaLabelSource}${runtimeSource}${instanceSettingsSource.runtimeSource}  return (\n${componentMarkup}\n  );\n});\n\nexport default ${componentName};\n`;
  }
  const componentMarkup = currentComponent?.frameRecord
    ? renderExportLayer(
      { type: "frame", record: currentComponent.frameRecord },
      2,
      exportProps,
      null,
      null,
      toggleBindings,
      null,
      [],
      exportMetadata,
    )
    : "    <></>";
  const parameters = [
    ...getExportParameterRows(exportProps, toggleBindings),
    ...toggleBindings.map((binding) => binding.changeExportName),
    ...instanceParameters,
  ];
  const toggleStateSource = createExportToggleStateSource(toggleBindings);
  const ariaLabelSource = createExportAriaLabelSource(exportProps);
  const parameterSource = createForwardRefParameterSource(parameters);

  return `import React from "react";\n${imports ? `${imports}\n` : ""}\n${instanceOverrideMergeSource}const ${componentName} = React.forwardRef(function ${componentName}(${parameterSource}, ref) {\n${toggleStateSource}${ariaLabelSource}  return (\n${componentMarkup}\n  );\n});\n\nexport default ${componentName};\n`;
}

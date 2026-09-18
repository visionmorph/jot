/* Storybook source generation and export download orchestration. */

function createStorySource(componentName) {
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
  const exportVariants = getBaseExportVariantEntries(variantAxes, stateAxes);
  const actionProps = exportProps.filter((prop) => prop.type === "action");
  const actionNames = [
    ...actionProps.map((prop) => prop.exportName),
    ...toggleBindings.map((binding) => binding.changeExportName),
  ];
  const actionImport = actionNames.length > 0 ? `import { fn } from "storybook/test";\n` : "";
  const argsImport = toggleBindings.length > 0 ? `import { useArgs } from "storybook/preview-api";\n` : "";
  const metaArgs = actionNames.length > 0
    ? `\n  args: {\n${actionNames.map((name) => `    ${name}: fn().mockName(${JSON.stringify(name)}),`).join("\n")}\n  },`
    : "";
  const variantAxisArgTypes = variantAxes.map((axis) => axis.type === "boolean"
    ? `    ${axis.exportName}: { control: "boolean" },`
    : `    ${axis.exportName}: { control: "select", options: ${JSON.stringify(getVariantPropValues(axis))} },`);
  const internalTransportArgTypes = ["instanceOverrides"]
    .map((name) => `    ${name}: { control: false, table: { disable: true } },`);
  const argTypes = `\n  argTypes: {\n${[...variantAxisArgTypes, ...exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: { action: ${JSON.stringify(prop.property === "onClick" ? "clicked" : prop.exportName)}, control: false },`
      : prop.type === "enum"
        ? `    ${prop.exportName}: { control: "select", options: ${JSON.stringify(getComponentPropOptions(prop))} },`
        : `    ${prop.exportName}: { control: "${prop.type === "string" ? "text" : "boolean"}" },`), ...toggleBindings.map((binding) => `    ${binding.changeExportName}: { action: "checked changed", control: false },`), ...internalTransportArgTypes].filter(Boolean).join("\n")}\n  },`;
  const defaultVariant = getDefaultVariant();
  const defaultArgRows = [
    ...variantAxes.map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisDefaultValue(axis))},`),
    ...exportProps
      .filter((prop) => prop.type !== "action")
      .map((prop) => `    ${prop.exportName}: ${JSON.stringify(prop.defaultValue)},`),
  ];
  const defaultArgs = defaultArgRows.length > 0
    ? `{\n  args: {\n${defaultArgRows.join("\n")}\n  },\n}`
    : "{}";
  const usedStoryNames = new Set(["Default"]);
  const variantStories = exportVariants
    .filter(({ variant }) => variant !== defaultVariant)
    .map(({ variant, key }, index) => {
      let storyName = toReactComponentName(key || `Variant ${index + 2}`);
      const baseName = storyName === "Default" ? "VariantDefault" : storyName;
      storyName = baseName;
      let suffix = 2;
      while (usedStoryNames.has(storyName)) storyName = `${baseName}${suffix++}`;
      usedStoryNames.add(storyName);
      const axisRows = variantAxes
        .map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisValue(variant, axis))},`);
      return `\nexport const ${storyName} = {\n  args: {\n    ...Default.args,\n${axisRows.join("\n")}\n  },\n};`;
    }).join("\n");
  const toggleDecorator = toggleBindings.length > 0
    ? `\n  decorators: [\n    (Story) => {\n      const [args, updateArgs] = useArgs();\n      return <Story args={{\n        ...args,\n${toggleBindings.map((binding) => `        ${binding.changeExportName}: (${binding.nextExportName}) => {\n          args.${binding.changeExportName}?.(${binding.nextExportName});\n          updateArgs({ ${binding.exportName}: ${binding.nextExportName} });\n        },`).join("\n")}\n      }} />;\n    },\n  ],`
    : "";
  return `${actionImport}${argsImport}import ${componentName} from "./${componentName}";\n\nconst meta = {\n  title: "Components/${componentName}",\n  component: ${componentName},${metaArgs}${argTypes}${toggleDecorator}\n};\n\nexport default meta;\n\nexport const Default = ${defaultArgs};${variantStories}\n`;
}

function downloadExportFile(fileName, source) {
  const type = fileName.endsWith(".css") ? "text/css;charset=utf-8" : "text/javascript;charset=utf-8";
  const blob = new Blob([source], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportAllComponents() {
  if (!currentComponent) return;
  saveCurrentComponentWorkspace();
  const originalComponentId = currentComponent.id;
  const exportFiles = [];
  const usedComponentNames = new Set();
  const allocateCssClassName = createExportCssClassAllocator();
  const exportNames = new Map();

  components.forEach((component) => {
    const baseName = toReactComponentName(component.name || "Generated Component");
    let name = baseName;
    let suffix = 2;
    while (usedComponentNames.has(name.toLowerCase())) name = `${baseName}${suffix++}`;
    usedComponentNames.add(name.toLowerCase());
    exportNames.set(component.id, { name, cssClassName: allocateCssClassName(name) });
  });
  const exportMetadata = new Map();

  try {
    components.forEach((component) => {
      activateComponent(component.id, { saveCurrent: false, selectComponent: false, render: false });
      const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
      const axes = variantModel.getVariants().length ? getExportVariantAxes(allocateIdentifier) : [];
      const excludedVariantPropIds = new Set([...axes, ...getStateVariantAxes()].map(axis => axis.id));
      const props = getExportComponentProps({ allocateIdentifier, excludedVariantPropIds });
      const disabledStateProp = getDisabledStateExportProp(allocateIdentifier, props);
      if (disabledStateProp) props.push(disabledStateProp);
      const selectedAxis = axes.find(axis => getVariantAxisComponentProp(axis)?.property === "selected");
      const selectedProp = props.find(prop => prop.property === "selected");
      const disabledAxis = axes.find(axis => getVariantAxisComponentProp(axis)?.property === "disabled");
      const disabledProp = props.find(prop => prop.property === "disabled");
      const labelProp = props.find(prop => prop.property === "textContent");
      const ariaLabelProp = props.find(prop => prop.property === "ariaLabel");
      const labelTextRecord = labelProp?.targetTextId != null
        ? textRecords.find(record => record.id === labelProp.targetTextId)
        : textRecords[0];
      exportMetadata.set(component.id, {
        ...exportNames.get(component.id),
        axes,
        props,
        semantics: {
          selectedExportName: selectedAxis?.exportName ?? selectedProp?.exportName ?? null,
          disabledExportName: disabledAxis?.exportName ?? disabledProp?.exportName ?? null,
          labelExportName: labelProp?.exportName ?? null,
          labelOverrideKey: labelTextRecord ? `text:${labelTextRecord.id}` : null,
          labelDefaultValue: labelTextRecord?.element.textContent ?? null,
          ariaLabelExportName: ariaLabelProp?.exportName ?? null,
          ariaLabelDefaultValue: ariaLabelProp?.defaultValue
            ?? currentComponent.frameRecord.element.getAttribute("aria-label")
            ?? null,
        },
      });
    });
    components.forEach((component) => {
      activateComponent(component.id, { saveCurrent: false, selectComponent: false, render: false });
      const { name: componentName, cssClassName } = exportNames.get(component.id);
      const stateStylesheet = createStateStylesheetSource(componentName, cssClassName);
      exportFiles.push(
        { name: `${componentName}.jsx`, source: createReactComponentSource(componentName, cssClassName, exportMetadata) },
        { name: `${componentName}.stories.jsx`, source: createStorySource(componentName) },
        ...(stateStylesheet ? [{ name: `${componentName}.css`, source: stateStylesheet }] : []),
      );
    });
  } finally {
    activateComponent(originalComponentId, { saveCurrent: false, selectComponent: false });
  }

  exportFiles.forEach((file) => downloadExportFile(file.name, file.source));
}

exportComponentsButton?.addEventListener("click", exportAllComponents);

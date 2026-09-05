/* React and Storybook source generation, SVG serialization, and export downloads. */

const REACT_EXPORT_INTERNAL_NAMES = [
  "variant",
  "variants",
  "authoredCombinations",
  "combinationKey",
  "selectedVariant",
];

const JAVASCRIPT_RESERVED_WORDS = new Set([
  "arguments",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "eval",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

function createExportIdentifierAllocator(reservedNames = []) {
  const usedNames = new Set(reservedNames);
  return (value, fallback) => {
    const sanitizedName = String(value ?? "").trim().replace(/[^a-zA-Z0-9_$]/g, "");
    let exportName = /^[a-zA-Z_$]/.test(sanitizedName) && !JAVASCRIPT_RESERVED_WORDS.has(sanitizedName)
      ? sanitizedName
      : fallback;
    const baseName = exportName;
    let suffix = 2;
    while (usedNames.has(exportName) || JAVASCRIPT_RESERVED_WORDS.has(exportName)) {
      exportName = `${baseName}${suffix++}`;
    }
    usedNames.add(exportName);
    return exportName;
  };
}

function createExportCssClassAllocator(reservedNames = []) {
  const usedNames = new Set(reservedNames.map((name) => String(name).toLowerCase()));
  return (value) => {
    const sanitizedName = String(value ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const baseName = /^[a-zA-Z_]/.test(sanitizedName)
      ? sanitizedName
      : sanitizedName
        ? `Component-${sanitizedName}`
        : "GeneratedComponent";
    let className = baseName;
    let suffix = 2;
    while (usedNames.has(className.toLowerCase())) className = `${baseName}-${suffix++}`;
    usedNames.add(className.toLowerCase());
    return className;
  };
}

function toReactComponentName(value) {
  const name = value
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, character) => character.toUpperCase())
    .replace(/^[a-z]/, (character) => character.toUpperCase())
    .replace(/[^a-zA-Z0-9_$]/g, "");
  if (!name) return "GeneratedComponent";
  return /^\d/.test(name) ? `Component${name}` : name;
}

function findVisibilityProp(exportProps, type, id) {
  return exportProps.find((prop) => prop.type === "boolean" && prop.property === "visibility" && (
    (type === "frame" && prop.targetFrameId === id)
    || (type === "text" && prop.targetTextId === id)
    || (type === "vector" && prop.targetVectorId === id)
  ));
}

function withVisibilityStyle(styleObject, visibilityProp) {
  if (!visibilityProp) return { style: styleObject, rawProperties: null };
  const controlledStyle = { ...styleObject };
  delete controlledStyle.visibility;
  const originalDisplay = controlledStyle.display;
  const trueBranch = originalDisplay === undefined ? "undefined" : JSON.stringify(originalDisplay);
  return {
    style: { ...controlledStyle, display: `${visibilityProp.exportName} ? ${trueBranch} : "none"` },
    rawProperties: new Set(["display"]),
  };
}

function getExportComponentProps({
  allocateIdentifier = createExportIdentifierAllocator(),
  excludedVariantPropIds = new Set(),
} = {}) {
  return componentProps.flatMap((prop, index) => {
    if (prop.variantPropId != null && excludedVariantPropIds.has(prop.variantPropId)) return [];
    const targetFrame = getFrameRecord(prop.targetFrameId);
    const targetText = getTextRecord(prop.targetTextId);
    const targetVector = getVectorRecord(prop.targetVectorId);
    const hasCompatibleButtonTarget = Boolean(
      targetFrame
      && targetFrame.parentId === null
      && normalizeFrameHtmlTag(targetFrame.element.dataset.htmlTag || "div") === "button",
    );
    const isValid = prop.type === "boolean"
      ? prop.property === "disabled"
        ? hasCompatibleButtonTarget
        : prop.property === "visibility" && Boolean(targetFrame || targetText || targetVector)
      : prop.type === "string"
        ? prop.property === "textContent" && Boolean(targetText)
        : prop.property === "onClick" && hasCompatibleButtonTarget;
    if (!isValid) return [];

    const exportName = allocateIdentifier(prop.name, `prop${index + 1}`);
    return [{ ...prop, exportName }];
  });
}

function renderExportRichTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return `{${JSON.stringify(node.textContent ?? "")}}`;
  if (!(node instanceof HTMLElement)) return "";
  const content = Array.from(node.childNodes).map(renderExportRichTextNode).join("");
  const color = node.style.color;
  return color
    ? `<span style={{ color: ${JSON.stringify(color)} }}>${content}</span>`
    : content;
}

function renderExportTextContent(element, stringProp) {
  if (stringProp) return `{${stringProp.exportName}}`;
  if (!element.querySelector("[data-rich-text-color]")) {
    return `{${JSON.stringify(element.textContent || "")}}`;
  }
  return Array.from(element.childNodes).map(renderExportRichTextNode).join("");
}

function renderExportLayer(layer, depth, exportProps, exportContext = null, exportClasses = null) {
  const indent = "  ".repeat(depth);
  const record = getVariantExportRecord(layer.type, layer.record, exportContext);
  const target = record.isComponent ? "component:0" : `${layer.type}:${record.id}`;
  const className = exportClasses
    ? getExportLayerClassName(exportClasses.cssClassName, target, exportClasses.rootScopeClass)
    : "";
  if (layer.type === "vector") {
    const variantStyle = getVariantExportStyle(exportContext, target);
    return renderExportVector(record, depth, exportProps, variantStyle, className);
  }
  if (layer.type === "text") {
    const stringProp = exportProps.find((prop) => prop.targetTextId === record.id && prop.property === "textContent");
    const content = renderExportTextContent(record.element, stringProp);
    const textVisibilityProp = findVisibilityProp(exportProps, "text", record.id);
    const variantStyle = getVariantExportStyle(exportContext, target);
    const { style: textStyleObject, rawProperties: textRawProperties } = withVisibilityStyle({ ...getExportTextStyle(record), ...variantStyle }, textVisibilityProp);
    return `${indent}<span${className ? ` className=${JSON.stringify(className)}` : ""} style={${formatReactStyle(textStyleObject, textRawProperties)}}>${content}</span>`;
  }

  const children = record.isComponent
    ? getLayerChildren(null)
    : getLayerChildren(record.id);
  const frameVisibilityProp = findVisibilityProp(exportProps, "frame", record.id);
  const variantStyle = getVariantExportStyle(exportContext, target);
  const { style: frameStyleObject, rawProperties: frameRawProperties } = withVisibilityStyle({ ...getExportFrameStyle(record), ...variantStyle }, frameVisibilityProp);
  const style = formatReactStyle(frameStyleObject, frameRawProperties);
  const htmlTag = normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div");
  const disabledProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "disabled");
  const onClickProp = exportProps.find((prop) => prop.targetFrameId === record.id && prop.property === "onClick");
  const isVariantDisabled = record.element.hasAttribute("disabled");
  const classAttribute = className ? ` className=${JSON.stringify(className)}` : "";
  const attributes = htmlTag === "button"
    ? ` type="button"${disabledProp ? ` disabled={${disabledProp.exportName}}` : isVariantDisabled ? " disabled" : ""}${onClickProp ? ` onClick={${onClickProp.exportName}}` : ""}`
    : "";
  if (children.length === 0) return `${indent}<${htmlTag}${classAttribute}${attributes} style={${style}} />`;
  const childMarkup = children.map((child) => renderExportLayer(child, depth + 1, exportProps, exportContext, exportClasses)).join("\n");
  return `${indent}<${htmlTag}${classAttribute}${attributes} style={${style}}>\n${childMarkup}\n${indent}</${htmlTag}>`;
}

function createReactComponentSource(
  componentName,
  cssClassName = createExportCssClassAllocator()(componentName),
) {
  const hasVariants = variantModel.getInstances().length > 0;
  const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
  const variantAxes = hasVariants ? getExportVariantAxes(allocateIdentifier) : [];
  const stateAxes = hasVariants ? getStateVariantAxes() : [];
  const excludedVariantPropIds = new Set([...variantAxes, ...stateAxes].map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    allocateIdentifier,
    excludedVariantPropIds,
  });
  const defaultVariant = getDefaultVariantInstance();
  if (hasVariants && defaultVariant) {
    const exportVariants = getBaseExportVariantEntries(variantAxes, stateAxes)
      .map((entry, index) => ({ ...entry, scopeClass: getExportScopeClass(cssClassName, index) }));
    const defaultExportVariant = exportVariants.find(({ instance }) => instance === defaultVariant) ?? exportVariants[0];
    const variantMarkup = exportVariants.map(({ instance, key, scopeClass }) => {
      const context = createVariantExportContext(instance);
      const markup = renderExportLayer(
        { type: "frame", record: currentComponent.frameRecord },
        3,
        exportProps,
        context,
        { cssClassName, rootScopeClass: scopeClass },
      );
      return `    ${JSON.stringify(key)}: (\n${markup}\n    ),`;
    }).join("\n");
    const combinationOwners = new Map();
    [defaultExportVariant, ...exportVariants.filter((entry) => entry !== defaultExportVariant)].forEach((entry) => {
      if (!combinationOwners.has(entry.combinationKey)) combinationOwners.set(entry.combinationKey, entry.key);
    });
    const combinationRows = [...combinationOwners.entries()]
      .map(([combinationKey, key]) => `    ${JSON.stringify(combinationKey)}: ${JSON.stringify(key)},`)
      .join("\n");
    const defaultAxisParameters = variantAxes.map((axis) => (
      `${axis.exportName} = ${JSON.stringify(getExportVariantAxisDefaultValue(axis))}`
    ));
    const parameters = [
      ...defaultAxisParameters,
      "variant",
      ...exportProps.map((prop) => prop.type === "action"
        ? prop.exportName
        : `${prop.exportName} = ${JSON.stringify(prop.defaultValue)}`),
    ].join(", ");
    const axisValues = variantAxes.map((axis) => axis.exportName).join(", ");
    const stateStyleImport = stateAxes.length > 0 ? `import "./${componentName}.css";\n` : "";
    return `import React from "react";\n${stateStyleImport}\nexport default function ${componentName}({ ${parameters} }) {\n  const variants = {\n${variantMarkup}\n  };\n  const authoredCombinations = {\n${combinationRows}\n  };\n  const combinationKey = JSON.stringify([${axisValues}]);\n  const selectedVariant = variant ?? authoredCombinations[combinationKey];\n  if (!selectedVariant || !variants[selectedVariant]) {\n    console.warn(${JSON.stringify(`${componentName}: no authored variant matches the supplied variant properties.`)}, { ${axisValues} });\n  }\n  return variants[selectedVariant] ?? variants[${JSON.stringify(defaultExportVariant.key)}];\n}\n`;
  }
  const componentMarkup = currentComponent?.frameRecord
    ? renderExportLayer({ type: "frame", record: currentComponent.frameRecord }, 2, exportProps)
    : "    <></>";
  const parameters = exportProps.length > 0
    ? `{ ${exportProps.map((prop) => prop.type === "action"
      ? prop.exportName
      : `${prop.exportName} = ${JSON.stringify(prop.defaultValue)}`).join(", ")} }`
    : "";

  return `import React from "react";\n\nexport default function ${componentName}(${parameters}) {\n  return (\n${componentMarkup}\n  );\n}\n`;
}

function createStorySource(componentName) {
  const hasVariants = variantModel.getInstances().length > 0;
  const allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES);
  const variantAxes = hasVariants ? getExportVariantAxes(allocateIdentifier) : [];
  const stateAxes = hasVariants ? getStateVariantAxes() : [];
  const excludedVariantPropIds = new Set([...variantAxes, ...stateAxes].map((axis) => axis.id));
  const exportProps = getExportComponentProps({
    allocateIdentifier,
    excludedVariantPropIds,
  });
  const exportVariants = getBaseExportVariantEntries(variantAxes, stateAxes);
  const actionProps = exportProps.filter((prop) => prop.type === "action");
  const actionImport = actionProps.length > 0 ? `import { action } from "storybook/actions";\n` : "";
  const actionDeclarations = actionProps.length > 0
    ? `${actionProps.map((prop) => `const ${prop.exportName}Action = action("${prop.property === "onClick" ? "clicked" : prop.exportName}");`).join("\n")}\n\n`
    : "";
  const variantAxisArgTypes = variantAxes.map((axis) => axis.type === "boolean"
    ? `    ${axis.exportName}: { control: "boolean" },`
    : `    ${axis.exportName}: { control: "select", options: ${JSON.stringify(getVariantPropValues(axis))} },`);
  const hasSelectableVariants = exportVariants.length > 1;
  const variantEscapeArgType = hasSelectableVariants
    ? "    variant: { control: false, table: { disable: true } },"
    : "";
  const argTypes = exportProps.length > 0 || variantAxes.length > 0 || hasSelectableVariants
    ? `\n  argTypes: {\n${[...variantAxisArgTypes, variantEscapeArgType, ...exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: { control: false },`
      : `    ${prop.exportName}: { control: "${prop.type === "string" ? "text" : "boolean"}" },`)].filter(Boolean).join("\n")}\n  },`
    : "";
  const defaultVariant = getDefaultVariantInstance();
  const defaultExportVariant = exportVariants.find(({ instance }) => instance === defaultVariant) ?? exportVariants[0];
  const defaultArgRows = [
    ...variantAxes.map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisDefaultValue(axis))},`),
    ...exportProps.map((prop) => prop.type === "action"
      ? `    ${prop.exportName}: ${prop.exportName}Action,`
      : `    ${prop.exportName}: ${JSON.stringify(prop.defaultValue)},`),
  ];
  const defaultArgs = defaultArgRows.length > 0
    ? `{\n  args: {\n${defaultArgRows.join("\n")}\n  },\n}`
    : "{}";
  const usedStoryNames = new Set(["Default"]);
  const canonicalCombinationOwner = new Map();
  if (defaultExportVariant) {
    [defaultExportVariant, ...exportVariants.filter((entry) => entry !== defaultExportVariant)].forEach((entry) => {
      if (!canonicalCombinationOwner.has(entry.combinationKey)) canonicalCombinationOwner.set(entry.combinationKey, entry.key);
    });
  }
  const variantStories = exportVariants
    .filter(({ instance }) => instance !== defaultVariant)
    .map(({ instance, key }, index) => {
      let storyName = toReactComponentName(instance.name || `Variant ${index + 2}`);
      const baseName = storyName === "Default" ? "VariantDefault" : storyName;
      storyName = baseName;
      let suffix = 2;
      while (usedStoryNames.has(storyName)) storyName = `${baseName}${suffix++}`;
      usedStoryNames.add(storyName);
      const axisRows = variantAxes
        .map((axis) => `    ${axis.exportName}: ${JSON.stringify(getExportVariantAxisValue(instance, axis))},`);
      const needsNamedEscape = canonicalCombinationOwner.get(
        getExportVariantCombinationKey(instance, variantAxes),
      ) !== key;
      const escapeRow = needsNamedEscape ? [`    variant: ${JSON.stringify(key)},`] : [];
      return `\nexport const ${storyName} = {\n  args: {\n    ...Default.args,\n${[...axisRows, ...escapeRow].join("\n")}\n  },\n};`;
    }).join("\n");
  return `${actionImport}import ${componentName} from "./${componentName}";\n\n${actionDeclarations}const meta = {\n  title: "Components/${componentName}",\n  component: ${componentName},${argTypes}\n};\n\nexport default meta;\n\nexport const Default = ${defaultArgs};${variantStories}\n`;
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

  try {
    components.forEach((component) => {
      activateComponent(component.id, { saveCurrent: false, selectComponent: false, render: false });
      const baseName = toReactComponentName(component.name || "Generated Component");
      let componentName = baseName;
      let suffix = 2;
      while (usedComponentNames.has(componentName.toLowerCase())) {
        componentName = `${baseName}${suffix++}`;
      }
      usedComponentNames.add(componentName.toLowerCase());
      const cssClassName = allocateCssClassName(componentName);
      const stateStylesheet = createStateStylesheetSource(componentName, cssClassName);
      exportFiles.push(
        { name: `${componentName}.jsx`, source: createReactComponentSource(componentName, cssClassName) },
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

/* Shared naming, prop normalization, and source helpers for component exports. */

const REACT_EXPORT_INTERNAL_NAMES = [
  "baseStyles",
  "variantStyleDeltas",
  "variantStyleAxisOrder",
  "simpleVariantStyles",
  "simpleVariantCombinationStyles",
  "getVariantStyle",
  "getVariantValue",
  "variantStyles",
  "styleValues",
  "variantClassName",
  "baseDefaultItems",
  "defaultItemVariantDeltas",
  "defaultItemVariantAxisOrder",
  "defaultItemCombinationCorrections",
  "defaultItemCombinationAxisOrder",
  "getDefaultItems",
  "defaultItems",
  "sharedItemWrapperStylesByVariant",
  "sharedItemWrapperStyleVariantAxes",
  "sharedItemWrapperStyle",
  "orientationByVariant",
  "orientationVariantAxes",
  "orientation",
  "className",
  "style",
  "rest",
  "ref",
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
    const camelCaseName = sanitizedName
      ? `${sanitizedName[0].toLowerCase()}${sanitizedName.slice(1)}`
      : "";
    let exportName = /^[a-zA-Z_$]/.test(camelCaseName) && !JAVASCRIPT_RESERVED_WORDS.has(camelCaseName)
      ? camelCaseName
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

function createExportToggleBindings(exportProps, variantAxes, allocateIdentifier) {
  return componentProps.flatMap((componentProp, index) => {
    if (componentProp.type !== "boolean" || componentProp.property !== "checked") return [];
    const target = getFrameRecord(componentProp.targetFrameId);
    if (!target || normalizeFrameHtmlTag(target.element.dataset.htmlTag || "div") !== "button") return [];
    const stateProp = [...variantAxes, ...exportProps].find((candidate) => (
      (componentProp.variantPropId != null && candidate.id === componentProp.variantPropId)
      || candidate.sourceComponentPropId === componentProp.id
      || (componentProp.variantPropId == null && candidate.id === componentProp.id)
    ));
    if (!stateProp?.exportName) return [];
    const callbackBaseName = `on${stateProp.exportName[0].toUpperCase()}${stateProp.exportName.slice(1)}Change`;
    const stateName = `${stateProp.exportName[0].toUpperCase()}${stateProp.exportName.slice(1)}`;
    return [{
      ...componentProp,
      exportName: stateProp.exportName,
      changeExportName: allocateIdentifier(callbackBaseName, `onToggleChange${index + 1}`),
      controlledExportName: allocateIdentifier(`${stateProp.exportName}Prop`, `toggleProp${index + 1}`),
      defaultExportName: allocateIdentifier(`default${stateName}`, `defaultToggle${index + 1}`),
      internalExportName: allocateIdentifier(`internal${stateName}`, `internalToggle${index + 1}`),
      setInternalExportName: allocateIdentifier(`setInternal${stateName}`, `setInternalToggle${index + 1}`),
      handlerExportName: allocateIdentifier(`handle${stateName}Change`, `handleToggleChange${index + 1}`),
      nextExportName: allocateIdentifier(`next${stateName}`, `nextToggle${index + 1}`),
    }];
  });
}

function getExportParameterRows(props, toggleBindings) {
  return props.flatMap((prop) => {
    const toggleBinding = toggleBindings.find((binding) => binding.exportName === prop.exportName);
    if (toggleBinding) {
      return [
        `${prop.exportName}: ${toggleBinding.controlledExportName}`,
        `${toggleBinding.defaultExportName} = ${JSON.stringify(getVariantPropDefaultValue(prop))}`,
      ];
    }
    if (prop.property === "ariaLabel") {
      return [prop.exportName, `"aria-label": ${prop.nativeAriaLabelExportName}`];
    }
    return [prop.type === "action"
      ? prop.exportName
      : `${prop.exportName} = ${JSON.stringify(prop.defaultValue)}`];
  });
}

function createExportAriaLabelSource(exportProps, indent = "  ") {
  return exportProps
    .filter((prop) => prop.property === "ariaLabel")
    .map((prop) => {
      const defaultValue = String(prop.defaultValue ?? "").trim();
      const defaultExpression = defaultValue ? JSON.stringify(defaultValue) : "undefined";
      return `${indent}const ${prop.resolvedAriaLabelExportName} = ${prop.exportName}?.trim() || ${prop.nativeAriaLabelExportName}?.trim() || ${defaultExpression};\n`;
    })
    .join("");
}

function createExportToggleStateSource(toggleBindings, indent = "  ") {
  return toggleBindings.map((binding) => (
    `${indent}const [${binding.internalExportName}, ${binding.setInternalExportName}] = React.useState(${binding.defaultExportName});\n`
    + `${indent}const ${binding.exportName} = ${binding.controlledExportName} ?? ${binding.internalExportName};\n`
    + `${indent}const ${binding.handlerExportName} = () => {\n`
    + `${indent}  const ${binding.nextExportName} = !${binding.exportName};\n`
    + `${indent}  if (${binding.controlledExportName} === undefined) ${binding.setInternalExportName}(${binding.nextExportName});\n`
    + `${indent}  ${binding.changeExportName}?.(${binding.nextExportName});\n`
    + `${indent}};\n`
  )).join("");
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
      && normalizeFrameHtmlTag(targetFrame.element.dataset.htmlTag || "div") === "button",
    );
    const hasCompatibleInputTarget = Boolean(
      targetFrame
      && normalizeFrameHtmlTag(targetFrame.element.dataset.htmlTag || "div") === "input",
    );
    const hasCompatibleLinkTarget = Boolean(
      targetFrame
      && normalizeFrameHtmlTag(targetFrame.element.dataset.htmlTag || "div") === "a",
    );
    const hasCompatibleAriaLabelTarget = hasCompatibleLinkTarget
      || hasCompatibleButtonTarget || hasCompatibleInputTarget;
    const hasCompatibleTabListTarget = Boolean(
      targetFrame && targetFrame.element.getAttribute("role") === "tablist",
    );
    const hasCompatibleDisabledTarget = hasCompatibleLinkTarget
      || hasCompatibleButtonTarget || hasCompatibleInputTarget || hasCompatibleTabListTarget;
    const isValid = prop.type === "boolean"
      ? prop.property === "disabled"
        ? hasCompatibleDisabledTarget
        : prop.property === "invalid"
          ? hasCompatibleInputTarget
        : prop.property === "checked"
            ? hasCompatibleButtonTarget
            : prop.property === "selected"
              ? hasCompatibleButtonTarget
            : prop.property === "visibility" && Boolean(targetFrame || targetText || targetVector)
      : prop.type === "string"
        ? (prop.property === "textContent" && Boolean(targetText))
          || (prop.property === "href" && hasCompatibleLinkTarget)
          || (prop.property === "placeholder" && hasCompatibleInputTarget)
          || (prop.property === "ariaLabel" && hasCompatibleAriaLabelTarget)
        : prop.property === "onClick" && hasCompatibleButtonTarget;
    if (!isValid) return [];

    const exportName = allocateIdentifier(prop.name, `prop${index + 1}`);
    if (prop.property !== "ariaLabel") return [{ ...prop, exportName }];
    return [{
      ...prop,
      exportName,
      nativeAriaLabelExportName: allocateIdentifier("nativeAriaLabel", `nativeAriaLabel${index + 1}`),
      resolvedAriaLabelExportName: allocateIdentifier("resolvedAriaLabel", `resolvedAriaLabel${index + 1}`),
    }];
  });
}

function getDisabledStateExportProp(allocateIdentifier, existingProps = []) {
  if (existingProps.some((prop) => prop.property === "disabled")) return null;
  const stateComponentProp = componentProps.find((prop) =>
    isStateComponentProp(prop) && getComponentPropOptions(prop).includes("disabled"));
  if (!stateComponentProp) return null;
  const defaultStateIsDisabled = String(stateComponentProp.defaultValue ?? "")
    .trim().toLowerCase() === "disabled";
  return {
    id: `state-disabled-${stateComponentProp.id}`,
    sourceComponentPropId: stateComponentProp.id,
    name: "disabled",
    type: "boolean",
    property: "disabled",
    defaultValue: defaultStateIsDisabled,
    targetFrameId: stateComponentProp.targetFrameId,
    targetTextId: null,
    targetVectorId: null,
    exportName: allocateIdentifier("disabled", "disabled"),
    synthesizedFromState: true,
  };
}

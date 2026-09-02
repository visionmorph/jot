/* Variant resolution, combinations, class names, and state CSS for exports. */

function getVariantExportStyle(exportContext, target) {
  const operations = exportContext?.operationsByTarget.get(target) ?? [];
  return Object.fromEntries(operations.flatMap((operation) => {
    if (["textContent", "disabled", "fill", "stroke"].includes(operation.property)) return [];
    if (operation.property === "visibility") {
      return [["visibility", variantBoolean(operation.value) ? "visible" : "hidden"]];
    }
    const property = toReactStyleProperty(operation.property);
    const value = String(operation.value ?? "").trim();
    // An authored frame with no fill is represented by an empty background
    // override. Export it explicitly so the browser's native button styling
    // cannot supply an opaque background.
    if (property === "backgroundColor" && value === "") {
      return [[property, "transparent"]];
    }
    return [[property, value]];
  }));
}

function createVariantExportContext(instance) {
  if (!instance || !(canvasRootStack instanceof HTMLElement)) return null;
  const root = canvasRootStack.cloneNode(true);
  const operations = resolveVariantOperations(instance);
  operations.forEach((operation) => applyVariantOperation(root, operation));
  const operationsByTarget = new Map();
  operations.forEach((operation) => {
    const targetOperations = operationsByTarget.get(operation.target) ?? [];
    const existingIndex = targetOperations.findIndex((entry) => entry.property === operation.property);
    if (existingIndex >= 0) targetOperations.splice(existingIndex, 1);
    targetOperations.push(operation);
    operationsByTarget.set(operation.target, targetOperations);
  });
  return { instance, root, operationsByTarget };
}

function getVariantExportRecord(type, record, exportContext) {
  if (!exportContext) return record;
  const target = record.isComponent ? "component:0" : `${type}:${record.id}`;
  const element = findVariantTarget(exportContext.root, target);
  if (!(element instanceof HTMLElement)) return record;
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  const parentTarget = parentId === null ? "component:0" : `frame:${parentId}`;
  const parentElement = record.isComponent ? null : findVariantTarget(exportContext.root, parentTarget);
  return {
    ...record,
    element,
    ...(parentElement instanceof HTMLElement
      ? { exportParentDirection: parentElement.style.flexDirection === "column" ? "vertical" : "horizontal" }
      : {}),
  };
}

function getExportVariants() {
  const usedKeys = new Set();
  return variantModel.getInstances().map((instance, index) => {
    const baseKey = instance.name.trim() || `Variant ${index + 1}`;
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${baseKey} ${suffix++}`;
    usedKeys.add(key);
    return { instance, key };
  });
}

function isDirectVisibilityPropAxis(variantProp) {
  return componentProps.some((componentProp) => (
    componentProp.type === "boolean"
    && componentProp.property === "visibility"
    && (
      (componentProp.variantPropId != null
        && variantProp.id != null
        && String(componentProp.variantPropId) === String(variantProp.id))
      || (variantProp.sourceComponentPropId != null
        && componentProp.id != null
        && String(variantProp.sourceComponentPropId) === String(componentProp.id))
      || (String(variantProp.name ?? "").trim() !== ""
        && String(variantProp.name).trim() === String(componentProp.name ?? "").trim())
    )
  ));
}

function getExportVariantAxes(
  allocateIdentifier = createExportIdentifierAllocator(REACT_EXPORT_INTERNAL_NAMES),
) {
  return variantModel.getProps()
    .filter((prop) => prop.type === "enum" || prop.type === "boolean")
    .filter((prop) => !isDirectVisibilityPropAxis(prop))
    .filter((prop) => prop.variantSubtype !== "state")
    .map((prop, index) => {
      return { ...prop, exportName: allocateIdentifier(prop.name, `variantProp${index + 1}`) };
    });
}

function getStateVariantAxes() {
  return variantModel.getProps().filter((prop) => prop.type === "enum" && prop.variantSubtype === "state");
}

function getExportVariantAxisValue(instance, axis) {
  return normalizeVariantPropValue(axis, instance?.propValues?.[axis.id]);
}

function getExportVariantAxisDefaultValue(axis) {
  return getVariantPropDefaultValue(axis);
}

function getExportVariantCombinationKey(instance, axes) {
  return JSON.stringify(axes.map((axis) => getExportVariantAxisValue(instance, axis)));
}

function getExportVariantEntries(axes) {
  return getExportVariants().map((entry) => ({
    ...entry,
    combinationKey: getExportVariantCombinationKey(entry.instance, axes),
  }));
}

function isDefaultStateInstance(instance, stateAxes) {
  return stateAxes.every((axis) => (
    getExportVariantAxisValue(instance, axis) === getExportVariantAxisDefaultValue(axis)
  ));
}

function getBaseExportVariantEntries(axes, stateAxes = getStateVariantAxes()) {
  const grouped = new Map();
  getExportVariantEntries(axes).forEach((entry) => {
    const current = grouped.get(entry.combinationKey);
    if (!current || (!isDefaultStateInstance(current.instance, stateAxes)
      && isDefaultStateInstance(entry.instance, stateAxes))) {
      grouped.set(entry.combinationKey, entry);
    }
  });
  return [...grouped.values()];
}

function getExportScopeClass(cssClassName, index) {
  return `${cssClassName}--variant-${index + 1}`;
}

function getExportTargetClassName(cssClassName, target) {
  if (target === "component:0") return cssClassName;
  const [type, id] = target.split(":");
  return `${cssClassName}__${type}-${id}`;
}

function getExportLayerClassName(cssClassName, target, rootScopeClass = "") {
  return [getExportTargetClassName(cssClassName, target), target === "component:0" ? rootScopeClass : ""]
    .filter(Boolean)
    .join(" ");
}

function getInteractionPseudoClass(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hover") return ":hover";
  if (normalized === "active") return ":active";
  if (["focus", "focus-visible", "focus visible"].includes(normalized)) return ":focus-visible";
  return "";
}

function getContextOperationMap(context) {
  const result = new Map();
  context?.operationsByTarget.forEach((operations, target) => {
    const properties = new Map();
    operations.forEach((operation) => properties.set(operation.property, operation.value));
    result.set(target, properties);
  });
  return result;
}

function createStateStylesheetSource(
  componentName,
  cssClassName = createExportCssClassAllocator()(componentName),
) {
  const stateAxes = getStateVariantAxes();
  if (stateAxes.length === 0) return "";
  const variantAxes = getExportVariantAxes();
  const baseEntries = getBaseExportVariantEntries(variantAxes, stateAxes)
    .map((entry, index) => ({ ...entry, scopeClass: getExportScopeClass(cssClassName, index) }));
  const baseByCombination = new Map(baseEntries.map((entry) => [entry.combinationKey, entry]));
  const rules = [];

  getExportVariantEntries(variantAxes).forEach((stateEntry) => {
    const pseudoClasses = stateAxes
      .map((axis) => getInteractionPseudoClass(getExportVariantAxisValue(stateEntry.instance, axis)))
      .filter(Boolean);
    if (pseudoClasses.length === 0) return;
    const baseEntry = baseByCombination.get(stateEntry.combinationKey);
    if (!baseEntry) return;
    const baseOperations = getContextOperationMap(createVariantExportContext(baseEntry.instance));
    const stateOperations = getContextOperationMap(createVariantExportContext(stateEntry.instance));

    stateOperations.forEach((properties, target) => {
      const declarations = [];
      properties.forEach((value, property) => {
        if (baseOperations.get(target)?.get(property) === value) return;
        const declaration = normalizeStateCssDeclaration(property, value);
        if (declaration) declarations.push(declaration);
      });
      if (declarations.length === 0) return;
      const rootSelector = `.${cssClassName}.${baseEntry.scopeClass}${pseudoClasses.join("")}`;
      const targetClass = getExportTargetClassName(cssClassName, target);
      let selector = target === "component:0" ? rootSelector : `${rootSelector} .${targetClass}`;
      if (declarations.some(({ property }) => property === "fill" || property === "stroke")) {
        selector = `${selector},\n${selector} *`;
      }
      const declarationRows = declarations
        .map(({ property, value }) => `  ${property}: ${value} !important;`)
        .join("\n");
      rules.push(`${selector} {\n${declarationRows}\n}`);
    });
  });

  return `/* Interaction states authored in ${componentName}. */\n${rules.join("\n\n")}\n`;
}

/* Variant resolution, combinations, class names, and state CSS for exports. */

function getVariantExportStyle(exportContext, layerKey) {
  const operations = exportContext?.operationsByTarget.get(layerKey) ?? [];
  return Object.fromEntries(operations.flatMap((operation) => {
    if ([
      "textContent",
      "richTextHtml",
      "disabled",
      "checked",
      "selected",
      "fill",
      "stroke",
      "outlineColor",
      "outlineColorOpacity",
      "outlineWeight",
      "outlinePosition",
    ].includes(operation.property)) return [];
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

function createVariantExportContext(variant) {
  if (!variant || !(canvasRootStack instanceof HTMLElement)) return null;
  const root = canvasRootStack.cloneNode(true);
  const operations = resolveVariantOperations(variant);
  operations.forEach((operation) => applyVariantOperation(root, operation));
  const operationsByTarget = new Map();
  operations.forEach((operation) => {
    const targetOperations = operationsByTarget.get(operation.target) ?? [];
    const existingIndex = targetOperations.findIndex((entry) => entry.property === operation.property);
    if (existingIndex >= 0) targetOperations.splice(existingIndex, 1);
    targetOperations.push(operation);
    operationsByTarget.set(operation.target, targetOperations);
  });
  return { variant, root, operations, operationsByTarget };
}

function getVariantExportRecord(type, record, exportContext) {
  if (!exportContext) return record;
  const layerKey = record.isComponent ? "component:0" : `${type}:${record.id}`;
  const element = findVariantTarget(exportContext.root, layerKey);
  if (!(element instanceof HTMLElement)) return record;
  const parentId = record.parentId;
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

function toVariantNameToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "default";
}

function getSemanticVariantAxisToken(variant, axis) {
  const value = getExportVariantAxisValue(variant, axis);
  const componentProp = getVariantAxisComponentProp(axis);
  const property = componentProp?.property ?? String(axis.name ?? "").trim().toLowerCase();
  if (axis.type !== "boolean") return toVariantNameToken(value);
  if (property === "checked") return value ? "on" : "off";
  if (property === "disabled") return value ? "disabled" : "enabled";
  if (property === "invalid") return value ? "invalid" : "valid";
  if (property === "visibility") return value ? "visible" : "hidden";
  const name = toVariantNameToken(axis.name || "option");
  return value ? name : `not-${name}`;
}

function getVariantAxisNamePriority(axis) {
  const componentProp = getVariantAxisComponentProp(axis);
  const property = componentProp?.property ?? String(axis.name ?? "").trim().toLowerCase();
  if (property === "size") return 10;
  if (property === "kind") return 20;
  if (axis.type === "enum" && !["state", "focus"].includes(axis.variantSubtype)) return 30;
  if (property === "disabled") return 40;
  if (property === "checked") return 50;
  if (["state", "focus"].includes(axis.variantSubtype)) return 60;
  return 45;
}

function getSemanticVariantKey(variant, axes) {
  return [...axes]
    .sort((first, second) => getVariantAxisNamePriority(first) - getVariantAxisNamePriority(second))
    .map((axis) => getSemanticVariantAxisToken(variant, axis))
    .join("-") || "default";
}

function getExportVariants(axes = []) {
  const usedKeys = new Set();
  const keysByCombination = new Map();
  return variantModel.getVariants().map((variant) => {
    const combinationKey = getExportVariantCombinationKey(variant, axes);
    const existingKey = keysByCombination.get(combinationKey);
    if (existingKey) return { variant, key: existingKey };
    const baseKey = getSemanticVariantKey(variant, axes);
    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${baseKey}-${suffix++}`;
    usedKeys.add(key);
    keysByCombination.set(combinationKey, key);
    return { variant, key };
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
  const axes = variantModel.getProps()
    .filter((prop) => prop.type === "enum" || prop.type === "boolean")
    .filter((prop) => !isDirectVisibilityPropAxis(prop))
    .filter((prop) => !["state", "focus"].includes(prop.variantSubtype));
  return getOrderedVariantAxes(axes)
    .map((prop, index) => {
      return { ...prop, exportName: allocateIdentifier(prop.name, `variantProp${index + 1}`) };
    });
}

function getStateVariantAxes() {
  return variantModel.getProps().filter((prop) => (
    prop.type === "enum" && ["state", "focus"].includes(prop.variantSubtype)
  ));
}

function getExportVariantAxisValue(variant, axis) {
  return normalizeVariantPropValue(axis, variant?.propValues?.[axis.id]);
}

function getExportVariantAxisDefaultValue(axis) {
  return getVariantPropDefaultValue(axis);
}

function getExportVariantCombinationKey(variant, axes) {
  return JSON.stringify(axes.map((axis) => getExportVariantAxisValue(variant, axis)));
}

function getExportVariantEntries(axes) {
  return getExportVariants(axes).map((entry) => ({
    ...entry,
    combinationKey: getExportVariantCombinationKey(entry.variant, axes),
  }));
}

function isDefaultStateVariant(variant, stateAxes) {
  return stateAxes.every((axis) => (
    getExportVariantAxisValue(variant, axis) === getExportVariantAxisDefaultValue(axis)
  ));
}

function getBaseExportVariantEntries(axes, stateAxes = getStateVariantAxes()) {
  const grouped = new Map();
  getExportVariantEntries(axes).forEach((entry) => {
    const current = grouped.get(entry.combinationKey);
    if (!current || (!isDefaultStateVariant(current.variant, stateAxes)
      && isDefaultStateVariant(entry.variant, stateAxes))) {
      grouped.set(entry.combinationKey, entry);
    }
  });
  return [...grouped.values()];
}

function getExportScopeClass(cssClassName, variantKey) {
  return `${cssClassName}--${toVariantNameToken(variantKey)}`;
}

function getExportTargetClassName(cssClassName, layerKey) {
  if (layerKey === "component:0") return cssClassName;
  const [type, id] = layerKey.split(":");
  return `${cssClassName}__${type}-${id}`;
}

function getExportLayerClassName(cssClassName, layerKey, rootScopeClass = "") {
  return [getExportTargetClassName(cssClassName, layerKey), layerKey === "component:0" ? rootScopeClass : ""]
    .filter(Boolean)
    .join(" ");
}

function getInteractionPseudoClass(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hover") return ":hover";
  if (normalized === "active") return ":active";
  if (normalized === "focus") return ":focus";
  if (["focus-visible", "focus visible"].includes(normalized)) return ":focus-visible";
  if (normalized === "disabled") return ":disabled";
  return "";
}

function getInteractionTargetForStateAxis(axis) {
  const componentProp = componentProps.find((prop) => (
    prop.id === axis.sourceComponentPropId || prop.variantPropId === axis.id
  ));
  const record = getFrameRecord(componentProp?.targetFrameId);
  if (!record) return "component:0";
  const htmlTag = normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div");
  if (!["button", "input"].includes(htmlTag)) return "component:0";
  return record.isComponent ? "component:0" : `frame:${record.id}`;
}

function getInteractionStateSelector(cssClassName, scopeClass, stateAxes, variant) {
  let selector = `.${cssClassName}.${scopeClass}`;
  stateAxes.forEach((axis) => {
    let pseudoClass = getInteractionPseudoClass(getExportVariantAxisValue(variant, axis));
    if (!pseudoClass) return;
    const interactionTarget = getInteractionTargetForStateAxis(axis);
    const componentProp = componentProps.find((prop) => (
      prop.id === axis.sourceComponentPropId || prop.variantPropId === axis.id
    ));
    const targetRecord = getFrameRecord(componentProp?.targetFrameId);
    if (pseudoClass === ":disabled" && targetRecord?.element.getAttribute("role") === "tablist") {
      pseudoClass = '[aria-disabled="true"]';
    }
    if (interactionTarget === "component:0") {
      selector += pseudoClass;
      return;
    }
    selector += `:has(.${getExportTargetClassName(cssClassName, interactionTarget)}${pseudoClass})`;
  });
  return selector;
}

function getContextOperationMap(context) {
  const result = new Map();
  context?.operationsByTarget.forEach((operations, layerKey) => {
    const properties = new Map();
    operations.forEach((operation) => properties.set(operation.property, operation.value));
    result.set(layerKey, properties);
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
    .map((entry) => ({ ...entry, scopeClass: getExportScopeClass(cssClassName, entry.key) }));
  const baseByCombination = new Map(baseEntries.map((entry) => [entry.combinationKey, entry]));
  const ruleGroups = new Map();

  getExportVariantEntries(variantAxes).forEach((stateEntry) => {
    const hasInteractiveState = stateAxes.some((axis) => (
      Boolean(getInteractionPseudoClass(getExportVariantAxisValue(stateEntry.variant, axis)))
    ));
    const hasFocusRingState = stateAxes.some((axis) => (
      [":focus", ":focus-visible"].includes(
        getInteractionPseudoClass(getExportVariantAxisValue(stateEntry.variant, axis)),
      )
    ));
    if (!hasInteractiveState) return;
    const baseEntry = baseByCombination.get(stateEntry.combinationKey);
    if (!baseEntry) return;
    const baseContext = createVariantExportContext(baseEntry.variant);
    const stateContext = createVariantExportContext(stateEntry.variant);
    const baseOperations = getContextOperationMap(baseContext);
    const stateOperations = getContextOperationMap(stateContext);

    stateOperations.forEach((properties, layerKey) => {
      const declarations = [];
      const outlineProperties = [
        "outlineColor",
        "outlineColorOpacity",
        "outlineWeight",
        "outlinePosition",
      ];
      const hasOutlineDelta = outlineProperties.some((property) => (
        properties.has(property)
        && baseOperations.get(layerKey)?.get(property) !== properties.get(property)
      ));
      properties.forEach((value, property) => {
        if (baseOperations.get(layerKey)?.get(property) === value) return;
        if (outlineProperties.includes(property)) return;
        const declaration = normalizeStateCssDeclaration(property, value);
        if (declaration) declarations.push(declaration);
      });
      if (hasOutlineDelta) {
        const baseTarget = findVariantTarget(baseContext.root, layerKey);
        const stateTarget = findVariantTarget(stateContext.root, layerKey);
        if (baseTarget instanceof HTMLElement && stateTarget instanceof HTMLElement) {
          const baseBoxShadow = getFrameOutlineBoxShadow(baseTarget) || "none";
          const stateBoxShadow = getFrameOutlineBoxShadow(stateTarget) || "none";
          if (baseBoxShadow !== stateBoxShadow) {
            declarations.push({ property: "box-shadow", value: stateBoxShadow });
            if (hasFocusRingState && stateBoxShadow !== "none") {
              declarations.push({ property: "outline", value: "none" });
            }
          }
        }
      }
      if (declarations.length === 0) return;
      const rootSelector = getInteractionStateSelector(
        cssClassName,
        baseEntry.scopeClass,
        stateAxes,
        stateEntry.variant,
      );
      const targetClass = getExportTargetClassName(cssClassName, layerKey);
      const selector = layerKey === "component:0" ? rootSelector : `${rootSelector} .${targetClass}`;
      const selectors = [selector];
      if (declarations.some(({ property }) => property === "fill" || property === "stroke")) {
        selectors.push(`${selector} *`);
      }
      const declarationRows = declarations
        .map(({ property, value }) => `  ${property}: ${value} !important;`)
        .join("\n");
      const group = ruleGroups.get(declarationRows) ?? { declarations: declarationRows, selectors: [] };
      selectors.forEach((candidate) => {
        if (!group.selectors.includes(candidate)) group.selectors.push(candidate);
      });
      ruleGroups.set(declarationRows, group);
    });
  });

  const rules = [...ruleGroups.values()].map(({ declarations, selectors }) => (
    `${selectors.join(",\n")} {\n${declarations}\n}`
  ));
  return `/* Interaction states authored in ${componentName}. */\n${rules.join("\n\n")}\n`;
}

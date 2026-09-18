/* Component property target discovery, compatibility, defaults, and selection controls. */

function getCompatibleDisabledTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) => {
    if (!record) return false;
    const htmlTag = normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div");
    return ["a", "button", "input"].includes(htmlTag)
      || normalizeFrameAriaRole(record.element.getAttribute("role")) === "tablist";
  });
}

function getCompatibleActionTargets() {
  return getCompatibleDisabledTargets().filter((record) =>
    normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div") === "button");
}

function getCompatibleToggleTargets() {
  return getCompatibleActionTargets();
}

function getCompatibleSelectedTargets() {
  return getCompatibleActionTargets();
}

function getCompatiblePlaceholderTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) =>
    record
    && normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div") === "input");
}

function getCompatibleLinkTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) =>
    record
    && normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div") === "a");
}

function getCompatibleAriaLabelTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) => {
    if (!record) return false;
    return ["a", "button", "input"].includes(
      normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div"),
    );
  });
}

function getCompatibleInvalidTargets() {
  return getCompatiblePlaceholderTargets();
}

function getCompatibleInteractionTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) => {
    if (!record) return false;
    return ["a", "button", "input"].includes(
      normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div"),
    ) || normalizeFrameAriaRole(record.element.getAttribute("role")) === "tablist";
  });
}

function getAllTargetableLayers() {
  return [
    ...(currentComponent?.frameRecord ? [{ type: "frame", record: currentComponent.frameRecord }] : []),
    ...frameRecords.map((record) => ({ type: "frame", record })),
    ...textRecords.map((record) => ({ type: "text", record })),
    ...vectorRecords.map((record) => ({ type: "vector", record })),
  ];
}

function getVisibilityTargetLabel(type, record) {
  if (type === "frame" && record.isComponent) return currentComponent?.name || "Component";
  return getTreeNodeName(type, record);
}

function getTargetLayerIconType(type, record) {
  return type === "frame" && record?.isComponent ? "component" : type;
}

function getBooleanPropTargetElement(prop) {
  if (prop.targetFrameId != null) return getFrameRecord(prop.targetFrameId)?.element ?? null;
  if (prop.targetTextId != null) return getTextRecord(prop.targetTextId)?.element ?? null;
  if (prop.targetVectorId != null) return getVectorRecord(prop.targetVectorId)?.element ?? null;
  return null;
}

function inferBooleanComponentPropDefault(prop) {
  const target = getBooleanPropTargetElement(prop);
  if (!(target instanceof HTMLElement)) return prop.property === "visibility";
  if (prop.property === "visibility") return isLayerVisible(target);
  if (prop.property === "disabled") {
    return target.getAttribute("aria-disabled") === "true"
      || Boolean(target.disabled || target.hasAttribute("disabled"));
  }
  if (prop.property === "invalid") return target.dataset.invalid === "true";
  if (prop.property === "checked") return target.getAttribute("aria-checked") === "true";
  if (prop.property === "selected") return target.getAttribute("aria-selected") === "true";
  return false;
}

function clearToggleTargetSemantics(prop) {
  if (prop?.type !== "boolean" || !["checked", "selected"].includes(prop.property)) return;
  const target = getFrameRecord(prop.targetFrameId)?.element;
  if (!(target instanceof HTMLElement)) return;
  target.removeAttribute("role");
  target.removeAttribute(prop.property === "selected" ? "aria-selected" : "aria-checked");
}

function syncToggleTargetSemantics(prop, checked = prop?.defaultValue) {
  if (prop?.type !== "boolean" || !["checked", "selected"].includes(prop.property)) return;
  const target = getFrameRecord(prop.targetFrameId)?.element;
  if (!(target instanceof HTMLElement)) return;
  if (normalizeFrameHtmlTag(target.dataset.htmlTag || "div") !== "button") {
    target.removeAttribute("role");
    target.removeAttribute(prop.property === "selected" ? "aria-selected" : "aria-checked");
    return;
  }
  target.setAttribute("role", prop.property === "selected" ? "tab" : "switch");
  target.setAttribute(prop.property === "selected" ? "aria-selected" : "aria-checked", String(Boolean(checked)));
}

function syncInferredBooleanComponentPropDefault(prop) {
  if (prop?.type !== "boolean") return;
  const nextDefault = inferBooleanComponentPropDefault(prop);
  prop.defaultValue = nextDefault;
  syncToggleTargetSemantics(prop, nextDefault);
  syncComponentPropVariantDefinition(prop, { render: false });
  const variantProp = variantModel.getProps().find((entry) => entry.id === prop.variantPropId);
  if (variantProp) {
    setInferredVariantBooleanDefault(variantProp, nextDefault);
    // A tree visibility change edits the shared layer schema, so every variant
    // must receive the same value instead of leaving stale per-variant values.
    variantModel.getVariants().forEach((variant) => {
      variant.propValues ??= {};
      variant.propValues[variantProp.id] = nextDefault;
    });
  }
  renderVariantSystem();
}

function syncBooleanComponentPropDefaultsForTarget(type, recordId) {
  const targetKey = type === "text" ? "targetTextId" : type === "vector" ? "targetVectorId" : "targetFrameId";
  const matchingProps = componentProps
    .filter((prop) => prop.type === "boolean" && prop.property === "visibility" && prop[targetKey] === recordId);
  if (matchingProps.length === 0) return;
  matchingProps.forEach((prop) => syncInferredBooleanComponentPropDefault(prop));
  renderComponentProps();
}

function setBooleanPropProperty(prop, property) {
  if (property === prop.property) return;
  recordHistory();
  clearToggleTargetSemantics(prop);
  if (property === "custom") {
    prop.name = "boolean";
    prop.property = "custom";
    prop.targetFrameId = null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  } else if (property === "visibility") {
    const target = getAllTargetableLayers()[0];
    prop.name = "visible";
    prop.property = "visibility";
    prop.targetFrameId = target?.type === "frame" ? target.record.id : null;
    prop.targetTextId = target?.type === "text" ? target.record.id : null;
    prop.targetVectorId = target?.type === "vector" ? target.record.id : null;
  } else if (property === "checked") {
    const target = getCompatibleToggleTargets()[0];
    prop.name = "checked";
    prop.property = "checked";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  } else if (property === "selected") {
    const target = getCompatibleSelectedTargets()[0];
    prop.name = "selected";
    prop.property = "selected";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
    target?.element.removeAttribute("aria-selected");
  } else if (property === "disabled") {
    const target = getCompatibleDisabledTargets()[0];
    prop.name = "disabled";
    prop.property = "disabled";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  } else {
    const target = getCompatibleInvalidTargets()[0];
    prop.name = "invalid";
    prop.property = "invalid";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  }
  syncInferredBooleanComponentPropDefault(prop);
  renderComponentProps();
}

function getComponentPropTargetConfig(prop, compatibleTargets) {
  const isStringProp = prop.type === "string";
  const isOptionProp = isOptionComponentProp(prop);
  const isStateProp = isStateComponentProp(prop) || isFocusComponentProp(prop);
  const isCustomBooleanProp = isCustomBooleanComponentProp(prop);
  const isVisibilityProp = prop.type === "boolean" && prop.property === "visibility";
  if (isStateProp) {
    const targets = getCompatibleInteractionTargets();
    const hasCurrentTarget = targets.some((record) => record.id === prop.targetFrameId);
    const targetsEmpty = targets.length === 0;
    return {
      isStringProp,
      isOptionProp,
      isStateProp,
      isVisibilityProp,
      hasCurrentTarget,
      currentValue: hasCurrentTarget ? String(prop.targetFrameId) : "",
      targetsEmpty,
      options: targetsEmpty
        ? [{ value: "", label: "No target", disabled: true }]
        : targets.map((record) => ({
            value: String(record.id),
            label: record.isComponent
              ? currentComponent?.name || "Component"
              : getTreeNodeName("frame", record),
            iconType: getTargetLayerIconType("frame", record),
            iconRecord: record.isComponent ? null : record,
          })),
    };
  }
  if (isOptionProp || isCustomBooleanProp) {
    return {
      isStringProp,
      isOptionProp,
      isStateProp,
      isComponentVariantProp: true,
      isVisibilityProp,
      hasCurrentTarget: true,
      currentValue: "component:0",
      targetsEmpty: false,
      options: [{
        value: "component:0",
        label: currentComponent?.name || "Component",
        iconType: "component",
      }],
    };
  }
  if (isStringProp) {
    const isPlaceholderProp = prop.property === "placeholder";
    const isAriaLabelProp = prop.property === "ariaLabel";
    const isHrefProp = prop.property === "href";
    const targets = isHrefProp
      ? getCompatibleLinkTargets()
      : isAriaLabelProp
      ? getCompatibleAriaLabelTargets()
      : isPlaceholderProp ? getCompatiblePlaceholderTargets() : textRecords;
    const targetId = isPlaceholderProp || isAriaLabelProp || isHrefProp ? prop.targetFrameId : prop.targetTextId;
    const hasCurrentTarget = targets.some((record) => record.id === targetId);
    const targetsEmpty = targets.length === 0;
    return {
      isStringProp,
      isOptionProp,
      isStateProp,
      isVisibilityProp,
      hasCurrentTarget,
      currentValue: hasCurrentTarget ? String(targetId) : "",
      targetsEmpty,
      options: targetsEmpty
        ? [{
            value: "",
            label: "No target",
            disabled: true,
          }]
        : targets.map((record) => ({
              value: String(record.id),
              label: (isPlaceholderProp || isAriaLabelProp || isHrefProp) && record.isComponent
                ? currentComponent?.name || "Component"
                : getTreeNodeName(isPlaceholderProp || isAriaLabelProp || isHrefProp ? "frame" : "text", record),
              iconType: isPlaceholderProp || isAriaLabelProp || isHrefProp ? getTargetLayerIconType("frame", record) : "text",
              iconRecord: (isPlaceholderProp || isAriaLabelProp || isHrefProp) && !record.isComponent ? record : null,
            })),
    };
  }
  if (isVisibilityProp) {
    const allLayers = getAllTargetableLayers();
    const encodedTarget = prop.targetFrameId != null
      ? `frame:${prop.targetFrameId}`
      : prop.targetTextId != null
        ? `text:${prop.targetTextId}`
        : prop.targetVectorId != null
          ? `vector:${prop.targetVectorId}`
          : "";
    const hasCurrentTarget = allLayers.some((layer) => `${layer.type}:${layer.record.id}` === encodedTarget);
    const targetsEmpty = allLayers.length === 0;
    return {
      isStringProp,
      isOptionProp,
      isStateProp,
      isVisibilityProp,
      hasCurrentTarget,
      currentValue: hasCurrentTarget ? encodedTarget : "",
      targetsEmpty,
      options: targetsEmpty
        ? [{ value: "", label: "No target", disabled: true }]
        : allLayers.map((layer) => ({
              value: `${layer.type}:${layer.record.id}`,
              label: getVisibilityTargetLabel(layer.type, layer.record),
              iconType: getTargetLayerIconType(layer.type, layer.record),
              iconRecord: layer.type === "component" ? null : layer.record,
            })),
    };
  }
  const frameTargets = prop.type === "action"
    ? getCompatibleActionTargets()
    : prop.type === "boolean" && prop.property === "checked"
      ? getCompatibleToggleTargets()
    : prop.type === "boolean" && prop.property === "selected"
      ? getCompatibleSelectedTargets()
    : prop.type === "boolean" && prop.property === "invalid"
      ? getCompatibleInvalidTargets()
      : compatibleTargets;
  const hasCurrentTarget = frameTargets.some((record) => record.id === prop.targetFrameId);
  const targetsEmpty = frameTargets.length === 0;
  return {
    isStringProp,
    isOptionProp,
    isStateProp,
    isVisibilityProp,
    hasCurrentTarget,
    currentValue: hasCurrentTarget ? String(prop.targetFrameId) : "",
    targetsEmpty,
      options: targetsEmpty
      ? [{
          value: "",
          label: "No target",
          disabled: true,
        }]
      : frameTargets.map((record) => ({
            value: String(record.id),
            label: record.isComponent
              ? currentComponent?.name || "Component"
              : getTreeNodeName("frame", record),
            iconType: getTargetLayerIconType("frame", record),
            iconRecord: record.isComponent ? null : record,
          })),
  };
}

function setComponentPropTarget(prop, value, config) {
  if (!value || value === config.currentValue
    || config.isComponentVariantProp) return;
  recordHistory();
  clearToggleTargetSemantics(prop);
  if (config.isStateProp) {
    prop.targetFrameId = Number(value);
    prop.targetTextId = null;
    prop.targetVectorId = null;
  } else if (config.isStringProp) {
    const targetId = Number(value);
    const isPlaceholderProp = prop.property === "placeholder";
    const isAriaLabelProp = prop.property === "ariaLabel";
    const isHrefProp = prop.property === "href";
    const targetsFrame = isPlaceholderProp || isAriaLabelProp || isHrefProp;
    const target = targetsFrame ? getFrameRecord(targetId) : getTextRecord(targetId);
    prop.targetTextId = targetsFrame ? null : targetId;
    prop.targetFrameId = targetsFrame ? targetId : null;
    prop.targetVectorId = null;
    prop.defaultValue = isHrefProp
      ? target?.element.dataset.href ?? ""
      : isAriaLabelProp
      ? target?.element.getAttribute("aria-label") ?? ""
      : isPlaceholderProp
      ? target?.element.dataset.placeholder ?? ""
      : target?.element.textContent ?? "";
  } else if (config.isVisibilityProp) {
    const [type, rawId] = value.split(":");
    const targetId = Number(rawId);
    prop.targetFrameId = type === "frame" ? targetId : null;
    prop.targetTextId = type === "text" ? targetId : null;
    prop.targetVectorId = type === "vector" ? targetId : null;
  } else {
    const targetId = Number(value);
    prop.targetFrameId = targetId;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  }
  if (prop.type === "boolean") syncInferredBooleanComponentPropDefault(prop);
  renderComponentProps();
}

function setStringPropProperty(prop, property) {
  if (property === prop.property) return;
  recordHistory();
  if (property === "href") {
    const target = getCompatibleLinkTargets()[0];
    prop.name = "href";
    prop.property = "href";
    prop.defaultValue = target?.element.dataset.href ?? "";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
  } else if (property === "ariaLabel") {
    const target = getCompatibleAriaLabelTargets()[0];
    prop.name = "ariaLabel";
    prop.property = "ariaLabel";
    prop.defaultValue = target?.element.getAttribute("aria-label") ?? "";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
  } else if (property === "placeholder") {
    const target = getCompatiblePlaceholderTargets()[0];
    prop.name = "placeholder";
    prop.property = "placeholder";
    prop.defaultValue = target?.element.dataset.placeholder ?? "";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
  } else {
    const target = textRecords[0];
    prop.name = "label";
    prop.property = "textContent";
    prop.defaultValue = target?.element.textContent ?? "";
    prop.targetFrameId = null;
    prop.targetTextId = target?.id ?? null;
  }
  prop.targetVectorId = null;
  renderComponentProps();
}

function createComponentPropTargetCell(prop, compatibleTargets) {
  const cell = createComponentPropCell();
  const config = getComponentPropTargetConfig(prop, compatibleTargets);
  cell.append(createPropSelect(
    config.options,
    config.currentValue,
    "Target layer",
    (value) => setComponentPropTarget(prop, value, config),
    config.targetsEmpty,
    "Select target",
  ));
  return { cell, hasCurrentTarget: config.hasCurrentTarget };
}

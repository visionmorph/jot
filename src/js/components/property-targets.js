/* Component property target discovery, compatibility, defaults, and selection controls. */

function getCompatibleDisabledTargets() {
  const componentFrame = currentComponent?.frameRecord;
  return [componentFrame, ...frameRecords].filter((record) =>
    record
    && record.parentId === null
    && normalizeFrameHtmlTag(record.element.dataset.htmlTag || "div") === "button");
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
  if (prop.property === "disabled") return Boolean(target.disabled || target.hasAttribute("disabled"));
  return false;
}

function syncInferredBooleanComponentPropDefault(prop, defaultInstance = getDefaultVariantInstance()) {
  if (prop?.type !== "boolean") return;
  const nextDefault = inferBooleanComponentPropDefault(prop);
  prop.defaultValue = nextDefault;
  syncComponentPropVariantDefinition(prop, { render: false });
  const variantProp = variantModel.getProps().find((entry) => entry.id === prop.variantPropId);
  if (variantProp) {
    setInferredVariantBooleanDefault(variantProp, nextDefault);
    if (defaultInstance) {
      defaultInstance.propValues ??= {};
      defaultInstance.propValues[variantProp.id] = nextDefault;
    }
  }
  renderVariantSystem();
}

function syncBooleanComponentPropDefaultsForTarget(type, recordId) {
  const targetKey = type === "text" ? "targetTextId" : type === "vector" ? "targetVectorId" : "targetFrameId";
  const defaultInstance = getDefaultVariantInstance();
  const matchingProps = componentProps
    .filter((prop) => prop.type === "boolean" && prop.property === "visibility" && prop[targetKey] === recordId);
  if (matchingProps.length === 0) return;
  matchingProps.forEach((prop) => syncInferredBooleanComponentPropDefault(prop, defaultInstance));
  renderComponentProps();
}

function setBooleanPropProperty(prop, property) {
  if (property === prop.property) return;
  recordHistory();
  const defaultInstance = getDefaultVariantInstance();
  if (property === "visibility") {
    const target = getAllTargetableLayers()[0];
    prop.name = "visible";
    prop.property = "visibility";
    prop.targetFrameId = target?.type === "frame" ? target.record.id : null;
    prop.targetTextId = target?.type === "text" ? target.record.id : null;
    prop.targetVectorId = target?.type === "vector" ? target.record.id : null;
  } else {
    const target = getCompatibleDisabledTargets()[0];
    prop.name = "disabled";
    prop.property = "disabled";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
  }
  syncInferredBooleanComponentPropDefault(prop, defaultInstance);
  renderComponentProps();
}

function getComponentPropTargetConfig(prop, compatibleTargets) {
  const isStringProp = prop.type === "string";
  const isOptionProp = isOptionComponentProp(prop);
  const isVisibilityProp = prop.type === "boolean" && prop.property === "visibility";
  if (isOptionProp) {
    return {
      isStringProp,
      isOptionProp,
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
    const hasCurrentTarget = textRecords.some((record) => record.id === prop.targetTextId);
    const targetsEmpty = textRecords.length === 0;
    return {
      isStringProp,
      isOptionProp,
      isVisibilityProp,
      hasCurrentTarget,
      currentValue: hasCurrentTarget ? String(prop.targetTextId) : "",
      targetsEmpty,
      options: targetsEmpty
        ? [{ value: "", label: "No text target", disabled: true }]
        : [
            { value: "", label: "Select layer", disabled: true },
            ...textRecords.map((record) => ({
              value: String(record.id),
              label: getTreeNodeName("text", record),
              iconType: "text",
            })),
          ],
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
      isVisibilityProp,
      hasCurrentTarget,
      currentValue: hasCurrentTarget ? encodedTarget : "",
      targetsEmpty,
      options: targetsEmpty
        ? [{ value: "", label: "No layer target", disabled: true }]
        : [
            { value: "", label: "Select layer", disabled: true },
            ...allLayers.map((layer) => ({
              value: `${layer.type}:${layer.record.id}`,
              label: getVisibilityTargetLabel(layer.type, layer.record),
              iconType: getTargetLayerIconType(layer.type, layer.record),
              iconRecord: layer.type === "component" ? null : layer.record,
            })),
          ],
    };
  }
  const hasCurrentTarget = compatibleTargets.some((record) => record.id === prop.targetFrameId);
  const targetsEmpty = compatibleTargets.length === 0;
  return {
    isStringProp,
    isOptionProp,
    isVisibilityProp,
    hasCurrentTarget,
    currentValue: hasCurrentTarget ? String(prop.targetFrameId) : "",
    targetsEmpty,
    options: targetsEmpty
      ? [{ value: "", label: "No button target", disabled: true }]
      : [
          ...(prop.type === "action" ? [] : [{ value: "", label: "Select layer", disabled: true }]),
          ...compatibleTargets.map((record) => ({
            value: String(record.id),
            label: record.isComponent
              ? currentComponent?.name || "Component"
              : getTreeNodeName("frame", record),
            iconType: getTargetLayerIconType("frame", record),
            iconRecord: record.isComponent ? null : record,
          })),
        ],
  };
}

function setComponentPropTarget(prop, value, config) {
  if (!value || value === config.currentValue || config.isOptionProp) return;
  recordHistory();
  const defaultInstance = getDefaultVariantInstance();
  if (config.isStringProp) {
    const targetId = Number(value);
    const target = getTextRecord(targetId);
    prop.targetTextId = targetId;
    prop.targetFrameId = null;
    prop.targetVectorId = null;
    prop.defaultValue = target?.element.textContent ?? "";
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
  if (prop.type === "boolean") syncInferredBooleanComponentPropDefault(prop, defaultInstance);
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
  ));
  return { cell, hasCurrentTarget: config.hasCurrentTarget };
}

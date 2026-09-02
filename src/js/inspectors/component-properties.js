/* Component property definitions, controls, rendering, and add-property interactions. */

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

function createPropSelectIcon(iconType, record = null) {
  if (iconType === "prop-boolean") return createSvgAssetIcon("toggle-on", "layer-type-icon prop-type-icon");
  if (iconType === "prop-string") return createSvgAssetIcon("text", "layer-type-icon prop-type-icon");
  if (iconType === "prop-action") return createSvgAssetIcon("cursor-1", "layer-type-icon prop-type-icon");
  if (iconType === "prop-enum") return createSvgAssetIcon("diamond-outline", "layer-type-icon prop-type-icon");
  if (iconType === "frame" && record) return createLayerTypeIcon("frame", record);
  if (iconType === "vector" && record) return createVectorLayerTreeIcon(record);
  return createLayerTypeIcon(iconType, record);
}

function bindPropsActionTooltip(wrapper, button) {
  const tooltipContent = wrapper.querySelector(".tooltip__content");
  if (!(tooltipContent instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  const positionTooltip = () => {
    const bounds = button.getBoundingClientRect();
    tooltipContent.style.left = `${bounds.left + bounds.width / 2}px`;
    tooltipContent.style.top = `${bounds.top - 4}px`;
  };
  wrapper.addEventListener("pointerenter", positionTooltip);
  wrapper.addEventListener("focusin", positionTooltip);
}

function createPropSelect(options, value, ariaLabel, onChange, disabled = false) {
  const wrap = document.createElement("div");
  const trigger = document.createElement("button");
  const chevron = document.createElement("span");
  const menu = document.createElement("div");
  const selectedOptionRecord = options.find((optionRecord) => String(optionRecord.value) === String(value));
  let outsidePointerListener = null;

  wrap.className = "prop-select-wrap";
  wrap.classList.toggle("is-disabled", disabled);
  trigger.className = "prop-control prop-select";
  trigger.type = "button";
  trigger.setAttribute("aria-label", ariaLabel);
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  trigger.disabled = disabled;
  menu.className = "dropdown__menu prop-select-menu";
  menu.setAttribute("role", "listbox");
  menu.hidden = true;

  const setOpen = (isOpen) => {
    if (disabled) return;
    if (isOpen) {
      document.querySelectorAll(".prop-select-wrap.is-open").forEach((otherWrap) => {
        if (otherWrap === wrap) return;
        otherWrap.classList.remove("is-open");
        const otherMenu = otherWrap.querySelector(".prop-select-menu");
        const otherTrigger = otherWrap.querySelector(".prop-select");
        if (otherMenu instanceof HTMLElement) otherMenu.hidden = true;
        if (otherTrigger instanceof HTMLButtonElement) otherTrigger.setAttribute("aria-expanded", "false");
      });
      wrap.classList.add("is-open");
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      if (!outsidePointerListener) {
        outsidePointerListener = (event) => {
          if (event.target instanceof Node && wrap.contains(event.target)) return;
          setOpen(false);
        };
        window.setTimeout(() => document.addEventListener("pointerdown", outsidePointerListener), 0);
      }
      return;
    }
    wrap.classList.remove("is-open");
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (outsidePointerListener) {
      document.removeEventListener("pointerdown", outsidePointerListener);
      outsidePointerListener = null;
    }
  };

  options.forEach((optionRecord) => {
    const option = document.createElement("button");
    option.className = "dropdown__option prop-select-option";
    option.type = "button";
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", String(String(optionRecord.value) === String(value)));
    option.dataset.propSelectValue = String(optionRecord.value);
    option.disabled = Boolean(optionRecord.disabled);
    if (optionRecord.iconType) option.append(createPropSelectIcon(optionRecord.iconType, optionRecord.iconRecord));
    option.append(document.createTextNode(optionRecord.label));
    option.addEventListener("click", () => {
      if (option.disabled) return;
      setOpen(false);
      onChange(optionRecord.value);
    });
    menu.append(option);
  });
  chevron.className = "chevron inspector-select-chevron";
  chevron.setAttribute("aria-hidden", "true");
  trigger.textContent = selectedOptionRecord?.label ?? String(value);
  trigger.addEventListener("click", () => setOpen(menu.hidden));
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setOpen(true);
    const selectedOption = menu.querySelector('[aria-selected="true"]');
    (selectedOption instanceof HTMLButtonElement ? selectedOption : menu.querySelector("button:not(:disabled)"))?.focus();
  });
  wrap.addEventListener("focusout", () => window.setTimeout(() => {
    if (!wrap.contains(document.activeElement)) setOpen(false);
  }, 0));
  wrap.append(trigger);
  if (selectedOptionRecord?.iconType) {
    const selectedValue = document.createElement("span");
    const selectedLabel = document.createElement("span");
    selectedValue.className = "prop-select-selected-value";
    selectedLabel.className = "prop-select-selected-label";
    selectedLabel.textContent = selectedOptionRecord.label;
    selectedValue.append(createPropSelectIcon(selectedOptionRecord.iconType, selectedOptionRecord.iconRecord), selectedLabel);
    trigger.classList.add("prop-select--has-layer-icon");
    wrap.append(selectedValue);
  }
  wrap.append(chevron, menu);
  return wrap;
}

const DEFAULT_ENUM_OPTION = "Default";
const INTERACTION_STATE_OPTIONS = ["enabled", "hover", "active", "focus-visible"];

const OPTION_COMPONENT_PROP_CONFIG = {
  enum: { label: "Enum", options: [DEFAULT_ENUM_OPTION] },
};

const ENUM_COMPONENT_PROPERTY_OPTIONS = [
  { value: "size", label: "Size" },
  { value: "kind", label: "Kind" },
  { value: "state", label: "State" },
];

function getEnumComponentProperty(prop) {
  if (isStateComponentProp(prop)) return "state";
  const property = String(prop?.property ?? "").toLowerCase();
  if (property === "type" || property === "variant") return "kind";
  if (ENUM_COMPONENT_PROPERTY_OPTIONS.some((option) => option.value === property)) return property;
  const name = String(prop?.name ?? "").trim().toLowerCase();
  if (name === "type" || name === "variant") return "kind";
  return ENUM_COMPONENT_PROPERTY_OPTIONS.some((option) => option.value === name) ? name : "kind";
}

function isOptionComponentProp(propOrType) {
  const type = typeof propOrType === "string" ? propOrType : propOrType?.type;
  return Object.prototype.hasOwnProperty.call(OPTION_COMPONENT_PROP_CONFIG, type);
}

function isStateComponentProp(prop) {
  return prop?.type === "enum" && prop.variantSubtype === "state";
}

function getComponentPropOptions(prop) {
  if (isStateComponentProp(prop)) return [...INTERACTION_STATE_OPTIONS];
  const fallbackOptions = OPTION_COMPONENT_PROP_CONFIG[prop.type]?.options ?? [DEFAULT_ENUM_OPTION];
  return Array.isArray(prop.options) && prop.options.length > 0 ? prop.options : fallbackOptions;
}

function getAvailableEnumPropName(currentProp = null) {
  const usedNames = new Set(componentProps
    .filter((prop) => prop !== currentProp && isOptionComponentProp(prop))
    .map((prop) => prop.name.toLowerCase()));
  let index = 1;
  let name = "Kind";
  while (usedNames.has(name.toLowerCase())) name = `Kind ${index += 1}`;
  return name;
}

function configureOptionComponentProp(prop, type) {
  const config = OPTION_COMPONENT_PROP_CONFIG[type];
  if (!config) return;
  prop.name = getAvailableEnumPropName(prop);
  prop.type = type;
  delete prop.variantSubtype;
  prop.options = [...config.options];
  prop.defaultValue = prop.options[0];
  prop.targetFrameId = null;
  prop.targetTextId = null;
  prop.targetVectorId = null;
  prop.property = "kind";
}

function createComponentPropCell(isAction = false) {
  const cell = document.createElement("div");
  cell.className = `props-table-cell${isAction ? " props-table-action-cell" : ""}`;
  cell.setAttribute("role", "cell");
  return cell;
}

function createComponentPropNameCell(prop) {
  const cell = createComponentPropCell();
  const input = document.createElement("input");
  input.className = "prop-control";
  input.type = "text";
  input.value = prop.name;
  input.setAttribute("aria-label", "Prop name");
  const commitName = () => {
    const fallbackName = isStateComponentProp(prop)
      ? "Interaction"
      : isOptionComponentProp(prop)
        ? "Variant"
        : prop.type === "string"
          ? "label"
          : prop.type === "action"
            ? "onClick"
            : prop.property === "visibility" ? "visible" : "disabled";
    const name = input.value.trim() || fallbackName;
    if (name === prop.name) return;
    recordHistory();
    prop.name = name;
    if (isVariantBoundComponentProp(prop)) syncComponentPropVariantDefinition(prop);
    input.value = name;
  };
  input.addEventListener("change", commitName);
  input.addEventListener("blur", commitName);
  cell.append(input);
  return cell;
}

function setComponentPropType(prop, value, compatibleTargets) {
  if (value === prop.type) return;
  recordHistory();
  const wasVariantBoundProp = isVariantBoundComponentProp(prop);
  if (wasVariantBoundProp && value !== "enum" && value !== "boolean") unlinkComponentPropVariantDefinition(prop);
  if (isOptionComponentProp(value)) {
    configureOptionComponentProp(prop, value);
  } else if (value === "string") {
    const target = textRecords[0];
    prop.name = "label";
    prop.type = "string";
    prop.defaultValue = target?.element.textContent ?? "";
    prop.targetFrameId = null;
    prop.targetTextId = target?.id ?? null;
    prop.targetVectorId = null;
    prop.property = "textContent";
  } else if (value === "action") {
    const target = compatibleTargets[0];
    prop.name = "onClick";
    prop.type = "action";
    prop.defaultValue = "";
    prop.targetFrameId = target?.id ?? null;
    prop.targetTextId = null;
    prop.targetVectorId = null;
    prop.property = "onClick";
  } else {
    const target = getAllTargetableLayers()[0];
    prop.name = "visible";
    prop.type = "boolean";
    prop.targetFrameId = target?.type === "frame" ? target.record.id : null;
    prop.targetTextId = target?.type === "text" ? target.record.id : null;
    prop.targetVectorId = target?.type === "vector" ? target.record.id : null;
    prop.property = "visibility";
  }
  if (!isOptionComponentProp(value)) {
    delete prop.options;
    delete prop.variantSubtype;
  }
  if (value === "boolean") syncInferredBooleanComponentPropDefault(prop);
  else if (value === "enum") syncComponentPropVariantDefinition(prop);
  renderComponentProps();
}

function createComponentPropTypeCell(prop, compatibleTargets) {
  const cell = createComponentPropCell();
  cell.append(createPropSelect(
    [
      { value: "enum", label: "Variant", iconType: "prop-enum" },
      { value: "boolean", label: "Boolean", iconType: "prop-boolean" },
      { value: "string", label: "String", iconType: "prop-string" },
      { value: "action", label: "Action", iconType: "prop-action" },
    ],
    prop.type,
    "Prop type",
    (value) => setComponentPropType(prop, value, compatibleTargets),
  ));
  return cell;
}

function createComponentPropActionCell(prop) {
  const cell = createComponentPropCell(true);
  const tooltip = document.createElement("span");
  const button = document.createElement("button");
  const icon = document.createElement("span");
  const tooltipContent = document.createElement("span");
  tooltip.className = "tooltip tooltip--top tooltip--align-center tooltip--fixed";
  button.className = "icon-button icon-button--size-24 icon-button--rounded";
  button.type = "button";
  button.setAttribute("aria-label", `Remove ${prop.name} prop`);
  icon.className = "subtract-icon";
  icon.setAttribute("aria-hidden", "true");
  tooltipContent.className = "tooltip__content";
  tooltipContent.setAttribute("role", "tooltip");
  tooltipContent.textContent = "Remove";
  button.append(icon);
  button.addEventListener("click", () => {
    recordHistory();
    if (isVariantBoundComponentProp(prop)) unlinkComponentPropVariantDefinition(prop);
    componentProps = componentProps.filter((componentProp) => componentProp.id !== prop.id);
    renderComponentProps();
  });
  tooltip.append(button, tooltipContent);
  bindPropsActionTooltip(tooltip, button);
  cell.append(tooltip);
  return cell;
}

function setEnumComponentPropProperty(prop, value, currentProperty) {
  if (value === currentProperty) return;
  recordHistory();
  const wasStateProp = isStateComponentProp(prop);
  if (value === "state") {
    prop.variantSubtype = "state";
    prop.name = "Interaction";
    prop.property = "state";
    prop.options = [...INTERACTION_STATE_OPTIONS];
    prop.defaultValue = prop.options[0];
  } else {
    delete prop.variantSubtype;
    prop.property = value;
    if (wasStateProp) {
      prop.name = `${value[0].toUpperCase()}${value.slice(1)}`;
      prop.options = [DEFAULT_ENUM_OPTION];
      prop.defaultValue = prop.options[0];
    }
  }
  syncComponentPropVariantDefinition(prop);
  renderComponentProps();
}

function createComponentPropPropertyCell(prop, compatibleTargets, hasCurrentTarget) {
  const cell = createComponentPropCell();
  if (isOptionComponentProp(prop)) {
    const enumProperty = getEnumComponentProperty(prop);
    cell.append(createPropSelect(
      ENUM_COMPONENT_PROPERTY_OPTIONS,
      enumProperty,
      "Variant property",
      (value) => setEnumComponentPropProperty(prop, value, enumProperty),
    ));
  } else if (prop.type === "boolean") {
    cell.append(createPropSelect(
      [
        { value: "visibility", label: "Visibility" },
        { value: "disabled", label: "Disabled", disabled: compatibleTargets.length === 0 },
      ],
      prop.property,
      "Target property",
      (value) => setBooleanPropProperty(prop, value),
    ));
  } else {
    cell.append(createPropSelect(
      [{
        value: prop.property,
        label: prop.property === "textContent" ? "Text content" : prop.property,
      }],
      prop.property,
      "Target property",
      () => {},
      !hasCurrentTarget,
    ));
  }
  return cell;
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

function focusComponentPropValueControl(propId, selector = "") {
  requestAnimationFrame(() => {
    propRowsContainer
      ?.querySelector(`[data-prop-value-cell="${propId}"]${selector}`)
      ?.focus();
  });
}

function setActiveComponentPropOption(context, value) {
  const { defaultCell, instance, prop } = context;
  if (!instance) return;
  if (prop.variantPropId == null) syncComponentPropVariantDefinition(prop);
  if (prop.variantPropId == null || instance.propValues[prop.variantPropId] === value) return;
  recordHistory();
  instance.propValues[prop.variantPropId] = value;
  defaultCell.querySelectorAll("[data-tag-value]").forEach((tagValue) => {
    tagValue.closest(".tag")?.classList.toggle("is-active", tagValue.value === value);
  });
  renderVariantInstances();
}

function renameComponentPropOption(prop, optionValue, nextValue) {
  if (!nextValue || nextValue === optionValue) return false;
  if (getComponentPropOptions(prop).some((value) => value !== optionValue && value === nextValue)) return false;
  recordHistory();
  prop.options = getComponentPropOptions(prop).map((value) => value === optionValue ? nextValue : value);
  if (prop.defaultValue === optionValue) prop.defaultValue = nextValue;
  if (prop.variantPropId != null) {
    variantModel.getInstances().forEach((variantInstance) => {
      if (variantInstance.propValues[prop.variantPropId] === optionValue) {
        variantInstance.propValues[prop.variantPropId] = nextValue;
      }
    });
    variantModel.getRules().forEach((rule) => {
      if (rule.conditions[prop.variantPropId] === optionValue) rule.conditions[prop.variantPropId] = nextValue;
    });
  }
  syncComponentPropVariantDefinition(prop);
  renderComponentProps();
  return true;
}

function removeComponentPropOption(prop, options, optionValue) {
  if (options.length <= 1) return;
  recordHistory();
  prop.options = options.filter((value) => value !== optionValue);
  syncComponentPropVariantDefinition(prop);
  renderVariantInstances();
  renderComponentProps();
}

function createComponentPropOptionDismissControl(context, optionValue) {
  const { isStateProp, options, prop } = context;
  const tooltip = document.createElement("span");
  const button = document.createElement("button");
  const tooltipContent = document.createElement("span");
  tooltip.className = "tooltip tooltip--top tooltip--align-center tooltip--fixed";
  tooltip.dataset.propValueDismissTooltip = "";
  tooltip.hidden = isStateProp;
  button.className = "icon-button icon-button--size-24 icon-button--circle";
  button.dataset.iconButton = "prop-value-dismiss";
  button.type = "button";
  button.disabled = isStateProp || options.length <= 1;
  button.setAttribute("aria-label", `Dismiss ${optionValue}`);
  button.append(createSvgAssetIcon("close"));
  tooltipContent.className = "tooltip__content";
  tooltipContent.setAttribute("role", "tooltip");
  tooltipContent.textContent = "Dismiss";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    removeComponentPropOption(prop, options, optionValue);
  });
  tooltip.append(button, tooltipContent);
  bindPropsActionTooltip(tooltip, button);
  return tooltip;
}

function finishComponentPropOptionEdit(context, input, optionValue) {
  const wasEditing = input.classList.contains("is-editing");
  input.readOnly = true;
  input.tabIndex = -1;
  input.classList.remove("is-editing");
  if (!wasEditing) return;
  if (!renameComponentPropOption(context.prop, optionValue, input.value.trim())) input.value = optionValue;
  if (context.retainValueCellFocusAfterEdit) {
    context.retainValueCellFocusAfterEdit = false;
    focusComponentPropValueControl(context.prop.id);
  }
}

function createComponentPropOptionTag(context, optionValue, optionIndex) {
  const { currentValue, isStateProp, prop } = context;
  const tag = document.createElement("div");
  const input = document.createElement("input");
  tag.className = isStateProp ? "tag" : "tag tag--dismissable";
  tag.tabIndex = 0;
  tag.classList.toggle("is-active", optionValue === currentValue);
  tag.classList.toggle("is-default", optionIndex === 0);
  input.type = "text";
  input.className = "tag__text";
  input.dataset.tagValue = "";
  input.value = optionValue;
  input.readOnly = true;
  input.tabIndex = -1;
  input.setAttribute("aria-label", `${prop.name} value ${optionValue}`);
  if (optionIndex === 0) input.title = "Default value";
  tag.addEventListener("focus", () => setActiveComponentPropOption(context, optionValue));
  tag.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest('[data-icon-button="prop-value-dismiss"]')) return;
    setActiveComponentPropOption(context, optionValue);
    if (!input.classList.contains("is-editing")) tag.focus();
  });
  input.addEventListener("pointerdown", (event) => {
    if (input.classList.contains("is-editing")) return;
    event.preventDefault();
    setActiveComponentPropOption(context, optionValue);
    tag.focus();
  });
  tag.addEventListener("dblclick", (event) => {
    if (isStateProp) return;
    if (event.target instanceof Element && event.target.closest('[data-icon-button="prop-value-dismiss"]')) return;
    event.preventDefault();
    input.readOnly = false;
    input.tabIndex = 0;
    input.classList.add("is-editing");
    input.focus();
    input.select();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      context.retainValueCellFocusAfterEdit = true;
      input.blur();
    }
    if (event.key === "Escape") {
      input.value = optionValue;
      input.blur();
    }
  });
  input.addEventListener("blur", () => finishComponentPropOptionEdit(context, input, optionValue));
  tag.append(input, createComponentPropOptionDismissControl(context, optionValue));
  return tag;
}

function addComponentPropOption(context, input, retainFocus = false) {
  const nextValue = input.value.trim();
  if (!nextValue) return false;
  const existing = getComponentPropOptions(context.prop);
  if (existing.includes(nextValue)) {
    input.select();
    return false;
  }
  recordHistory();
  context.prop.options = [...existing, nextValue];
  if (context.instance && context.prop.variantPropId != null) {
    context.instance.propValues[context.prop.variantPropId] = nextValue;
  }
  syncComponentPropVariantDefinition(context.prop);
  renderComponentProps();
  if (retainFocus) focusComponentPropValueControl(context.prop.id, " .tag__add-input");
  return true;
}

function createComponentPropAddOptionInput(context) {
  const input = document.createElement("input");
  const propName = context.prop.name.trim().toLowerCase();
  const placeholderName = propName === "size" || propName === "type" ? propName : "variant";
  input.className = "tag__add-input";
  input.type = "text";
  input.placeholder = `Add ${placeholderName}`;
  input.setAttribute("aria-label", `Add ${context.prop.name} value`);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addComponentPropOption(context, input, true);
    } else if (event.key === "Escape") {
      input.value = "";
      input.blur();
    }
  });
  input.addEventListener("blur", () => addComponentPropOption(context, input));
  context.defaultCell.addEventListener("pointerdown", (event) => {
    if (event.target instanceof Element && event.target.closest(".tag, .tag__add-input")) return;
    event.preventDefault();
    input.focus();
    input.setSelectionRange(0, 0);
  });
  return input;
}

function populateOptionComponentPropDefaultCell(defaultCell, prop) {
  const options = getComponentPropOptions(prop);
  const instance = getVariantInstance();
  const context = {
    currentValue: instance && prop.variantPropId != null ? instance.propValues[prop.variantPropId] : options[0],
    defaultCell,
    instance,
    isStateProp: isStateComponentProp(prop),
    options,
    prop,
    retainValueCellFocusAfterEdit: false,
  };
  options.forEach((optionValue, optionIndex) => {
    defaultCell.append(createComponentPropOptionTag(context, optionValue, optionIndex));
  });
  const addValueInput = createComponentPropAddOptionInput(context);
  if (!context.isStateProp) defaultCell.append(addValueInput);
}

function createComponentPropValueCell(prop) {
  const cell = createComponentPropCell();
  cell.classList.add("props-table-value-cell");
  cell.dataset.propValueCell = String(prop.id);
  cell.tabIndex = -1;
  return cell;
}

function createVariantBooleanDefaultControl(prop) {
  const instance = getVariantInstance() ?? getDefaultVariantInstance();
  const currentValue = instance
    ? normalizeVariantPropValue(
      variantModel.getProps().find((variantProp) => variantProp.id === prop.variantPropId),
      instance.propValues[prop.variantPropId],
    )
    : Boolean(prop.defaultValue);
  const toggle = document.createElement("button");
  const track = document.createElement("span");
  const handle = document.createElement("span");
  const checkmark = document.createElement("span");
  const label = document.createElement("span");
  toggle.className = "toggle";
  toggle.type = "button";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", String(currentValue));
  toggle.setAttribute("aria-label", `${prop.name} value`);
  track.className = "toggle__track";
  track.setAttribute("aria-hidden", "true");
  handle.className = "toggle__handle";
  checkmark.className = "toggle__checkmark";
  label.className = "toggle__label";
  label.textContent = currentValue ? "True" : "False";
  handle.append(checkmark);
  track.append(handle);
  toggle.append(track, label);
  toggle.addEventListener("click", () => {
    if (toggle.dataset.transitioning === "true") return;
    const nextValue = !currentValue;
    const transitionDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120;
    toggle.dataset.transitioning = "true";
    toggle.setAttribute("aria-checked", String(nextValue));
    label.textContent = nextValue ? "True" : "False";
    recordHistory();
    if (instance) {
      const variantProp = variantModel.getProps().find((entry) => entry.id === prop.variantPropId);
      setVariantBooleanValue(instance, variantProp, nextValue);
      renderVariantInstances();
    } else {
      prop.defaultValue = nextValue;
      syncComponentPropVariantDefinition(prop, { render: false });
    }
    if (transitionDuration === 0) {
      renderComponentProps();
      return;
    }
    let didFinishTransition = false;
    const finishTransition = () => {
      if (didFinishTransition) return;
      didFinishTransition = true;
      renderComponentProps();
    };
    handle.addEventListener("transitionend", finishTransition, { once: true });
    window.setTimeout(finishTransition, transitionDuration + 60);
  });
  return toggle;
}

function createStringDefaultControl(prop) {
  const input = document.createElement("input");
  input.className = "prop-control";
  input.type = "text";
  input.value = String(prop.defaultValue ?? "");
  input.setAttribute("aria-label", `Default ${prop.name} value`);
  const commitValue = (renderPanel = false) => {
    const didChange = input.value !== String(prop.defaultValue ?? "");
    if (didChange) recordHistoryForGesture(input);
    const target = getTextRecord(prop.targetTextId);
    if (target) {
      syncTextRecordContent(target, input.value);
      applyLayerSizing("text", target);
      requestAnimationFrame(syncResizeOverlay);
      renderTree();
    }
    if (didChange) {
      if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
      redoHistory.length = 0;
    }
    if (renderPanel) renderComponentProps();
  };
  input.addEventListener("input", () => commitValue());
  input.addEventListener("blur", () => commitValue(true));
  bindHistoryGesture(input);
  return input;
}

function createActionDefaultControl() {
  const value = document.createElement("span");
  value.className = "prop-empty-value prop-empty-value--action";
  value.textContent = "—";
  return value;
}

function createStaticDefaultControl(prop) {
  const value = document.createElement("span");
  value.className = "tag";
  if (prop.type === "boolean") {
    value.textContent = Boolean(prop.defaultValue) ? "True" : "False";
    value.setAttribute("aria-label", `Default Boolean value: ${value.textContent}`);
  } else if (prop.type === "string") {
    const stringValue = String(prop.defaultValue);
    value.textContent = stringValue || '\"\"';
    value.setAttribute("aria-label", `Default string value: ${stringValue || "empty string"}`);
  } else {
    value.classList.add("prop-empty-value");
    value.textContent = "—";
    value.setAttribute("aria-label", "No default value");
  }
  return value;
}

function createComponentPropDefaultCell(prop) {
  const cell = createComponentPropValueCell(prop);
  if (isOptionComponentProp(prop)) {
    populateOptionComponentPropDefaultCell(cell, prop);
  } else if (prop.type === "boolean" && prop.variantPropId != null) {
    cell.append(createVariantBooleanDefaultControl(prop));
  } else if (prop.type === "string" && prop.property === "textContent") {
    cell.classList.add("props-table-value-cell--control");
    cell.append(createStringDefaultControl(prop));
  } else if (prop.type === "action" && prop.property === "onClick") {
    cell.setAttribute("aria-label", "Value supplied by component consumer");
    cell.append(createActionDefaultControl());
  } else {
    cell.append(createStaticDefaultControl(prop));
  }
  return cell;
}

function renderComponentPropRow(prop, compatibleTargets) {
    const row = document.createElement("div");
    row.className = "props-table-row props-property-row";
    row.setAttribute("role", "row");
    const nameCell = createComponentPropNameCell(prop);
    const typeCell = createComponentPropTypeCell(prop, compatibleTargets);
    const defaultCell = createComponentPropDefaultCell(prop);

    const target = createComponentPropTargetCell(prop, compatibleTargets);
    const targetCell = target.cell;
    const propertyCell = createComponentPropPropertyCell(prop, compatibleTargets, target.hasCurrentTarget);

    const actionCell = createComponentPropActionCell(prop);

    row.append(nameCell, typeCell, targetCell, propertyCell, defaultCell, actionCell);
    return row;
}

function renderComponentProps() {
  if (!(propRowsContainer instanceof HTMLElement)) return;
  const compatibleTargets = getCompatibleDisabledTargets();
  const rows = componentProps.map((prop) => renderComponentPropRow(prop, compatibleTargets));
  propRowsContainer.replaceChildren(...rows);
}

function addComponentProp(type = "enum") {
  recordHistory();
  const prop = {
    id: nextComponentPropId,
    name: "visible",
    type,
    defaultValue: true,
    targetFrameId: null,
    targetTextId: null,
    targetVectorId: null,
    property: "visibility",
  };

  if (type === "enum") {
    const options = [DEFAULT_ENUM_OPTION];
    Object.assign(prop, {
      name: getAvailableEnumPropName(),
      options,
      defaultValue: options[0],
      property: "kind",
    });
  } else if (type === "string") {
    const target = textRecords[0];
    Object.assign(prop, {
      name: "label",
      defaultValue: target?.element.textContent ?? "",
      targetTextId: target?.id ?? null,
      property: "textContent",
    });
  } else if (type === "action") {
    const target = getCompatibleDisabledTargets()[0];
    Object.assign(prop, {
      name: "onClick",
      defaultValue: "",
      targetFrameId: target?.id ?? null,
      property: "onClick",
    });
  } else {
    const target = getAllTargetableLayers()[0];
    prop.type = "boolean";
    prop.targetFrameId = target?.type === "frame" ? target.record.id : null;
    prop.targetTextId = target?.type === "text" ? target.record.id : null;
    prop.targetVectorId = target?.type === "vector" ? target.record.id : null;
    prop.defaultValue = inferBooleanComponentPropDefault(prop);
  }

  componentProps.push(prop);
  if (type === "enum" || type === "boolean") syncComponentPropVariantDefinition(prop);
  nextComponentPropId += 1;
  renderComponentProps();
}

function setAddPropMenuOpen(isOpen, focusPosition = "selected") {
  if (!(addPropOverflowMenu instanceof HTMLElement)
    || !(addPropMenu instanceof HTMLElement)
    || !(addPropButton instanceof HTMLButtonElement)) return;
  addPropOverflowMenu.classList.toggle("is-open", isOpen);
  addPropMenu.hidden = !isOpen;
  addPropButton.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen) return;
  const index = focusPosition === "last"
    ? addPropTypeOptions.length - 1
    : 0;
  requestAnimationFrame(() => addPropTypeOptions[index]?.focus());
}

function selectAddPropType(option) {
  if (!(option instanceof HTMLButtonElement)) return;
  const type = option.dataset.propType;
  if (!type) return;
  addPropTypeOptions.forEach((candidate) => candidate.setAttribute("aria-selected", "false"));
  addComponentProp(type);
  setAddPropMenuOpen(false);
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}

addPropButton?.addEventListener("click", () => {
  if (!(addPropMenu instanceof HTMLElement)) return;
  setAddPropMenuOpen(addPropMenu.hidden);
});

addPropButton?.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  setAddPropMenuOpen(true, event.key === "ArrowUp" ? "last" : "selected");
});

addPropMenu?.addEventListener("click", (event) => {
  const option = event.target instanceof Element ? event.target.closest("[data-prop-type]") : null;
  selectAddPropType(option);
});

addPropMenu?.addEventListener("keydown", (event) => {
  const currentIndex = addPropTypeOptions.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % addPropTypeOptions.length;
  else if (event.key === "ArrowUp") nextIndex = (currentIndex - 1 + addPropTypeOptions.length) % addPropTypeOptions.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = addPropTypeOptions.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    setAddPropMenuOpen(false);
    addPropButton?.focus();
    return;
  } else return;
  event.preventDefault();
  addPropTypeOptions[nextIndex]?.focus();
});

addPropOverflowMenu?.addEventListener("focusout", (event) => {
  if (event.relatedTarget instanceof Node && addPropOverflowMenu.contains(event.relatedTarget)) return;
  setAddPropMenuOpen(false);
});

document.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Node) || addPropOverflowMenu?.contains(event.target)) return;
  setAddPropMenuOpen(false);
});

const addPropTooltip = addPropButton?.closest(".tooltip");
if (addPropTooltip instanceof HTMLElement && addPropButton instanceof HTMLButtonElement) {
  bindPropsActionTooltip(addPropTooltip, addPropButton);
}

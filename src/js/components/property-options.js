/* Component variant-property option definitions, editing, and tag controls. */

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

/* Component property row rendering, type changes, and add-property coordination. */

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

/* Component variant properties, delta resolution, canvas previews, and instance overrides. */

const VARIANT_PROPERTY_OPTIONS = {
  component: ["backgroundColor", "color", "borderColor", "borderWidth", "borderRadius", "padding", "gap", "width", "height", "flexDirection", "alignItems", "justifyContent", "flexWrap", "opacity", "visibility", "disabled"],
  frame: ["backgroundColor", "color", "borderColor", "borderWidth", "borderRadius", "padding", "gap", "width", "height", "flexDirection", "alignItems", "justifyContent", "flexWrap", "flex", "alignSelf", "opacity", "visibility", "disabled"],
  text: ["textContent", "color", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "textAlign", "alignContent", "display", "width", "height", "opacity", "visibility"],
  vector: ["fill", "stroke", "width", "height", "opacity", "visibility"],
};

const VARIANT_PROPERTY_DEFAULTS = {
  backgroundColor: "#4589ff",
  color: "#ffffff",
  borderColor: "#ffffff",
  borderWidth: "1px",
  borderRadius: "4px",
  padding: "8px 16px",
  gap: "8px",
  opacity: "1",
  visibility: "true",
  disabled: "true",
  textContent: "Button",
  fontSize: "14px",
  fontWeight: "600",
  lineHeight: "20px",
  letterSpacing: "0",
  fill: "#ffffff",
  stroke: "#ffffff",
  width: "24px",
  height: "24px",
  flexDirection: "row",
  alignItems: "flex-start",
  justifyContent: "flex-start",
  flexWrap: "nowrap",
  flex: "0 0 auto",
  alignSelf: "auto",
};

let variantRenderFrame = null;

let selectedVariantLayerTarget = null;

function getVariantPropValues(prop) {
  if (prop.type === "boolean") return [false, true];
  if (prop.type === "enum") return prop.options?.length ? prop.options : ["default"];
  return [];
}

function normalizeVariantPropValue(prop, value) {
  if (prop.type === "boolean") return value === true || value === "true";
  if (prop.type === "string") return String(value ?? "");
  if (prop.type === "action") return null;
  const values = getVariantPropValues(prop);
  return values.includes(value) ? value : prop.defaultValue ?? values[0] ?? "default";
}

function unlinkComponentPropVariantDefinition(componentProp) {
  if (componentProp.variantPropId == null) return;
  const variantPropId = componentProp.variantPropId;
  variantProps = variantProps.filter((prop) => prop.id !== variantPropId);
  variantInstances.forEach((instance) => { delete instance.propValues[variantPropId]; });
  variantRules.forEach((rule) => { delete rule.conditions[variantPropId]; });
  variantRules = variantRules.filter((rule) => Object.keys(rule.conditions).length > 0);
  delete componentProp.variantPropId;
  renderVariantSystem();
}

function isVariantBoundComponentProp(componentProp) {
  return componentProp?.type === "enum" || componentProp?.type === "boolean";
}

function syncComponentPropVariantDefinition(componentProp) {
  if (!isVariantBoundComponentProp(componentProp)) {
    unlinkComponentPropVariantDefinition(componentProp);
    return;
  }
  const isBoolean = componentProp.type === "boolean";
  const options = [...getComponentPropOptions(componentProp)];
  let variantProp = variantProps.find((prop) => prop.id === componentProp.variantPropId);
  if (!variantProp) {
    variantProp = {
      id: nextVariantPropId++,
      name: componentProp.name,
      type: isBoolean ? "boolean" : "enum",
      ...(isBoolean ? {} : { options }),
      defaultValue: isBoolean ? Boolean(componentProp.defaultValue) : componentProp.defaultValue,
      sourceComponentPropId: componentProp.id,
    };
    componentProp.variantPropId = variantProp.id;
    variantProps.push(variantProp);
  } else {
    variantProp.name = componentProp.name;
    variantProp.type = isBoolean ? "boolean" : "enum";
    if (isBoolean) {
      delete variantProp.options;
      variantProp.defaultValue = Boolean(componentProp.defaultValue);
    } else {
      variantProp.options = options;
      variantProp.defaultValue = options.includes(componentProp.defaultValue) ? componentProp.defaultValue : options[0];
    }
  }
  componentProp.defaultValue = variantProp.defaultValue;
  variantInstances.forEach((instance) => {
    if (!isBoolean && !options.includes(instance.propValues[variantProp.id])) {
      instance.propValues[variantProp.id] = variantProp.defaultValue;
    }
  });
  variantRules.forEach((rule) => {
    if (!isBoolean && Object.prototype.hasOwnProperty.call(rule.conditions, variantProp.id)
      && !options.includes(rule.conditions[variantProp.id])) delete rule.conditions[variantProp.id];
  });
  variantRules = variantRules.filter((rule) => Object.keys(rule.conditions).length > 0);
  renderVariantSystem();
}

function getVariantInstance(instanceId = selectedVariantInstanceId) {
  return variantInstances.find((instance) => instance.id === instanceId) ?? null;
}

function getSelectedVariantStyleOverride(property, fallback = "") {
  const instance = getVariantInstance();
  const override = instance?.overrides?.find((entry) => entry.target === "component:0" && entry.property === property);
  return override ? String(override.value ?? "") : fallback;
}

function setSelectedVariantStyleOverride(property, value, { render = true } = {}) {
  const instance = getVariantInstance();
  if (!instance) return false;
  const nextValue = String(value ?? "");
  const overrides = instance.overrides ?? (instance.overrides = []);
  const override = overrides.find((entry) => entry.target === "component:0" && entry.property === property);
  if (override?.value === nextValue) return true;
  recordHistory();
  if (override) override.value = nextValue;
  else overrides.push({ target: "component:0", property, value: nextValue });
  if (render) renderVariantInstances();
  return true;
}

function setVariantTextOverride(instance, textId, value, { render = true } = {}) {
  const overrides = instance.overrides ?? (instance.overrides = []);
  const target = `text:${textId}`;
  const override = overrides.find((entry) => entry.target === target && entry.property === "textContent");
  if (override?.value === value) return;
  if (override) override.value = value;
  else overrides.push({ target, property: "textContent", value });
  if (render) renderVariantInstances();
}

function setSelectedVariantLayerOverride(property, value, { render = false } = {}) {
  const instance = getVariantInstance();
  if (!instance || !selectedVariantLayerTarget) return false;
  const overrides = instance.overrides ?? (instance.overrides = []);
  const override = overrides.find((entry) => entry.target === selectedVariantLayerTarget && entry.property === property);
  const nextValue = String(value ?? "");
  if (override?.value === nextValue) return true;
  if (override) override.value = nextValue;
  else overrides.push({ target: selectedVariantLayerTarget, property, value: nextValue });
  if (render) renderVariantInstances();
  return true;
}

function getVariantTargetOptions() {
  return [
    ...(currentComponent ? [{ value: "component:0", label: currentComponent.name || "Component", type: "component" }] : []),
    ...frameRecords.map((record) => ({ value: `frame:${record.id}`, label: getTreeNodeName("frame", record), type: "frame" })),
    ...textRecords.map((record) => ({ value: `text:${record.id}`, label: getTreeNodeName("text", record), type: "text" })),
    ...vectorRecords.map((record) => ({ value: `vector:${record.id}`, label: getTreeNodeName("vector", record), type: "vector" })),
  ];
}

function getVariantTargetType(target) {
  return String(target || "component:0").split(":")[0];
}

function getVariantPropertiesForTarget(target) {
  return VARIANT_PROPERTY_OPTIONS[getVariantTargetType(target)] ?? VARIANT_PROPERTY_OPTIONS.component;
}

function getDefaultVariantValue(property) {
  return VARIANT_PROPERTY_DEFAULTS[property] ?? "";
}

function findVariantTarget(root, target) {
  if (!(root instanceof HTMLElement)) return null;
  const [type, rawId] = String(target || "component:0").split(":");
  if (type === "component") return root;
  const selector = type === "frame"
    ? `[data-frame-id="${CSS.escape(rawId)}"]`
    : type === "text"
      ? `[data-text-id="${CSS.escape(rawId)}"]`
      : `[data-vector-id="${CSS.escape(rawId)}"]`;
  return root.querySelector(selector);
}

function variantBoolean(value) {
  if (typeof value === "boolean") return value;
  return !["false", "0", "off", "hidden", "none", ""].includes(String(value).trim().toLowerCase());
}

function applyVariantOperation(root, operation) {
  const target = findVariantTarget(root, operation.target);
  if (!(target instanceof HTMLElement)) return;
  const property = operation.property;
  const value = operation.value;

  if (property === "textContent") {
    target.textContent = String(value ?? "");
    return;
  }
  if (property === "visibility") {
    target.style.visibility = variantBoolean(value) ? "visible" : "hidden";
    return;
  }
  if (property === "disabled") {
    const isDisabled = variantBoolean(value);
    if ("disabled" in target) target.disabled = isDisabled;
    target.toggleAttribute("disabled", isDisabled);
    target.setAttribute("aria-disabled", String(isDisabled));
    return;
  }
  if ((property === "fill" || property === "stroke") && target.classList.contains("canvas-vector")) {
    const paintTargets = target.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, text, tspan, use");
    paintTargets.forEach((element) => element.style.setProperty(property, String(value)));
    return;
  }
  target.style[property] = String(value ?? "");
}

function variantRuleMatches(rule, instance) {
  const entries = Object.entries(rule.conditions ?? {});
  if (entries.length === 0) return false;
  return entries.every(([propId, expected]) => {
    const prop = variantProps.find((entry) => String(entry.id) === String(propId));
    if (!prop) return false;
    return normalizeVariantPropValue(prop, instance.propValues?.[prop.id]) === normalizeVariantPropValue(prop, expected);
  });
}

function getComponentPropVariantTarget(componentProp) {
  if (componentProp.targetFrameId != null) {
    return componentProp.targetFrameId === currentComponent?.frameRecord?.id
      ? "component:0"
      : `frame:${componentProp.targetFrameId}`;
  }
  if (componentProp.targetTextId != null) return `text:${componentProp.targetTextId}`;
  if (componentProp.targetVectorId != null) return `vector:${componentProp.targetVectorId}`;
  return "component:0";
}

function getBooleanVisibilityOperations(instance) {
  return componentProps
    .filter((prop) => prop.type === "boolean" && prop.property === "visibility" && prop.variantPropId != null)
    .map((prop) => {
      const variantProp = variantProps.find((entry) => entry.id === prop.variantPropId);
      return variantProp
        ? {
            target: getComponentPropVariantTarget(prop),
            property: "visibility",
            value: normalizeVariantPropValue(variantProp, instance.propValues?.[variantProp.id]),
          }
        : null;
    })
    .filter(Boolean);
}

function resolveVariantOperations(instance) {
  const matchingRules = variantRules
    .map((rule, row) => ({ rule, row, specificity: Object.keys(rule.conditions ?? {}).length }))
    .filter(({ rule }) => variantRuleMatches(rule, instance));
  const individuals = matchingRules.filter(({ specificity }) => specificity === 1);
  const compounds = matchingRules
    .filter(({ specificity }) => specificity > 1)
    .sort((first, second) => first.specificity - second.specificity || first.row - second.row);
  return [
    ...individuals.map(({ rule }) => rule),
    ...compounds.map(({ rule }) => rule),
    ...getBooleanVisibilityOperations(instance),
    ...(instance.overrides ?? []),
  ];
}

function getVariantInstanceLabel(instance) {
  const values = variantProps
    .filter((prop) => prop.type !== "action")
    .map((prop) => `${prop.name}=${String(normalizeVariantPropValue(prop, instance.propValues?.[prop.id]))}`);
  return values.length ? `${instance.name} · ${values.join(", ")}` : instance.name;
}

function getVariantPropSchemaTitle(instance) {
  const values = variantProps
    .filter((prop) => prop.type !== "action")
    .map((prop) => `${prop.name}=${String(normalizeVariantPropValue(prop, instance.propValues?.[prop.id]))}`);
  return values.join(", ") || instance.name;
}

function getBaseVariantLabel() {
  const values = variantProps
    .filter((prop) => prop.type !== "action")
    .map((prop) => `${prop.name}=${String(normalizeVariantPropValue(prop, prop.defaultValue))}`);
  return values.join(", ") || currentComponent?.name || "Component";
}

function setVariantLabelTooltip(label, fullLabel) {
  const isTruncated = label.scrollHeight > label.clientHeight || label.scrollWidth > label.clientWidth;
  label.title = isTruncated ? fullLabel : "";
}

function syncVariantFlexbox(root) {
  if (!(root instanceof HTMLElement)) return;
  [root, ...root.querySelectorAll(".canvas-frame")].forEach((container) => {
    if (!(container instanceof HTMLElement)) return;
    container.style.display = "flex";
    if (!container.style.flexDirection && container.dataset.direction) {
      container.style.flexDirection = container.dataset.direction === "vertical" ? "column" : "row";
    }
    Array.from(container.children).forEach((child) => {
      if (!(child instanceof HTMLElement) || !child.matches(".canvas-frame, .canvas-text, .canvas-vector")) return;
      child.style.position = "relative";
      child.style.left = "";
      child.style.top = "";
    });
  });
}

function namespaceVariantCloneIds(clone, instanceId) {
  const idMap = new Map();
  clone.querySelectorAll("[id]").forEach((element) => {
    const previousId = element.id;
    const nextId = `variant-${instanceId}-${previousId}`;
    idMap.set(previousId, nextId);
    element.id = nextId;
  });
  if (idMap.size === 0) return;
  clone.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      let nextValue = attribute.value;
      idMap.forEach((replacement, previousId) => {
        nextValue = nextValue
          .replaceAll(`url(#${previousId})`, `url(#${replacement})`)
          .replaceAll(`#${previousId}`, `#${replacement}`);
      });
      if (nextValue !== attribute.value) element.setAttribute(attribute.name, nextValue);
    });
  });
}

function prepareVariantClone(clone, instanceId) {
  clone.removeAttribute("data-canvas-root-stack");
  clone.querySelectorAll(".component-preview-label").forEach((label) => label.remove());
  clone.classList.remove("is-selected", "is-canvas-drop-inside", "is-canvas-dragging");
  clone.setAttribute("aria-selected", "false");
  clone.querySelectorAll(".is-selected, .is-canvas-drop-inside, .is-canvas-dragging").forEach((element) => {
    element.classList.remove("is-selected", "is-canvas-drop-inside", "is-canvas-dragging");
    element.setAttribute("aria-selected", "false");
  });
  clone.querySelectorAll("[contenteditable]").forEach((element) => element.setAttribute("contenteditable", "false"));
  clone.querySelectorAll("[draggable]").forEach((element) => element.setAttribute("draggable", "false"));
  namespaceVariantCloneIds(clone, instanceId);
}

function renderBaseComponentLabel() {
  if (!(canvasRootStack instanceof HTMLElement)) return;
  const label = canvasRootStack.querySelector("[data-component-preview-label]");
  if (!(label instanceof HTMLElement)) return;
  const nextLabel = getBaseVariantLabel();
  if (label.textContent !== nextLabel) label.textContent = nextLabel;
  setVariantLabelTooltip(label, label.textContent);
  label.onpointerdown = (event) => {
    if (event.button !== 0 || activeTool !== "select" || !currentComponent) return;
    event.stopPropagation();
    selectComponentTreeNode(currentComponent.id);
  };
}

function renderVariantInstances() {
  if (!(componentSet instanceof HTMLElement) || !(canvasRootStack instanceof HTMLElement)) return;
  renderBaseComponentLabel();
  componentSet.querySelectorAll(":scope > .variant-preview").forEach((preview) => preview.remove());

  variantInstances.forEach((instance) => {
    const preview = document.createElement("div");
    const label = document.createElement("span");
    const content = document.createElement("div");
    const clone = canvasRootStack.cloneNode(true);
    preview.className = "variant-preview";
    preview.classList.toggle("is-selected", instance.id === selectedVariantInstanceId);
    preview.dataset.variantInstanceId = String(instance.id);
    preview.setAttribute("role", "group");
    preview.setAttribute("tabindex", "0");
    preview.setAttribute("aria-label", getVariantInstanceLabel(instance));
    label.className = "variant-preview-label";
    label.textContent = getVariantPropSchemaTitle(instance);
    content.className = "variant-preview-content";
    prepareVariantClone(clone, instance.id);
    resolveVariantOperations(instance).forEach((operation) => applyVariantOperation(clone, operation));
    syncVariantFlexbox(clone);
    clone.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((layerElement) => {
      const type = layerElement.classList.contains("canvas-frame")
        ? "frame"
        : layerElement.classList.contains("canvas-text") ? "text" : "vector";
      const id = Number(layerElement.dataset[`${type}Id`]);
      if (!Number.isFinite(id)) return;
      const target = `${type}:${id}`;
      const isSelectedLayer = instance.id === selectedVariantInstanceId && target === selectedVariantLayerTarget;
      layerElement.classList.toggle("is-selected", isSelectedLayer);
      layerElement.setAttribute("aria-selected", String(isSelectedLayer));
      layerElement.tabIndex = 0;
      layerElement.addEventListener("pointerdown", (event) => {
        if (event.button !== 0 || activeTool !== "select") return;
        event.stopPropagation();
        selectVariantInstance(instance.id, { render: false });
        selectedVariantLayerTarget = target;
        preview.querySelectorAll(".canvas-frame.is-selected, .canvas-text.is-selected, .canvas-vector.is-selected").forEach((element) => {
          element.classList.remove("is-selected");
          element.setAttribute("aria-selected", "false");
        });
        layerElement.classList.add("is-selected");
        layerElement.setAttribute("aria-selected", "true");
        updateInspector();
      });
      if (type !== "text") return;
      const text = layerElement;
      const textId = id;
      const beginEditing = (event) => {
        if (activeTool !== "select") return;
        event.preventDefault();
        event.stopPropagation();
        selectedVariantLayerTarget = target;
        text.classList.add("is-selected");
        text.setAttribute("aria-selected", "true");
        text.contentEditable = "true";
        text.focus();
        const range = document.createRange();
        range.selectNodeContents(text);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      };
      text.addEventListener("dblclick", beginEditing);
      text.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !text.isContentEditable) beginEditing(event);
      });
      text.addEventListener("input", () => {
        recordHistory();
        setVariantTextOverride(instance, textId, text.textContent ?? "", { render: false });
      });
      text.addEventListener("blur", () => {
        text.contentEditable = "false";
        renderVariantInstances();
      });
    });
    content.append(clone);
    preview.append(label, content);
    const selectPreview = (event) => {
      if (event.button !== 0 || activeTool !== "select") return;
      event.stopPropagation();
      selectVariantInstance(instance.id, { render: false });
      renderComponentProps();
    };
    label.addEventListener("pointerdown", selectPreview);
    preview.addEventListener("pointerdown", selectPreview);
    preview.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      selectVariantInstance(instance.id);
    });
    componentSet.append(preview);
    setVariantLabelTooltip(label, label.textContent);
  });
}

function scheduleVariantInstanceRender() {
  if (variantRenderFrame !== null) return;
  variantRenderFrame = requestAnimationFrame(() => {
    variantRenderFrame = null;
    renderVariantInstances();
  });
}

function clearMasterSelectionForVariant() {
  selectedLayerKeys.clear();
  selectedComponentId = null;
  selectedCanvasFrame = null;
  selectedCanvasText = null;
  selectedCanvasVector = null;
  clearElementSelection();
}

function selectVariantInstance(instanceId, options = {}) {
  if (!getVariantInstance(instanceId)) return false;
  clearMasterSelectionForVariant();
  if (selectedVariantInstanceId !== instanceId || options.preserveLayerSelection !== true) {
    selectedVariantLayerTarget = null;
  }
  selectedVariantInstanceId = instanceId;
  if (options.render !== false) renderTree();
  else {
    document.querySelectorAll(".variant-preview").forEach((preview) => {
      preview.classList.toggle("is-selected", Number(preview.dataset.variantInstanceId) === instanceId);
    });
    renderVariantLayersTree();
    updateInspector();
  }
  return true;
}

function addVariantInstance() {
  if (!currentComponent) return null;
  recordHistory();
  const index = variantInstances.length;
  const sourceInstance = getVariantInstance();
  const instance = {
    id: nextVariantInstanceId++,
    name: `Preview ${index + 1}`,
    componentId: currentComponent.id,
    propValues: sourceInstance
      ? structuredClone(sourceInstance.propValues ?? {})
      : Object.fromEntries(variantProps
        .filter((prop) => prop.type !== "boolean")
        .map((prop) => [prop.id, prop.defaultValue])),
    overrides: sourceInstance ? structuredClone(sourceInstance.overrides ?? []) : [],
  };
  variantInstances.push(instance);
  selectedVariantInstanceId = instance.id;
  selectedVariantLayerTarget = null;
  clearMasterSelectionForVariant();
  renderTree();
  return instance;
}

function removeVariantInstance(instanceId) {
  const index = variantInstances.findIndex((instance) => instance.id === instanceId);
  if (index < 0) return false;
  recordHistory();
  variantInstances.splice(index, 1);
  selectedVariantInstanceId = variantInstances[Math.min(index, variantInstances.length - 1)]?.id ?? null;
  renderTree();
  return true;
}

function createVariantControl(tagName, value, ariaLabel) {
  const control = document.createElement(tagName);
  control.value = value ?? "";
  control.setAttribute("aria-label", ariaLabel);
  return control;
}

function renderVariantPropAuthoring() {
  if (!(variantPropRowsContainer instanceof HTMLElement)) return;
  const authorableProps = variantProps.filter((prop) => prop.sourceComponentPropId == null);
  if (authorableProps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "variant-empty-state";
    empty.textContent = variantProps.length > 0
      ? "Option properties created in the Props table are managed there."
      : "Add an enum, boolean, string, or action property. Enum options drive reusable visual states.";
    variantPropRowsContainer.replaceChildren(empty);
    return;
  }

  const rows = authorableProps.map((prop) => {
    const row = document.createElement("div");
    const nameInput = createVariantControl("input", prop.name, "Variant property name");
    const typeSelect = createVariantControl("select", prop.type, "Variant property type");
    const optionsInput = createVariantControl("input", prop.type === "enum" ? prop.options.join(", ") : prop.type === "boolean" ? "false, true" : "—", "Variant options");
    const defaultControl = prop.type === "enum" || prop.type === "boolean"
      ? createVariantControl("select", String(prop.defaultValue), "Default variant value")
      : createVariantControl("input", prop.type === "action" ? "" : prop.defaultValue, "Default variant value");
    const removeButton = document.createElement("button");
    row.className = "variant-grid variant-props-grid variant-grid-row";
    [
      ["enum", "Enum"],
      ["boolean", "Boolean"],
      ["string", "String"],
      ["action", "Action"],
    ].forEach(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      typeSelect.append(option);
    });
    getVariantPropValues(prop).forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = String(value);
      defaultControl.append(option);
    });
    typeSelect.value = prop.type;
    defaultControl.value = String(prop.defaultValue ?? "");
    optionsInput.disabled = prop.type !== "enum";
    defaultControl.disabled = prop.type === "action";
    removeButton.className = "variant-row-remove";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `Remove ${prop.name}`);
    removeButton.textContent = "−";

    nameInput.addEventListener("change", () => {
      const name = nameInput.value.trim() || `property${prop.id}`;
      if (name === prop.name) return;
      recordHistory();
      prop.name = name;
      renderVariantSystem();
    });
    typeSelect.addEventListener("change", () => {
      recordHistory();
      prop.type = typeSelect.value;
      if (prop.type === "enum") {
        prop.options = prop.options?.length ? prop.options : ["default", "alternate"];
        prop.defaultValue = prop.options[0];
      } else if (prop.type === "boolean") prop.defaultValue = false;
      else if (prop.type === "string") prop.defaultValue = "";
      else prop.defaultValue = null;
      variantInstances.forEach((instance) => { instance.propValues[prop.id] = prop.defaultValue; });
      variantRules.forEach((rule) => { delete rule.conditions[prop.id]; });
      renderVariantSystem();
    });
    optionsInput.addEventListener("change", () => {
      const options = [...new Set(optionsInput.value.split(",").map((value) => value.trim()).filter(Boolean))];
      if (options.length === 0 || options.join("|") === prop.options.join("|")) return;
      recordHistory();
      prop.options = options;
      if (!options.includes(prop.defaultValue)) prop.defaultValue = options[0];
      variantInstances.forEach((instance) => {
        if (!options.includes(instance.propValues[prop.id])) instance.propValues[prop.id] = prop.defaultValue;
      });
      variantRules.forEach((rule) => {
        if (Object.prototype.hasOwnProperty.call(rule.conditions, prop.id) && !options.includes(rule.conditions[prop.id])) {
          delete rule.conditions[prop.id];
        }
      });
      renderVariantSystem();
    });
    defaultControl.addEventListener("change", () => {
      const value = normalizeVariantPropValue(prop, defaultControl.value);
      if (value === prop.defaultValue) return;
      recordHistory();
      prop.defaultValue = value;
      renderVariantSystem();
    });
    removeButton.addEventListener("click", () => {
      recordHistory();
      variantProps = variantProps.filter((entry) => entry.id !== prop.id);
      variantInstances.forEach((instance) => { delete instance.propValues[prop.id]; });
      variantRules.forEach((rule) => { delete rule.conditions[prop.id]; });
      variantRules = variantRules.filter((rule) => Object.keys(rule.conditions).length > 0);
      renderVariantSystem();
    });
    row.append(nameInput, typeSelect, optionsInput, defaultControl, removeButton);
    return row;
  });
  variantPropRowsContainer.replaceChildren(...rows);
}

function renderRuleConditions(rule) {
  const cell = document.createElement("div");
  cell.className = "variant-condition-cell";
  const conditionProps = variantProps.filter((prop) => prop.type === "enum" || prop.type === "boolean");
  conditionProps.forEach((prop) => {
    const select = createVariantControl("select", Object.prototype.hasOwnProperty.call(rule.conditions, prop.id)
      ? String(rule.conditions[prop.id])
      : "", `${prop.name} condition`);
    const anyOption = document.createElement("option");
    anyOption.value = "";
    anyOption.textContent = `${prop.name}: Any`;
    select.append(anyOption);
    getVariantPropValues(prop).forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = `${prop.name}: ${String(value)}`;
      select.append(option);
    });
    select.value = Object.prototype.hasOwnProperty.call(rule.conditions, prop.id)
      ? String(rule.conditions[prop.id])
      : "";
    select.addEventListener("change", () => {
      recordHistory();
      if (select.value === "") delete rule.conditions[prop.id];
      else rule.conditions[prop.id] = normalizeVariantPropValue(prop, select.value);
      renderVariantSystem();
    });
    cell.append(select);
  });
  if (conditionProps.length === 0) {
    const empty = document.createElement("span");
    empty.className = "variant-empty-state";
    empty.textContent = "Add enum/boolean property";
    cell.append(empty);
  }
  return cell;
}

function renderVariantRuleAuthoring() {
  if (!(variantRuleRowsContainer instanceof HTMLElement)) return;
  if (variantRules.length === 0) {
    const empty = document.createElement("div");
    empty.className = "variant-empty-state";
    empty.textContent = "Add style rules for individual options or select two or more conditions for a compound override.";
    variantRuleRowsContainer.replaceChildren(empty);
    return;
  }

  const targets = getVariantTargetOptions();
  const rows = variantRules.map((rule) => {
    const row = document.createElement("div");
    const targetSelect = createVariantControl("select", rule.target, "Rule target layer");
    const propertySelect = createVariantControl("select", rule.property, "Rule target property");
    const valueInput = createVariantControl("input", rule.value, "Rule value");
    const removeButton = document.createElement("button");
    row.className = "variant-grid variant-rules-grid variant-grid-row";
    targets.forEach((target) => {
      const option = document.createElement("option");
      option.value = target.value;
      option.textContent = target.label;
      targetSelect.append(option);
    });
    getVariantPropertiesForTarget(rule.target).forEach((property) => {
      const option = document.createElement("option");
      option.value = property;
      option.textContent = property;
      propertySelect.append(option);
    });
    targetSelect.value = rule.target;
    propertySelect.value = rule.property;
    removeButton.className = "variant-row-remove";
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", "Remove variant rule");
    removeButton.textContent = "−";
    targetSelect.addEventListener("change", () => {
      recordHistory();
      rule.target = targetSelect.value;
      const properties = getVariantPropertiesForTarget(rule.target);
      if (!properties.includes(rule.property)) {
        rule.property = properties[0];
        rule.value = getDefaultVariantValue(rule.property);
      }
      renderVariantSystem();
    });
    propertySelect.addEventListener("change", () => {
      recordHistory();
      rule.property = propertySelect.value;
      rule.value = getDefaultVariantValue(rule.property);
      renderVariantSystem();
    });
    valueInput.addEventListener("input", () => {
      if (valueInput.value === rule.value) return;
      recordHistory();
      rule.value = valueInput.value;
      renderVariantInstances();
    });
    removeButton.addEventListener("click", () => {
      recordHistory();
      variantRules = variantRules.filter((entry) => entry.id !== rule.id);
      renderVariantSystem();
    });
    row.append(renderRuleConditions(rule), targetSelect, propertySelect, valueInput, removeButton);
    return row;
  });
  variantRuleRowsContainer.replaceChildren(...rows);
}

function addVariantProp() {
  recordHistory();
  const existingNames = new Set(variantProps.map((prop) => prop.name));
  const name = ["type", "size", "state"].find((candidate) => !existingNames.has(candidate)) || `property${nextVariantPropId}`;
  variantProps.push({
    id: nextVariantPropId++,
    name,
    type: "enum",
    options: ["default", "alternate"],
    defaultValue: "default",
  });
  variantInstances.forEach((instance) => {
    const prop = variantProps[variantProps.length - 1];
    instance.propValues[prop.id] = prop.defaultValue;
  });
  renderVariantSystem();
}

function addVariantRule() {
  const conditionProp = variantProps.find((prop) => prop.type === "enum" || prop.type === "boolean");
  if (!conditionProp) {
    addVariantProp();
    return;
  }
  recordHistory();
  const values = getVariantPropValues(conditionProp);
  const conditionValue = values.find((value) => value !== conditionProp.defaultValue) ?? values[0];
  variantRules.push({
    id: nextVariantRuleId++,
    conditions: { [conditionProp.id]: conditionValue },
    target: "component:0",
    property: "backgroundColor",
    value: "#4589ff",
  });
  renderVariantSystem();
}

function makeInspectorSection(title) {
  const section = document.createElement("section");
  const titleRow = document.createElement("div");
  const heading = document.createElement("h3");
  section.className = "variant-inspector-section";
  titleRow.className = "variant-inspector-section-title";
  heading.textContent = title;
  titleRow.append(heading);
  section.append(titleRow);
  return { section, titleRow };
}

function makeVariantInspectorField(labelText, control) {
  const field = document.createElement("div");
  const label = document.createElement("label");
  field.className = "variant-inspector-field";
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function renderVariantOverrideRows(instance, section) {
  (instance.overrides ?? []).forEach((override, index) => {
    const row = document.createElement("div");
    const targetSelect = createVariantControl("select", override.target, "Override target layer");
    const propertySelect = createVariantControl("select", override.property, "Override property");
    const valueInput = createVariantControl("input", override.value, "Override value");
    const removeButton = document.createElement("button");
    row.className = "variant-override-row";
    getVariantTargetOptions().forEach((target) => {
      const option = document.createElement("option");
      option.value = target.value;
      option.textContent = target.label;
      targetSelect.append(option);
    });
    getVariantPropertiesForTarget(override.target).forEach((property) => {
      const option = document.createElement("option");
      option.value = property;
      option.textContent = property;
      propertySelect.append(option);
    });
    targetSelect.value = override.target;
    propertySelect.value = override.property;
    removeButton.className = "variant-row-remove";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", "Reset override");
    targetSelect.addEventListener("change", () => {
      recordHistory();
      override.target = targetSelect.value;
      const properties = getVariantPropertiesForTarget(override.target);
      if (!properties.includes(override.property)) override.property = properties[0];
      renderVariantSystem();
    });
    propertySelect.addEventListener("change", () => {
      recordHistory();
      override.property = propertySelect.value;
      override.value = getDefaultVariantValue(override.property);
      renderVariantSystem();
    });
    valueInput.addEventListener("input", () => {
      if (override.value === valueInput.value) return;
      recordHistory();
      override.value = valueInput.value;
      renderVariantInstances();
    });
    removeButton.addEventListener("click", () => {
      recordHistory();
      instance.overrides.splice(index, 1);
      renderVariantSystem();
    });
    row.append(targetSelect, propertySelect, valueInput, removeButton);
    section.append(row);
  });
}

function renderVariantInspector() {
  if (!(variantInspectorContent instanceof HTMLElement)) return;
  const instance = getVariantInstance();
  if (!instance) {
    variantInspectorContent.replaceChildren();
    return;
  }
  const nameInput = createVariantControl("input", instance.name, "Instance name");
  const properties = makeInspectorSection("Properties");
  const overrides = makeInspectorSection("Style overrides");
  const addOverrideButton = document.createElement("button");
  const resetButton = document.createElement("button");
  const deleteButton = document.createElement("button");
  nameInput.addEventListener("change", () => {
    const name = nameInput.value.trim() || `Preview ${instance.id}`;
    if (name === instance.name) return;
    recordHistory();
    instance.name = name;
    renderVariantSystem();
  });
  variantInspectorContent.replaceChildren(makeVariantInspectorField("Name", nameInput));

  variantProps.forEach((prop) => {
    let control;
    const value = normalizeVariantPropValue(prop, instance.propValues[prop.id]);
    if (prop.type === "boolean") {
      control = document.createElement("button");
      control.className = "variant-boolean-toggle";
      control.type = "button";
      control.setAttribute("aria-label", prop.name);
      control.setAttribute("aria-pressed", String(Boolean(value)));
      control.addEventListener("click", () => {
        recordHistory();
        instance.propValues[prop.id] = !Boolean(value);
        renderVariantSystem();
      });
    } else if (prop.type === "enum") {
      control = createVariantControl("select", value, prop.name);
      prop.options.forEach((optionValue) => {
        const option = document.createElement("option");
        option.value = optionValue;
        option.textContent = optionValue;
        control.append(option);
      });
      control.value = String(value);
      control.addEventListener("change", () => {
        recordHistory();
        instance.propValues[prop.id] = control.value;
        renderVariantSystem();
      });
    } else if (prop.type === "string") {
      control = createVariantControl("input", value, prop.name);
      control.addEventListener("input", () => {
        instance.propValues[prop.id] = control.value;
        renderVariantInstances();
      });
    } else {
      control = document.createElement("span");
      control.className = "variant-inspector-label";
      control.textContent = "Action";
    }
    properties.section.append(makeVariantInspectorField(prop.name, control));
  });
  if (variantProps.length === 0) {
    const empty = document.createElement("div");
    empty.className = "variant-empty-state";
    empty.textContent = "Add variant properties from the Variants tab below the canvas.";
    properties.section.append(empty);
  }

  addOverrideButton.className = "variant-small-button";
  addOverrideButton.type = "button";
  addOverrideButton.textContent = "Add override";
  addOverrideButton.addEventListener("click", () => {
    recordHistory();
    instance.overrides.push({ target: "component:0", property: "backgroundColor", value: "#4589ff" });
    renderVariantSystem();
  });
  resetButton.className = "variant-small-button";
  resetButton.type = "button";
  resetButton.textContent = "Reset all";
  resetButton.disabled = instance.overrides.length === 0;
  resetButton.addEventListener("click", () => {
    if (instance.overrides.length === 0) return;
    recordHistory();
    instance.overrides = [];
    renderVariantSystem();
  });
  overrides.titleRow.append(addOverrideButton, resetButton);
  renderVariantOverrideRows(instance, overrides.section);

  deleteButton.className = "variant-small-button variant-danger-button";
  deleteButton.type = "button";
  deleteButton.textContent = "Delete instance";
  deleteButton.addEventListener("click", () => removeVariantInstance(instance.id));
  const actions = makeInspectorSection("Instance");
  actions.section.append(deleteButton);
  variantInspectorContent.append(properties.section, overrides.section, actions.section);
}

function createInstanceTreeRow(label, depth, icon, selected, instanceId) {
  const row = document.createElement("button");
  const iconCell = document.createElement("span");
  const labelSpan = document.createElement("span");
  row.className = `tree-node tree-node--dynamic tree-node--level-${Math.min(depth, 2)}`;
  row.classList.toggle("is-selected", selected);
  row.type = "button";
  row.style.paddingLeft = `${Math.max(0, depth - 1) * 20}px`;
  row.setAttribute("role", "treeitem");
  iconCell.className = "icon-cell";
  iconCell.append(icon);
  labelSpan.className = "tree-node-label";
  labelSpan.textContent = label;
  row.append(iconCell, labelSpan);
  row.addEventListener("click", () => selectVariantInstance(instanceId));
  return row;
}

function appendInstanceLayerRows(fragment, parentFrameId, depth, instance) {
  getLayerChildren(parentFrameId).forEach((layer) => {
    fragment.append(createInstanceTreeRow(
      getTreeNodeName(layer.type, layer.record),
      depth,
      createLayerTypeIcon(layer.type, layer.record),
      false,
      instance.id,
    ));
    if (layer.type === "frame") appendInstanceLayerRows(fragment, layer.record.id, depth + 1, instance);
  });
}

function renderVariantLayersTree() {
  if (!(instanceTreeView instanceof HTMLElement)) return;
  if (variantInstances.length === 0) {
    const empty = document.createElement("div");
    empty.className = "variant-empty-state";
    empty.textContent = "No instances on canvas.";
    instanceTreeView.replaceChildren(empty);
    return;
  }
  const nodes = document.createDocumentFragment();
  variantInstances.forEach((instance) => {
    nodes.append(createInstanceTreeRow(instance.name, 1, createLayerTypeIcon("component"), instance.id === selectedVariantInstanceId, instance.id));
    appendInstanceLayerRows(nodes, null, 2, instance);
  });
  instanceTreeView.replaceChildren(nodes);
}

function renderVariantAuthoring() {
  renderVariantPropAuthoring();
  renderVariantRuleAuthoring();
}

function renderVariantSystem() {
  renderVariantInstances();
  renderVariantLayersTree();
  renderVariantAuthoring();
  renderVariantInspector();
}

addVariantButton?.addEventListener("click", addVariantInstance);
addVariantPropButton?.addEventListener("click", addVariantProp);
addVariantRuleButton?.addEventListener("click", addVariantRule);

if (canvasRootStack instanceof HTMLElement) {
  const variantSchemaObserver = new MutationObserver(() => scheduleVariantInstanceRender());
  variantSchemaObserver.observe(canvasRootStack, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["style", "data-layer-visibility", "data-frame-color", "data-text-color", "data-vector-color"],
  });
}

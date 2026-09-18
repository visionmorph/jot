/* Instance placement and instance-local editing. */
let selectedNestedInstanceLayer = null;
function selectNestedInstanceLayerIdentity(instancePath, target, parentVariantId = null) {
  if (!currentComponent || !instancePath.length) return false;
  const identity = createPlacedLayerIdentity(currentComponent.id, instancePath, target);
  if (!resolveLayerIdentity(identity)) return false;
  const id = instancePath[0];
  selectedNestedInstanceLayer = { ownerId: currentComponent.id, instanceId: id,
    nestedPath: instancePath.slice(1), parentVariantId, target };
  if (parentVariantId == null) selectLayerKeys([`component-instance:${id}`]);
  else selectVariantState(parentVariantId, `component-instance:${id}`);
  syncElementSelectionStyles();
  renderLayerTree();
  updateInspector();
  return true;
}
function selectNestedInstanceLayer(wrapper, child, id, parentVariantId) {
  const scope = child.closest("[data-identity-source]");
  const scopedIdentity = getRenderedLayerScope(scope);
  if (!scopedIdentity || scopedIdentity.ownerComponentId !== currentComponent?.id
    || scopedIdentity.instancePath[0] !== id || !wrapper.contains(scope)) return false;
  const descriptor = getCanvasLayerDescriptor(child);
  if (!descriptor || !["frame", "text", "vector", "component-instance"].includes(descriptor.type)) return false;
  const target = createSourceLayerIdentity(scopedIdentity.source.componentId, descriptor.type, descriptor.id);
  return selectNestedInstanceLayerIdentity(scopedIdentity.instancePath, target, parentVariantId);
}

function getSelectedNestedInstanceLayer() {
  const selection = selectedNestedInstanceLayer;
  if (!selection || !currentComponent || selection.ownerId !== currentComponent.id) return null;
  const key = `component-instance:${selection.instanceId}`;
  const selected = selection.parentVariantId == null ? getSelectedLayerKeys() : getSelectedVariantLayerTargets(selection.parentVariantId);
  if (!selected.includes(key) || (selection.parentVariantId == null) !== (selectedVariantId == null)) {
    selectedNestedInstanceLayer = null;
    return null;
  }
  const record = getLayerRecord(key);
  const root = selection.parentVariantId == null ? canvasRootStack
    : componentSet.querySelector(`.variant-preview[data-variant-id="${selection.parentVariantId}"] .canvas-root-stack`);
  const identity = createPlacedLayerIdentity(currentComponent.id, [selection.instanceId, ...selection.nestedPath], selection.target);
  const element = root && findLayerElementByIdentity(root, identity);
  return record && element ? { ...selection, record, identity, element } : null;
}

function setNestedInstanceLayerOverride(selection, property, value, reset = false, historyOwner = null) {
  return setNestedInstanceLayerOverrides(selection, [{ property, value, reset }], historyOwner);
}
function setNestedInstanceLayerOverrides(selection, edits, historyOwner = null) {
  if (edits.some(({ property }) => !INSTANCE_LAYER_PROPERTIES.includes(property))) throw new TypeError("Invalid instance layer property.");
  const definition = getComponentDefinition(currentComponent.id);
  const record = getComponentDefinitionLayer(definition, "component-instance", selection.instanceId);
  if (!record || !resolveLayerIdentity(createPlacedLayerIdentity(currentComponent.id,
    [selection.instanceId, ...selection.nestedPath], selection.target))) throw new TypeError("Missing nested source layer.");
  const variant = selection.parentVariantId == null ? null
    : definition.variants.find(entry => entry.id === selection.parentVariantId);
  if (selection.parentVariantId != null && !variant) throw new TypeError("Missing parent variant.");
  const target = variant ? createPlacedLayerIdentity(currentComponent.id,
    [selection.instanceId, ...selection.nestedPath], selection.target)
    : selection.nestedPath.length ? createPlacedLayerIdentity(record.sourceComponentId, selection.nestedPath, selection.target)
      : selection.target;
  const existingOverrides = variant ? variant.overrides : record.layerOverrides ?? [];
  let overrides = existingOverrides;
  edits.forEach(({ property, value, reset = false }) => {
    const existing = overrides.find(entry => sameLayerIdentity(entry.target, target) && entry.property === property);
    if (reset ? !existing : existing?.value === value) return;
    overrides = overrides.filter(entry => !(sameLayerIdentity(entry.target, target) && entry.property === property));
    if (!reset) overrides.push({ target, property, value: String(value) });
  });
  if (overrides === existingOverrides) return false;
  if (variant) variant.overrides = overrides; else record.layerOverrides = overrides;
  if (historyOwner) recordHistoryForGesture(historyOwner);
  const wasBatchingHistory = isBatchingHistory;
  if (historyOwner) isBatchingHistory = true;
  try { updateComponentDefinition(currentComponent.id, definition); }
  finally { isBatchingHistory = wasBatchingHistory; }
  return true;
}
function selectComponentInstance(id, additive = false, variantId = null) {
  selectedNestedInstanceLayer = null;
  const record = getLayerRecord({ type: "component-instance", id });
  if (!record) return;
  const key = `component-instance:${id}`;
  if (variantId != null) {
    const keys = additive ? getSelectedVariantLayerTargets(variantId) : [];
    selectVariantsLayerTargetsState([variantId], keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key], variantId);
  } else {
    const keys = additive ? getSelectedLayerKeys() : [];
    selectLayerKeys(keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key], key);
  }
  expandFramePath(record.parentId);
  syncElementSelectionStyles();
  renderTree();
}

function getSelectedComponentInstances() {
  const keys = selectedVariantId == null ? getSelectedLayerKeys() : getSelectedVariantLayerTargets();
  return keys.filter(key => key.startsWith("component-instance:")).map(getLayerRecord).filter(Boolean);
}

function bindComponentInstanceInteractions(element, id, variantId = null) {
  const labelAt = target => {
    const text = target instanceof Element ? target.closest(".canvas-text") : null;
    return text?.closest("[data-identity-source]") === element.firstElementChild ? text : null;
  };
  element.addEventListener("pointerdown", event => {
    if (labelAt(event.target) && (activeTool === "text" || instanceTextEditing)) event.stopPropagation();
  }, true);
  element.addEventListener("dblclick", event => {
    const text = labelAt(event.target);
    if (text && activeTool === "select") beginInstanceTextEditing(element, text, id, variantId, event);
  });
  element.addEventListener("click", event => {
    event.stopPropagation();
    const text = labelAt(event.target);
    if (instanceTextEditing?.element === text) return;
    if (text && activeTool === "text") {
      selectTool("select");
      beginInstanceTextEditing(element, text, id, variantId, event);
      return;
    }
    if (activeTool !== "select" || consumeSuppressedCanvasClick(event)) return;
    const child = event.target instanceof Element
      ? event.target.closest(".canvas-frame, .canvas-text, .canvas-vector, .canvas-component-instance") : null;
    if (child && child !== element && selectNestedInstanceLayer(element, child, id, variantId)) return;
    selectedNestedInstanceLayer = null;
    selectComponentInstance(id, isAdditiveSelectClick(event), variantId);
  });
  element.draggable = variantId == null;
  element.addEventListener("dragstart", event => {
    event.stopPropagation();
    setLayerDragData(event, "component-instance", id);
    startCanvasDragSession({ type: "component-instance", id }, true);
  });
}

let instanceTextEditing = null;
function beginInstanceTextEditing(wrapper, text, id, parentVariantId, event) {
  event.preventDefault();
  event.stopPropagation();
  if (instanceTextEditing?.element === text) return;
  if (instanceTextEditing) instanceTextEditing.element.blur();
  const base = getLayerRecord({ type: "component-instance", id });
  if (!base) return;
  const record = parentVariantId == null ? { ...base, parentVariantId: null }
    : { ...resolveInstanceSettings(base, resolveVariantOperations(getVariant(parentVariantId)), currentComponent.id), parentVariantId };
  const textId = Number(text.dataset.textId);
  const original = getInstanceLabelValue(record, createSourceLayerIdentity(base.sourceComponentId, "text", textId));
  if (original === null) return;
  const session = { element: text, ownerId: currentComponent.id };
  instanceTextEditing = session;
  wrapper.draggable = false;
  if (parentVariantId == null) selectLayerKeys([`component-instance:${id}`]);
  else selectVariantState(parentVariantId, `component-instance:${id}`);
  const finish = () => {
    if (instanceTextEditing !== session) return;
    instanceTextEditing = null;
    const value = text.innerText.replace(/\r\n/g, "\n");
    text.contentEditable = "false";
    text.onkeydown = null;
    text.onpaste = null;
    wrapper.draggable = parentVariantId == null;
    if (currentComponent?.id === session.ownerId && value !== original) {
      setSelectedInstanceSetting([record], `instanceLabel:${textId}`, value);
    }
    scheduleComponentInstanceRefresh();
    scheduleVariantRender();
    updateInspector();
  };
  text.addEventListener("blur", finish, { once: true });
  text.onkeydown = event => {
    event.stopPropagation();
    if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault();
      text.blur();
    }
  };
  text.onpaste = event => {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  };
  focusTextEditor(text);
}

const instancePicker = document.createElement("dialog");
instancePicker.className = "component-picker";
instancePicker.setAttribute("aria-label", "Insert component");
instancePicker.addEventListener("keydown", event => event.stopPropagation());
document.body.append(instancePicker);
document.querySelector("[data-insert-component]").addEventListener("click", () => {
  if (!currentComponent) return;
  const ownerId = currentComponent.id;
  const selectedFrame = getSelectedFrameRecord();
  const parentId = selectedFrame?.type === "component-instance" ? selectedFrame.parentId
    : selectedFrame && !selectedFrame.isComponent ? selectedFrame.id : null;
  const variantId = selectedVariantId;
  instancePicker.replaceChildren();
  const heading = document.createElement("h2");
  heading.textContent = "Insert component";
  const explanation = document.createElement("p");
  explanation.textContent = parentId == null ? `Into ${currentComponent.name}` : `Into ${selectedFrame.name}`;
  const choices = document.createElement("div");
  choices.className = "component-picker-choices";
  for (const source of components) {
    const candidate = getComponentDefinition(ownerId);
    candidate.layers.push({ type: "component-instance", sourceComponentId: source.id });
    try { validateComponentDependencies(candidate); } catch { continue; }
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = source.name;
    button.addEventListener("click", () => {
      if (currentComponent?.id !== ownerId) { instancePicker.close(); return; }
      try {
        const instance = addComponentInstance(ownerId, source.id, { parentId, name: source.name,
          variantId: getDefinitionDefaultVariant(getComponentDefinition(source.id))?.id ?? null });
        instancePicker.close();
        selectComponentInstance(instance.id, false, variantId ?? variantModel.getVariants()[0]?.id ?? null);
      } catch (error) { explanation.textContent = error.message; }
    });
    choices.append(button);
  }
  if (!choices.children.length) choices.textContent = "No components available. Create another component first. Circular references are excluded.";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Cancel";
  close.addEventListener("click", () => instancePicker.close());
  instancePicker.append(heading, explanation, choices, close);
  instancePicker.showModal();
});

const componentInstanceInspector = document.createElement("section");
componentInstanceInspector.className = "component-instance-inspector instance-heading-props";
componentInstanceInspector.hidden = true;
componentInstanceInspector.setAttribute("aria-label", "Component instance");
frameInspector.prepend(componentInstanceInspector);
function syncNestedComponentInstanceHeading(selection) {
  componentInstanceInspector.replaceChildren();
  componentInstanceInspector.hidden = false;
  const heading = document.createElement("h2");
  heading.className = "inspector-heading";
  heading.textContent = resolveLayerIdentity(selection.identity)?.node?.name ?? "Component instance";
  const titleRow = document.createElement("div");
  titleRow.className = "panel-heading-wrap section-title-row";
  titleRow.append(heading);
  componentInstanceInspector.append(titleRow);
}
function syncComponentInstanceInspector() {
  const records = getSelectedInstanceSettingContexts();
  componentInstanceInspector.hidden = records.length === 0;
  componentInstanceInspector.replaceChildren();
  if (!records.length) return false;
  const heading = document.createElement("h2");
  heading.className = "inspector-heading";
  heading.textContent = records.length === 1 ? records[0].name : `${records.length} component instances`;
  const titleRow = document.createElement("div");
  titleRow.className = "panel-heading-wrap section-title-row";
  titleRow.append(heading);
  componentInstanceInspector.append(titleRow);
  const sourceIds = new Set(records.map(record => record.sourceComponentId));
  if (sourceIds.size > 1) {
    componentInstanceInspector.append("Select instances of the same component to change their variant together.");
    return true;
  }
  const source = getComponentDefinition(records[0].sourceComponentId);
  appendInstancePropControls(records, source);
  return true;
}

function getSelectedInstanceSettingContexts() {
  const variantIds = getSelectedVariantIds();
  if (!variantIds.length) return getSelectedComponentInstances().map(record => ({ ...record, parentVariantId: null }));
  return variantIds.flatMap(parentVariantId => {
    const operations = resolveVariantOperations(getVariant(parentVariantId));
    return getSelectedVariantLayerTargets(parentVariantId).filter(key => key.startsWith("component-instance:"))
      .map(getLayerRecord).filter(Boolean).map(record => ({ ...resolveInstanceSettings(record, operations, currentComponent.id), parentVariantId }));
  });
}

function getInstanceInspectorFrameRecords() {
  return getSelectedInstanceSettingContexts().map(record => {
    const parentRoot = record.parentVariantId == null ? canvasRootStack
      : componentSet.querySelector(`.variant-preview[data-variant-id="${record.parentVariantId}"] .canvas-root-stack`);
    const wrapper = parentRoot && findVariantTarget(parentRoot, `component-instance:${record.id}`);
    const element = wrapper?.firstElementChild;
    return element?.classList.contains("component-instance-content") ? { ...record, element, isComponent: false,
      isVariant: record.parentVariantId != null, variantId: record.parentVariantId } : null;
  }).filter(Boolean);
}

function appendInstancePropControls(records, source) {
  if (!source) return;
  const controls = document.createElement("div");
  controls.className = "instance-prop-controls";
  (source.componentProps ?? []).filter(prop => ["string", "enum", "boolean"].includes(prop.type)).forEach(prop => {
    const field = document.createElement("div");
    const caption = document.createElement("label");
    const inputId = `instance-prop-${prop.id}`;
    field.className = "field-input";
    caption.className = "label";
    caption.textContent = prop.name;
    caption.id = `${inputId}-label`;
    const textTarget = prop.type === "string" && prop.targetTextId != null && prop.property === "textContent";
    const property = textTarget ? `instanceLabel:${prop.targetTextId}` : `instanceProp:${prop.id}`;
    const values = records.map(record => {
      if (textTarget) return getInstanceLabelValue(record, createSourceLayerIdentity(source.componentId, "text", prop.targetTextId));
      if (Object.hasOwn(record.propValues ?? {}, prop.id)) return record.propValues[prop.id];
      const variant = getComponentInstanceStatus(record).variant;
      const axis = source.variantProps.find(axis => axis.id === prop.variantPropId);
      return axis ? normalizeVariantPropValue(axis, variant?.propValues?.[axis.id]) : prop.defaultValue;
    });
    const mixed = new Set(values).size > 1;
    const commit = value => setSelectedInstanceSetting(records, property, value);
    let control;
    if (prop.type === "boolean") {
      control = document.createElement("div");
      control.className = "text-toggle";
      control.setAttribute("role", "group");
      control.setAttribute("aria-labelledby", caption.id);
      for (const value of [true, false]) {
        const button = document.createElement("button");
        const selected = !mixed && Boolean(values[0]) === value;
        button.className = `text-toggle__item${selected ? " is-selected" : ""}`;
        button.type = "button";
        button.textContent = getBooleanComponentPropValueLabel(prop, value);
        button.setAttribute("aria-pressed", String(selected));
        button.addEventListener("click", () => commit(value));
        control.append(button);
      }
    } else if (prop.type === "enum") {
      control = document.createElement("div");
      control.className = "dropdown dropdown--default";
      control.dataset.dropdown = "";
      const input = document.createElement("input");
      const toggle = document.createElement("button");
      const chevron = document.createElement("span");
      const menu = document.createElement("div");
      const menuId = `${inputId}-menu`;
      input.className = "dropdown__input";
      input.id = inputId;
      input.type = "text";
      input.readOnly = true;
      input.setAttribute("role", "combobox");
      input.setAttribute("aria-autocomplete", "none");
      input.setAttribute("aria-expanded", "false");
      input.setAttribute("aria-controls", menuId);
      toggle.className = "dropdown__toggle";
      toggle.type = "button";
      toggle.dataset.dropdownToggle = "";
      toggle.setAttribute("aria-label", `Open ${prop.name} options`);
      toggle.setAttribute("aria-expanded", "false");
      chevron.className = "chevron inspector-select-chevron";
      chevron.setAttribute("aria-hidden", "true");
      toggle.append(chevron);
      menu.className = "dropdown__menu";
      menu.id = menuId;
      menu.dataset.dropdownMenu = "";
      menu.setAttribute("role", "listbox");
      menu.hidden = true;
      const axis = source.variantProps.find(axis => axis.id === prop.variantPropId);
      (axis?.options ?? prop.options ?? []).forEach(value => {
        const option = document.createElement("button");
        option.className = "dropdown__option";
        option.type = "button";
        option.textContent = value;
        option.dataset.dropdownValue = value;
        option.setAttribute("role", "option");
        option.setAttribute("aria-selected", "false");
        menu.append(option);
      });
      control.append(input, toggle, menu);
      if (mixed) { input.value = "Mixed"; input.dataset.value = "__mixed"; }
      else setDropdownValue(input, values[0]);
      input.addEventListener("change", () => commit(getDropdownValue(input)));
      bindDropdown(control);
    } else {
      control = document.createElement("input"); control.type = "text"; control.className = "text-input";
      control.id = inputId;
      control.value = mixed ? "" : values[0] ?? ""; control.placeholder = mixed ? "Mixed" : "";
      control.addEventListener("change", () => commit(control.value));
      control.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); control.blur(); } });
    }
    if (prop.type !== "boolean") caption.htmlFor = inputId;
    field.append(caption, control);
    controls.append(field);
  });
  if (controls.children.length) componentInstanceInspector.append(controls);
}

function setSelectedInstanceSetting(records, property, value, reset = false) {
  const ownerId = currentComponent.id;
  const definition = getComponentDefinition(ownerId);
  let changed = false;
  records.forEach(record => {
    const node = getComponentDefinitionLayer(definition, "component-instance", record.id);
    if (!node) throw new TypeError("Missing component instance.");
    if (!reset) {
      if (property.startsWith("instanceProp:")) {
        const prop = getComponentDefinition(node.sourceComponentId)?.componentProps.find(prop => prop.id === Number(property.split(":")[1]));
        if (!prop || (prop.type === "boolean" ? typeof value !== "boolean" : typeof value !== "string")
          || (prop.type === "enum" && !prop.options.includes(value))) throw new TypeError("Invalid instance property value.");
      } else if (property === "instanceVariantId") {
        if (getComponentInstanceStatus({ ...node, variantId: value }).status !== "ready") throw new TypeError("Missing source variant.");
      } else if (typeof value !== "string" || getInstanceLabelValue(record,
        createSourceLayerIdentity(node.sourceComponentId, "text", Number(property.split(":")[1]))) === null) throw new TypeError("Missing text label.");
    }
    if (record.parentVariantId == null) {
      if (property.startsWith("instanceProp:")) {
        node.propValues ??= {};
        const propId = property.split(":")[1];
        if (reset ? !Object.hasOwn(node.propValues, propId) : node.propValues[propId] === value) return;
        if (reset) delete node.propValues[propId]; else node.propValues[propId] = value;
        changed = true;
      } else if (property === "instanceVariantId") {
        if (node.variantId !== value) { node.variantId = value; changed = true; }
      } else {
        const target = createSourceLayerIdentity(node.sourceComponentId, "text", Number(property.split(":")[1]));
        const previous = node.labelOverrides ?? [];
        const existing = previous.find(entry => sameLayerIdentity(entry.target, target));
        if (reset ? !existing : existing?.value === value) return;
        node.labelOverrides = previous.filter(entry => !sameLayerIdentity(entry.target, target));
        if (!reset) node.labelOverrides.push({ target, value });
        changed = true;
      }
      return;
    }
    const variant = definition.variants.find(variant => variant.id === record.parentVariantId);
    if (!variant) throw new TypeError("Missing parent variant.");
    const target = createSourceLayerIdentity(ownerId, "component-instance", node.id);
    const existing = variant.overrides.find(entry => sameLayerIdentity(entry.target, target) && entry.property === property);
    if (reset ? !existing : existing?.value === value) return;
    variant.overrides = variant.overrides.filter(entry => !(sameLayerIdentity(entry.target, target) && entry.property === property));
    if (!reset) variant.overrides.push({ target, property, value });
    changed = true;
  });
  if (changed) {
    updateComponentDefinition(ownerId, definition);
    scheduleVariantRender();
  }
}

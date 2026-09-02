/* Component variant properties, delta resolution, canvas previews, and instance overrides. */

function unlinkComponentPropVariantDefinition(componentProp) {
  if (componentProp.variantPropId == null) return;
  const variantPropId = componentProp.variantPropId;
  removeVariantPropDefinition(variantPropId);
  delete componentProp.variantPropId;
  renderVariantSystem();
}

function isVariantBoundComponentProp(componentProp) {
  return componentProp?.type === "enum" || componentProp?.type === "boolean";
}

function syncComponentPropVariantDefinition(componentProp, { render = true } = {}) {
  if (!isVariantBoundComponentProp(componentProp)) {
    unlinkComponentPropVariantDefinition(componentProp);
    return;
  }
  const isBoolean = componentProp.type === "boolean";
  const booleanDefault = componentProp.defaultValue === true || componentProp.defaultValue === "true";
  const options = [...getComponentPropOptions(componentProp)];
  const defaultValue = isBoolean ? booleanDefault : options[0];
  let variantProp = variantModel.getProps().find((prop) => prop.id === componentProp.variantPropId);
  if (!variantProp) {
    variantProp = variantModel.addProp({
      name: componentProp.name,
      type: isBoolean ? "boolean" : "enum",
      ...(isBoolean ? {} : { options }),
      ...(componentProp.variantSubtype ? { variantSubtype: componentProp.variantSubtype } : {}),
      defaultValue,
      sourceComponentPropId: componentProp.id,
    });
    componentProp.variantPropId = variantProp.id;
  } else {
    variantProp.name = componentProp.name;
    variantProp.type = isBoolean ? "boolean" : "enum";
    if (componentProp.variantSubtype) variantProp.variantSubtype = componentProp.variantSubtype;
    else delete variantProp.variantSubtype;
    if (isBoolean) {
      delete variantProp.options;
      variantProp.defaultValue = booleanDefault;
    } else {
      variantProp.options = options;
      variantProp.defaultValue = options[0];
    }
  }
  componentProp.defaultValue = getVariantPropDefaultValue(variantProp);
  variantModel.getInstances().forEach((instance) => {
    const propValues = getVariantInstancePropValues(instance);
    const booleanValue = propValues[variantProp.id];
    const hasValidBooleanValue = booleanValue === true || booleanValue === false
      || booleanValue === "true" || booleanValue === "false";
    if (isBoolean && !hasValidBooleanValue) {
      setVariantInstancePropValue(instance, variantProp.id, getVariantPropDefaultValue(variantProp));
    }
    if (!isBoolean && !options.includes(propValues[variantProp.id])) {
      setVariantInstancePropValue(instance, variantProp.id, getVariantPropDefaultValue(variantProp));
    }
  });
  if (!isBoolean) removeInvalidVariantRuleConditions(variantProp.id, options);
  if (render) renderVariantSystem();
}

function getSelectedVariantStyleOverride(property, fallback = "") {
  const instance = getVariantInstance();
  const override = instance ? getEffectiveVariantOverride(instance, "component:0", property) : null;
  return override ? String(override.value ?? "") : fallback;
}

function getSelectedVariantTargetStyleOverride(property, fallback = "") {
  const instance = getVariantInstance();
  const target = selectedVariantLayerTarget || "component:0";
  const override = instance ? getEffectiveVariantOverride(instance, target, property) : null;
  return override ? String(override.value ?? "") : fallback;
}

function setSelectedVariantStyleOverride(property, value, { render = true, record = true } = {}) {
  const instance = getVariantInstance();
  if (!instance) return false;
  const nextValue = String(value ?? "");
  const existingOverride = (instance.overrides ?? [])
    .find((entry) => entry.target === "component:0" && entry.property === property);
  if (existingOverride?.value === nextValue) return true;
  if (record) recordHistory();
  upsertLocalVariantOverride(instance, "component:0", property, nextValue);
  if (render) renderVariantInstances();
  else syncVariantLayerStylePreviews("component:0", property);
  return true;
}

function setVariantTextOverride(instance, textId, value, { render = true } = {}) {
  const target = `text:${textId}`;
  const { changed } = upsertLocalVariantOverride(instance, target, "textContent", value);
  if (!changed) return;
  if (render) renderVariantInstances();
}

function setSelectedVariantLayerOverride(property, value, { render = false } = {}) {
  const instance = getVariantInstance();
  if (!instance || !selectedVariantLayerTarget) return false;
  const nextValue = String(value ?? "");
  const { changed } = upsertLocalVariantOverride(
    instance,
    selectedVariantLayerTarget,
    property,
    nextValue,
  );
  if (!changed) return true;
  if (render) renderVariantInstances();
  else syncVariantLayerStylePreviews(selectedVariantLayerTarget, property);
  return true;
}

function setSelectedVariantFrameStyleOverride(property, value, options = {}) {
  if (selectedVariantLayerTarget?.startsWith("frame:")) {
    if (options.record !== false) recordHistory();
    return setSelectedVariantLayerOverride(property, value, {
      ...options,
      render: options.render !== false,
    });
  }
  return setSelectedVariantStyleOverride(property, value, options);
}

function resolveVariantCanvasSelectionTarget(eventTarget) {
  const hit = resolveCanvasHit(eventTarget);
  if (hit.kind !== "variant-root" && hit.kind !== "variant-layer") return null;
  const instanceId = hit.instanceId;
  if (!Number.isFinite(instanceId) || !getVariantInstance(instanceId)) return null;

  if (hit.kind === "variant-layer") {
    return {
      kind: "variant-layer",
      instanceId,
      target: `${hit.layer.type}:${hit.layer.id}`,
      element: hit.element,
    };
  }

  return {
    kind: "variant-root",
    instanceId,
    target: null,
    element: hit.element,
  };
}

canvas?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || activeTool !== "select") return;
  const target = resolveVariantCanvasSelectionTarget(event.target);
  if (!target || target.element?.isContentEditable) return;
  // Variant child selection and dragging are handled by the shared canvas
  // layer gesture. This branch owns only whole-variant selection.
  if (target.kind === "variant-layer") return;
  if (isVariantInstanceSelected(target.instanceId)
    && getSelectedVariantInstanceIds().length > 1) {
    clearMasterSelectionForVariant();
    return;
  }
  selectVariantInstance(target.instanceId, {
    render: false,
    layerTarget: target.target,
  });
  if (target.kind === "variant-root") renderComponentProps();
});

function selectNewSharedLayerInVariant(instanceId, target, { editText = false } = {}) {
  selectVariantState(instanceId, target);
  clearMasterSelectionForVariant();
  selectTool("select");
  renderTree();
  if (!editText) return;
  setTimeout(() => {
    requestAnimationFrame(() => {
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(instanceId))}"]`);
      const text = preview ? findVariantTarget(preview.querySelector(".canvas-root-stack"), target) : null;
      if (text instanceof HTMLElement) text.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0 }));
    });
  }, 0);
}

function handleVariantStructureToolClick(instance, parentTarget, event) {
  if (activeTool !== "text" && activeTool !== "frame") return false;
  const parentRecord = parentTarget === "component:0"
    ? currentComponent?.frameRecord
    : parentTarget.startsWith("frame:")
      ? getFrameRecord(Number(parentTarget.split(":")[1]))
      : null;
  if (!parentRecord) return false;
  event.preventDefault();
  event.stopPropagation();
  if (activeTool === "frame") {
    const record = createCanvasFrame(0, 0, parentRecord, { select: false });
    if (record) selectNewSharedLayerInVariant(instance.id, `frame:${record.id}`);
    return true;
  }
  const record = createCanvasText(parentRecord, 0, 0, {
    beginEditing: false,
    isNew: false,
    textContent: "Text",
    useDefaultName: true,
  });
  if (!record) return true;
  selectNewSharedLayerInVariant(instance.id, `text:${record.id}`, { editText: true });
  return true;
}

function clearMasterSelectionForVariant() {
  clearElementSelection();
}

function selectVariantInstance(instanceId, options = {}) {
  if (!getVariantInstance(instanceId)) return false;
  const hasLayerTargets = Object.prototype.hasOwnProperty.call(options, "layerTargets");
  const hasLayerTarget = Object.prototype.hasOwnProperty.call(options, "layerTarget");
  const nextTargets = hasLayerTargets
    ? options.layerTargets
    : hasLayerTarget
      ? options.layerTarget === null ? [] : [options.layerTarget]
      : selectedVariantInstanceId === instanceId && options.preserveLayerSelection === true
        ? getSelectedVariantLayerTargets()
        : [];
  const nextTarget = hasLayerTargets
    ? options.anchorTarget ?? nextTargets[nextTargets.length - 1] ?? null
    : hasLayerTarget
    ? options.layerTarget
    : selectedVariantInstanceId === instanceId && options.preserveLayerSelection === true
      ? selectedVariantLayerTarget
      : null;
  if (nextTargets.length > 0) {
    selectVariantLayerTargetsState(instanceId, nextTargets, nextTarget);
  } else {
    selectVariantState(instanceId, null);
  }
  clearMasterSelectionForVariant();
  if (options.render !== false) renderTree();
  else {
    document.querySelectorAll(".variant-preview").forEach((preview) => {
      const isSelectedInstance = Number(preview.dataset.variantInstanceId) === instanceId;
      preview.classList.toggle("is-selected", isSelectedInstance);
      preview.setAttribute("aria-selected", String(isSelectedInstance));
      const root = preview.querySelector(".canvas-root-stack");
      if (root instanceof HTMLElement) {
        const isSelectedRoot = isSelectedInstance && selectedVariantLayerTarget === null;
        root.classList.toggle("is-selected", isSelectedRoot);
        root.setAttribute("aria-selected", String(isSelectedRoot));
      }
      preview.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((layerElement) => {
        const type = layerElement.classList.contains("canvas-frame")
          ? "frame"
          : layerElement.classList.contains("canvas-text") ? "text" : "vector";
        const id = Number(layerElement.dataset[`${type}Id`]);
        const isSelectedLayer = isSelectedInstance
          && Number.isFinite(id)
          && selectedVariantLayerTargets.has(`${type}:${id}`);
        layerElement.classList.toggle("is-selected", isSelectedLayer);
        layerElement.setAttribute("aria-selected", String(isSelectedLayer));
      });
    });
    syncLayerTreeSelectionStyles();
    updateInspector();
    syncResizeOverlay();
  }
  requestAnimationFrame(syncResizeOverlay);
  return true;
}

function addVariantInstance({ render = true } = {}) {
  if (!currentComponent) return null;
  recordHistory();
  if (variantModel.getInstances().length === 0) {
    variantModel.addInstance({
      name: "Variant 1",
      componentId: currentComponent.id,
      parentVariantId: null,
      propValues: Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
      overrides: [],
    });
  }
  const sourceInstance = getVariantInstance() ?? getDefaultVariantInstance();
  const index = variantModel.getInstances().length;
  const instance = variantModel.addInstance({
    name: `Variant ${index + 1}`,
    componentId: currentComponent.id,
    parentVariantId: sourceInstance?.id ?? null,
    propValues: sourceInstance
      ? structuredClone(sourceInstance.propValues ?? {})
      : Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
    overrides: [],
  });
  selectVariantState(instance.id, null);
  clearMasterSelectionForVariant();
  if (render) renderTree();
  return instance;
}

function requestAddVariant(event = null) {
  event?.preventDefault();
  event?.stopPropagation();
  const instance = addVariantInstance({ render: false });
  if (!instance) return false;

  // Render the document and all dependent panels once from the completed state.
  renderTree();
  selectVariantInstance(instance.id, { render: false, preserveLayerSelection: true });
  let preview = componentSet?.querySelector(
    `.variant-preview[data-variant-instance-id="${CSS.escape(String(instance.id))}"]`,
  );
  if (preview instanceof HTMLElement) void preview.getBoundingClientRect();
  syncResizeOverlay();
  if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });

  // Commit again on the next paint even when the preview node already exists.
  // A DOM-count check cannot detect a preview that was created but not laid out.
  requestAnimationFrame(() => {
    if (!getVariantInstance(instance.id)) return;
    renderVariantInstances();
    selectVariantInstance(instance.id, { render: false, preserveLayerSelection: true });
    preview = componentSet?.querySelector(
      `.variant-preview[data-variant-instance-id="${CSS.escape(String(instance.id))}"]`,
    );
    if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });
    syncResizeOverlay();
  });
  return true;
}

function removeVariantInstance(instanceId) {
  const index = variantModel.getInstances().findIndex((instance) => instance.id === instanceId);
  if (index < 0) return false;
  const instance = variantModel.getInstances()[index];
  if (!canRemoveVariantInstance(instance)) return false;
  recordHistory();
  const removedInstance = instance;
  variantModel.getInstances().forEach((instance) => {
    if (instance.parentVariantId !== removedInstance.id) return;
    const localKeys = new Set((instance.overrides ?? []).map((override) => `${override.target}\u0000${override.property}`));
    const inheritedFromRemoved = (removedInstance.overrides ?? [])
      .filter((override) => !localKeys.has(`${override.target}\u0000${override.property}`))
      .map((override) => structuredClone(override));
    instance.overrides = [...inheritedFromRemoved, ...(instance.overrides ?? [])];
    instance.parentVariantId = removedInstance.parentVariantId ?? null;
  });
  variantModel.replaceInstances(
    variantModel.getInstances().filter((candidate) => candidate.id !== instanceId),
  );
  normalizeDefaultVariantInstance();
  const nextInstanceId = variantModel.getInstances()[Math.min(index, variantModel.getInstances().length - 1)]?.id ?? null;
  if (nextInstanceId == null) selectComponentState(currentComponent?.id);
  else selectVariantState(nextInstanceId, null);
  renderTree();
  return true;
}

function renderVariantSystem() {
  renderVariantInstances();
}

addVariantButton?.addEventListener("click", requestAddVariant);

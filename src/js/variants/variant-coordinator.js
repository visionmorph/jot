/* Component variant properties, delta resolution, canvas previews, and variant overrides. */

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
  variantModel.getVariants().forEach((variant) => {
    const propValues = getVariantAssignedPropValues(variant);
    const booleanValue = propValues[variantProp.id];
    const hasValidBooleanValue = booleanValue === true || booleanValue === false
      || booleanValue === "true" || booleanValue === "false";
    if (isBoolean && !hasValidBooleanValue) {
      setVariantPropValue(variant, variantProp.id, getVariantPropDefaultValue(variantProp));
    }
    if (!isBoolean && !options.includes(propValues[variantProp.id])) {
      setVariantPropValue(variant, variantProp.id, getVariantPropDefaultValue(variantProp));
    }
  });
  if (!isBoolean) removeInvalidVariantRuleConditions(variantProp.id, options);
  if (render) renderVariantSystem();
}

function getSelectedVariantStyleOverride(property, fallback = "") {
  const variant = getVariant();
  const override = variant ? getEffectiveVariantOverride(variant, "component:0", property) : null;
  return override ? String(override.value ?? "") : fallback;
}

function getSelectedVariantTargetStyleOverride(property, fallback = "") {
  const variant = getVariant();
  const target = selectedVariantLayerTarget || "component:0";
  const override = variant ? getEffectiveVariantOverride(variant, target, property) : null;
  return override ? String(override.value ?? "") : fallback;
}

function setSelectedVariantStyleOverride(property, value, { render = true, record = true } = {}) {
  const variant = getVariant();
  if (!variant) return false;
  const nextValue = String(value ?? "");
  const existingOverride = (variant.overrides ?? [])
    .find((entry) => entry.target === "component:0" && entry.property === property);
  if (existingOverride?.value === nextValue) return true;
  if (record) recordHistory();
  upsertLocalVariantOverride(variant, "component:0", property, nextValue);
  if (render) renderVariants();
  else syncVariantLayerStylePreviews("component:0", property);
  return true;
}

function setVariantTextOverride(variant, textId, value, { render = true, format = "text" } = {}) {
  const target = `text:${textId}`;
  const property = format === "html" ? "richTextHtml" : "textContent";
  const competingProperty = property === "richTextHtml" ? "textContent" : "richTextHtml";
  const overrides = getLocalVariantOverrides(variant);
  const filteredOverrides = overrides.filter((override) => !(
    override.target === target && override.property === competingProperty
  ));
  const removedCompetingOverride = filteredOverrides.length !== overrides.length;
  if (removedCompetingOverride) variant.overrides = filteredOverrides;
  const { changed } = upsertLocalVariantOverride(variant, target, property, value);
  if (!changed && !removedCompetingOverride) return;
  if (render) renderVariants();
}

function setSelectedVariantLayerOverride(property, value, { render = false } = {}) {
  const variant = getVariant();
  if (!variant || !selectedVariantLayerTarget) return false;
  const nextValue = String(value ?? "");
  const { changed } = upsertLocalVariantOverride(
    variant,
    selectedVariantLayerTarget,
    property,
    nextValue,
  );
  if (!changed) return true;
  if (render) renderVariants();
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
  const variantId = hit.variantId;
  if (!Number.isFinite(variantId) || !getVariant(variantId)) return null;

  if (hit.kind === "variant-layer") {
    return {
      kind: "variant-layer",
      variantId,
      target: `${hit.layer.type}:${hit.layer.id}`,
      element: hit.element,
    };
  }

  return {
    kind: "variant-root",
    variantId,
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
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  if (additive) {
    const selectedIds = getSelectedVariantIds();
    const nextIds = selectedIds.includes(target.variantId)
      ? selectedIds.filter((variantId) => variantId !== target.variantId)
      : [...selectedIds, target.variantId];
    const primaryVariantId = nextIds.includes(target.variantId)
      ? target.variantId
      : nextIds[nextIds.length - 1] ?? null;
    selectVariants(nextIds, primaryVariantId, { render: false });
    return;
  }
  if (isVariantSelected(target.variantId)
    && getSelectedVariantIds().length > 1) {
    clearMasterSelectionForVariant();
    return;
  }
  selectVariant(target.variantId, {
    render: false,
    layerTarget: target.target,
  });
  if (target.kind === "variant-root") renderComponentProps();
});

function selectNewSharedLayerInVariant(variantId, target, { editText = false } = {}) {
  selectVariantState(variantId, target);
  clearMasterSelectionForVariant();
  selectTool("select");
  renderTree();
  if (!editText) return;
  setTimeout(() => {
    requestAnimationFrame(() => {
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-id="${CSS.escape(String(variantId))}"]`);
      const text = preview ? findVariantTarget(preview.querySelector(".canvas-root-stack"), target) : null;
      if (text instanceof HTMLElement) text.dispatchEvent(new Event("canvas-text-create"));
    });
  }, 0);
}

function handleVariantStructureToolClick(variant, parentTarget, event) {
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
    if (record) selectNewSharedLayerInVariant(variant.id, `frame:${record.id}`);
    return true;
  }
  const record = createCanvasText(parentRecord, 0, 0, {
    beginEditing: false,
  });
  if (!record) return true;
  selectNewSharedLayerInVariant(variant.id, `text:${record.id}`, { editText: true });
  return true;
}

function clearMasterSelectionForVariant() {
  clearElementSelection();
}

function syncVariantSelectionUI() {
  const selectedIds = new Set(getSelectedVariantIds());
  document.querySelectorAll(".variant-preview").forEach((preview) => {
    const variantId = Number(preview.dataset.variantId);
    const isSelectedVariant = selectedIds.has(variantId);
    preview.classList.toggle("is-selected", isSelectedVariant);
    preview.setAttribute("aria-selected", String(isSelectedVariant));
    const root = preview.querySelector(".canvas-root-stack");
    if (root instanceof HTMLElement) {
      const isSelectedRoot = isVariantRootSelected(variantId);
      root.classList.toggle("is-selected", isSelectedRoot);
      root.setAttribute("aria-selected", String(isSelectedRoot));
    }
    preview.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((layerElement) => {
      const type = layerElement.classList.contains("canvas-frame")
        ? "frame"
        : layerElement.classList.contains("canvas-text") ? "text" : "vector";
      const id = Number(layerElement.dataset[`${type}Id`]);
      const isSelectedLayer = Number.isFinite(id)
        && isVariantLayerTargetSelected(variantId, `${type}:${id}`);
      layerElement.classList.toggle("is-selected", isSelectedLayer);
      layerElement.setAttribute("aria-selected", String(isSelectedLayer));
    });
  });
  // Variant selection changes the visibility context represented by the tree.
  // Rebuild only the tree so effective visibility and descendant indicators
  // stay current without replacing the canvas previews during pointer gestures.
  renderLayerTree();
  updateInspector();
  syncResizeOverlay();
}

function selectVariants(variantIds, primaryVariantId = null, options = {}) {
  selectVariantsState(variantIds, primaryVariantId);
  clearMasterSelectionForVariant();
  if (options.render !== false) renderTree();
  else syncVariantSelectionUI();
  if (options.updateProps !== false) renderComponentProps();
  requestAnimationFrame(syncResizeOverlay);
  return getSelectedVariantIds().length > 0;
}

function selectVariant(variantId, options = {}) {
  if (!getVariant(variantId)) return false;
  const hasLayerTargets = Object.prototype.hasOwnProperty.call(options, "layerTargets");
  const hasLayerTarget = Object.prototype.hasOwnProperty.call(options, "layerTarget");
  const nextTargets = hasLayerTargets
    ? options.layerTargets
    : hasLayerTarget
      ? options.layerTarget === null ? [] : [options.layerTarget]
      : selectedVariantId === variantId && options.preserveLayerSelection === true
        ? getSelectedVariantLayerTargets()
        : [];
  const nextTarget = hasLayerTargets
    ? options.anchorTarget ?? nextTargets[nextTargets.length - 1] ?? null
    : hasLayerTarget
    ? options.layerTarget
    : selectedVariantId === variantId && options.preserveLayerSelection === true
      ? selectedVariantLayerTarget
      : null;
  if (nextTargets.length > 0) {
    selectVariantLayerTargetsState(variantId, nextTargets, nextTarget);
  } else {
    selectVariantState(variantId, null);
  }
  clearMasterSelectionForVariant();
  if (options.render !== false) renderTree();
  else syncVariantSelectionUI();
  requestAnimationFrame(syncResizeOverlay);
  return true;
}

function getInitialVariantData() {
  return {
    name: "Variant 1",
    componentId: currentComponent.id,
    parentVariantId: null,
    propValues: Object.fromEntries(variantModel.getProps()
      .filter((prop) => prop.type !== "action")
      .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
    overrides: [],
  };
}

function ensureInitialVariant() {
  if (variantModel.getVariants().length === 0) {
    variantModel.addVariant(getInitialVariantData());
  }
}

function captureSelectedVariantCopies() {
  if (!currentComponent || getSelectedVariantLayerTargets().length > 0) return [];
  const ids = new Set(getSelectedVariantIds());
  const variants = variantModel.getVariants().filter((variant) => ids.has(variant.id));
  if (selectedComponentId === currentComponent.id && variantModel.getVariants().length === 0) {
    variants.push(getInitialVariantData());
  }
  return variants.map((variant) => ({
    sourceId: variant.id ?? null,
    name: variant.name,
    parentVariantId: variant.parentVariantId ?? null,
    propValues: structuredClone(variant.propValues ?? {}),
    // Preserve the inheritance boundary. Flattening cascaded values here turns
    // inherited styles into local overrides and disconnects future base edits.
    overrides: structuredClone(variant.overrides ?? []),
  }));
}

function insertVariantCopies(variants) {
  if (!currentComponent || variants.length === 0) return false;
  recordHistory();
  ensureInitialVariant();
  const initialVariantId = getDefaultVariant()?.id ?? null;
  const sourceToCopy = new Map();
  const copies = variants.map((variant) => {
    const { sourceId, ...copyData } = structuredClone(variant);
    const copy = variantModel.addVariant({
      ...copyData,
      name: `${variant.name} copy`,
      componentId: currentComponent.id,
      parentVariantId: variant.parentVariantId ?? null,
    });
    if (sourceId != null) sourceToCopy.set(sourceId, copy.id);
    return copy;
  });
  copies.forEach((copy, index) => {
    if (variants[index].sourceId == null) {
      copy.parentVariantId = initialVariantId;
      return;
    }
    const sourceParentId = variants[index].parentVariantId ?? null;
    copy.parentVariantId = sourceToCopy.get(sourceParentId) ?? sourceParentId;
  });
  selectVariantsState(copies.map((variant) => variant.id));
  clearMasterSelectionForVariant();
  renderTree();
  return true;
}

function addVariant({ render = true } = {}) {
  if (!currentComponent) return null;
  recordHistory();
  ensureInitialVariant();
  const sourceVariant = getVariant() ?? getDefaultVariant();
  const index = variantModel.getVariants().length;
  const variant = variantModel.addVariant({
    name: `Variant ${index + 1}`,
    componentId: currentComponent.id,
    parentVariantId: sourceVariant?.id ?? null,
    propValues: sourceVariant
      ? structuredClone(sourceVariant.propValues ?? {})
      : Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
    overrides: [],
  });
  selectVariantState(variant.id, null);
  clearMasterSelectionForVariant();
  if (render) renderTree();
  return variant;
}

function requestAddVariant(event = null) {
  event?.preventDefault();
  event?.stopPropagation();
  const variant = addVariant({ render: false });
  if (!variant) return false;

  // Render the document and all dependent panels once from the completed state.
  renderTree();
  selectVariant(variant.id, { render: false, preserveLayerSelection: true });
  let preview = componentSet?.querySelector(
    `.variant-preview[data-variant-id="${CSS.escape(String(variant.id))}"]`,
  );
  if (preview instanceof HTMLElement) void preview.getBoundingClientRect();
  syncResizeOverlay();
  if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });

  // Commit again on the next paint even when the preview node already exists.
  // A DOM-count check cannot detect a preview that was created but not laid out.
  requestAnimationFrame(() => {
    if (!getVariant(variant.id)) return;
    renderVariants();
    selectVariant(variant.id, { render: false, preserveLayerSelection: true });
    preview = componentSet?.querySelector(
      `.variant-preview[data-variant-id="${CSS.escape(String(variant.id))}"]`,
    );
    if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });
    syncResizeOverlay();
  });
  return true;
}

function removeVariant(variantId) {
  const index = variantModel.getVariants().findIndex((variant) => variant.id === variantId);
  if (index < 0) return false;
  const variant = variantModel.getVariants()[index];
  if (!canRemoveVariant(variant)) return false;
  recordHistory();
  const removedVariant = variant;
  variantModel.getVariants().forEach((variant) => {
    if (variant.parentVariantId !== removedVariant.id) return;
    const localKeys = new Set((variant.overrides ?? []).map((override) => `${override.target}\u0000${override.property}`));
    const inheritedFromRemoved = (removedVariant.overrides ?? [])
      .filter((override) => !localKeys.has(`${override.target}\u0000${override.property}`))
      .map((override) => structuredClone(override));
    variant.overrides = [...inheritedFromRemoved, ...(variant.overrides ?? [])];
    variant.parentVariantId = removedVariant.parentVariantId ?? null;
  });
  variantModel.replaceVariants(
    variantModel.getVariants().filter((candidate) => candidate.id !== variantId),
  );
  normalizeDefaultVariant();
  const nextVariantId = variantModel.getVariants()[Math.min(index, variantModel.getVariants().length - 1)]?.id ?? null;
  if (nextVariantId == null) selectComponentState(currentComponent?.id);
  else selectVariantState(nextVariantId, null);
  renderTree();
  return true;
}

function removeSelectedVariants() {
  const selectedIds = new Set(getSelectedVariantIds());
  if (selectedIds.size === 0) return false;
  const variants = variantModel.getVariants();
  const removableIds = new Set(variants
    .filter((variant) => selectedIds.has(variant.id) && canRemoveVariant(variant))
    .map((variant) => variant.id));
  if (removableIds.size === 0) return false;

  const originalById = new Map(variants.map((variant) => [variant.id, variant]));
  recordHistory();
  variants.forEach((variant) => {
    if (removableIds.has(variant.id) || !removableIds.has(variant.parentVariantId)) return;
    const removedChain = [];
    const visited = new Set([variant.id]);
    let parent = originalById.get(variant.parentVariantId);
    while (parent && removableIds.has(parent.id) && !visited.has(parent.id)) {
      visited.add(parent.id);
      removedChain.unshift(parent);
      parent = parent.parentVariantId == null ? null : originalById.get(parent.parentVariantId);
    }
    const localKeys = new Set((variant.overrides ?? [])
      .map((override) => `${override.target}\u0000${override.property}`));
    const inherited = new Map();
    removedChain.flatMap((entry) => entry.overrides ?? []).forEach((override) => {
      const key = `${override.target}\u0000${override.property}`;
      if (!localKeys.has(key)) inherited.set(key, structuredClone(override));
    });
    variant.overrides = [...inherited.values(), ...(variant.overrides ?? [])];
    variant.parentVariantId = parent?.id ?? null;
  });

  const firstRemovedIndex = variants.findIndex((variant) => removableIds.has(variant.id));
  variantModel.replaceVariants(variants.filter((variant) => !removableIds.has(variant.id)));
  normalizeDefaultVariant();
  const remaining = variantModel.getVariants();
  const nextVariant = remaining[Math.min(Math.max(firstRemovedIndex, 0), remaining.length - 1)] ?? null;
  if (nextVariant) selectVariantState(nextVariant.id, null);
  else selectComponentState(currentComponent?.id);
  renderTree();
  return true;
}

function cycleSelectedVariant(direction) {
  const variants = variantModel.getVariants();
  if (variants.length === 0 || getSelectedVariantIds().length === 0) return false;
  const currentIndex = variants.findIndex((variant) => variant.id === selectedVariantId);
  const nextIndex = (Math.max(currentIndex, 0) + direction + variants.length) % variants.length;
  selectVariant(variants[nextIndex].id);
  const preview = componentSet?.querySelector(
    `.variant-preview[data-variant-id="${CSS.escape(String(variants[nextIndex].id))}"]`,
  );
  if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });
  return true;
}

function renderVariantSystem() {
  renderVariants();
}

addVariantButton?.addEventListener("click", requestAddVariant);

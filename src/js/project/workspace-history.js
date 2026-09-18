/* Workspace snapshots, restoration, and undo/redo history. */

function captureAuthoredAttributes(element) {
  return Object.fromEntries(["role", "aria-label", "aria-checked", "aria-invalid", "aria-disabled", "disabled"]
    .filter((name) => element.hasAttribute(name))
    .map((name) => [name, element.getAttribute(name)]));
}

function captureWorkspaceState() {
  return {
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    componentId: currentComponent?.id ?? null,
    componentName: currentComponent?.name ?? "Component",
    componentFrame: canvasRootStack instanceof HTMLElement
      ? {
          dataset: getAuthoredLayerDataset(canvasRootStack),
          style: canvasRootStack.getAttribute("style"),
          attributes: captureAuthoredAttributes(canvasRootStack),
        }
      : getDefaultComponentFrameState(),
    layers: layerRecords.map((record) => ({
      id: record.id,
      type: record.type,
      ...(record.type === "component-instance" ? { sourceComponentId: record.sourceComponentId, variantId: record.variantId,
        labelOverrides: structuredClone(record.labelOverrides ?? []), propValues: structuredClone(record.propValues ?? {}),
        presentation: captureInstancePresentation(record), layerOverrides: structuredClone(record.layerOverrides ?? []) } : {}),
      parentId: record.parentId,
      order: record.order,
      dataset: getAuthoredLayerDataset(record.element),
      style: record.element.getAttribute("style"),
      attributes: captureAuthoredAttributes(record.element),
      ...(record.type === "text" ? {
        isNew: record.isNew,
        textContent: record.element.textContent ?? "",
        richTextHtml: record.element.innerHTML,
      } : { name: record.name }),
      ...(record.type === "vector" ? {
        svgSource: record.svgSource,
        originalSvgSource: record.originalSvgSource,
      } : {}),
    })),
    selection: qualifySelectionLayerReferences(captureSelectionState(), currentComponent.id),
    expandedFrameIds: [...expandedFrameIds],
    expandedInstanceTreeKeys: [...expandedInstanceTreeKeys].filter(key => key.startsWith(`${currentComponent?.id}/`)),
    nextFrameId,
    nextTextId,
    nextVectorId,
    nextComponentInstanceId,
    nextLayerOrder,
    componentProps: componentProps.map((prop) => ({
      ...prop,
      ...(Array.isArray(prop.options) ? { options: [...prop.options] } : {}),
    })),
    nextComponentPropId,
    ...variantModel.capture(),
    variantModelVersion: 4,
    canvasColor: canvasColorValue,
    canvasColorOpacity,
    activeTool,
  };
}

function restoreElementState(element, dataset, style) {
  Object.keys(element.dataset).forEach((key) => delete element.dataset[key]);
  Object.entries(dataset).forEach(([key, value]) => {
    element.dataset[key] = value;
  });
  if (style === null) element.removeAttribute("style");
  else element.setAttribute("style", style);
  if (element.matches(".canvas-root-stack, .canvas-frame")) {
    if ("invalid" in element.dataset) element.setAttribute("aria-invalid", element.dataset.invalid);
    else element.removeAttribute("aria-invalid");
  }
}

function getSnapshotArray(snapshot, key) {
  const value = snapshot[key];
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`Workspace snapshot "${key}" must be an array.`);
  return value;
}

function normalizeSnapshotCounter(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? Math.max(number, fallback) : fallback;
}

function normalizeWorkspaceLayers(snapshot) {
  const legacy = snapshot.schemaVersion == null || snapshot.schemaVersion < 2;
  const entries = legacy ? [
    ...getSnapshotArray(snapshot, "frames").map((entry) => ({ ...entry, type: "frame" })),
    ...getSnapshotArray(snapshot, "texts").map((entry) => ({ ...entry, type: "text" })),
    ...getSnapshotArray(snapshot, "vectors").map((entry) => ({ ...entry, type: "vector" })),
  ] : getSnapshotArray(snapshot, "layers");
  const ids = new Set();
  return entries.map((entry, index) => {
    const id = entry?.id ?? entry?.record?.id;
    const type = entry?.type;
    const key = `${type}:${id}`;
    if (!LAYER_TYPES.includes(type) || !Number.isInteger(id) || id < 1 || ids.has(key)) {
      throw new TypeError(`Workspace snapshot "layers[${index}]" has an invalid type or duplicate layer ID.`);
    }
    ids.add(key);
    if (type === "component-instance") {
      requireIdentityId(entry.sourceComponentId, "source component ID");
      if (entry.variantId != null) requireIdentityId(entry.variantId, "variant ID");
    }
    return {
      id,
      type,
      ...(type === "component-instance" ? { sourceComponentId: entry.sourceComponentId, variantId: entry.variantId ?? null,
        labelOverrides: normalizeInstanceLabelOverrides(entry.labelOverrides, entry.sourceComponentId),
        propValues: structuredClone(entry.propValues ?? {}), presentation: structuredClone(entry.presentation ?? { style: {}, dataset: {} }),
        layerOverrides: normalizeInstanceLayerOverrides(entry.layerOverrides, entry.sourceComponentId) } : {}),
      parentId: entry.parentId ?? (legacy ? entry.parentFrameId : null) ?? null,
      order: Number.isFinite(entry.order) ? entry.order : index + 1,
      ...(type !== "text" ? { name: String(entry.name ?? entry.record?.name ?? `${type} ${id}`) } : {
        isNew: entry.isNew === true,
        textContent: String(entry.textContent ?? ""),
        ...(typeof entry.richTextHtml === "string" ? { richTextHtml: entry.richTextHtml } : {}),
      }),
      ...(type === "vector" ? {
        svgSource: String(entry.svgSource ?? entry.record?.svgSource ?? ""),
        originalSvgSource: String(entry.originalSvgSource ?? entry.record?.originalSvgSource ?? entry.svgSource ?? ""),
      } : {}),
      attributes: { ...(entry.attributes ?? (entry.record?.element
        ? captureAuthoredAttributes(entry.record.element) : {})) },
      dataset: entry.dataset && typeof entry.dataset === "object" && !Array.isArray(entry.dataset)
        ? { ...entry.dataset }
        : {},
      style: typeof entry.style === "string" ? entry.style : null,
    };
  });
}

function getNextSnapshotRecordId(entries) {
  return entries.reduce((nextId, entry) => {
    const id = Number(entry.id);
    return Number.isInteger(id) && id >= nextId ? id + 1 : nextId;
  }, 1);
}

function getNextSnapshotEntityId(entries) {
  return entries.reduce((nextId, entry) => {
    const id = Number(entry?.id);
    return Number.isInteger(id) && id >= nextId ? id + 1 : nextId;
  }, 1);
}

function normalizeWorkspaceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("Workspace snapshot must be an object.");
  }
  if (snapshot.schemaVersion != null && ![1, 2, 3, COMPONENT_SCHEMA_VERSION].includes(snapshot.schemaVersion)) {
    throw new TypeError("Unsupported component schema version.");
  }

  // Accept the old variant-instance names only at the snapshot boundary.
  snapshot = { ...snapshot };
  snapshot.variants ??= snapshot.variantInstances;
  snapshot.nextVariantId ??= snapshot.nextVariantInstanceId;
  snapshot.selectedVariantId ??= snapshot.selectedVariantInstanceId;
  delete snapshot.variantInstances;
  delete snapshot.nextVariantInstanceId;
  delete snapshot.selectedVariantInstanceId;
  if (["variant", "variants"].includes(snapshot.selection?.kind)) {
    const selection = { ...snapshot.selection };
    selection.variantId ??= selection.instanceId;
    selection.variantIds ??= selection.instanceIds;
    selection.primaryVariantId ??= selection.primaryInstanceId;
    selection.targetsByVariant ??= selection.targetsByInstance;
    delete selection.instanceId;
    delete selection.instanceIds;
    delete selection.primaryInstanceId;
    delete selection.targetsByInstance;
    snapshot.selection = selection;
  }

  const layers = normalizeWorkspaceLayers(snapshot);
  delete snapshot.frames;
  delete snapshot.texts;
  delete snapshot.vectors;
  const frames = layers.filter((entry) => entry.type === "frame");
  const texts = layers.filter((entry) => entry.type === "text");
  const vectors = layers.filter((entry) => entry.type === "vector");
  const framesById = new Map(frames.map((entry) => [entry.id, entry]));
  layers.forEach((entry) => {
    let parent = entry.parentId;
    const visited = new Set(entry.type === "frame" ? [entry.id] : []);
    while (parent !== null) {
      if (!framesById.has(parent) || visited.has(parent)) throw new TypeError("Invalid layer parent or cyclic layer hierarchy.");
      visited.add(parent);
      parent = framesById.get(parent).parentId;
    }
  });
  const normalizedComponentProps = getSnapshotArray(snapshot, "componentProps").map((prop) => (
    prop.variantSubtype === "state"
      ? { ...prop, options: [...INTERACTION_STATE_OPTIONS], defaultValue: "default" }
      : prop
  ));
  const normalizedVariantProps = getSnapshotArray(snapshot, "variantProps").map((prop) => (
    prop.variantSubtype === "state"
      ? { ...prop, options: [...INTERACTION_STATE_OPTIONS], defaultValue: "default" }
      : prop
  ));
  const interactionAxisIds = new Set(normalizedVariantProps
    .filter((prop) => prop.variantSubtype === "state")
    .map((prop) => String(prop.id)));
  const componentId = snapshot.componentId ?? currentComponent?.id;
  const normalizedVariantRules = getSnapshotArray(snapshot, "variantRules").map((rule) => ({
    ...structuredClone(rule),
    conditions: Object.fromEntries(Object.entries(rule.conditions ?? {}).map(([propId, value]) => [
      propId,
      interactionAxisIds.has(String(propId)) && value === "enabled" ? "default" : value,
    ])),
    target: normalizeLayerIdentity(rule.target, componentId),
  }));
  const normalizedVariants = qualifyVariantLayerReferences(getSnapshotArray(snapshot, "variants"), componentId)
    .map((variant) => ({
      ...variant,
      propValues: Object.fromEntries(Object.entries(variant.propValues ?? {}).map(([propId, value]) => [
        propId,
        interactionAxisIds.has(String(propId)) && value === "enabled" ? "default" : value,
      ])),
    }));
  snapshot.selection = qualifySelectionLayerReferences(snapshot.selection, componentId);
  const defaultComponentFrame = getDefaultComponentFrameState();
  const componentFrame = snapshot.componentFrame && typeof snapshot.componentFrame === "object"
    ? snapshot.componentFrame
    : defaultComponentFrame;
  const componentFrameDataset = componentFrame.dataset
    && typeof componentFrame.dataset === "object"
    && !Array.isArray(componentFrame.dataset)
    ? componentFrame.dataset
    : {};
  const layerEntries = layers;
  const nextLayerOrderFallback = layerEntries.reduce((nextOrder, entry) => {
    const order = Number(entry.order);
    return Number.isFinite(order) && order >= nextOrder ? order + 1 : nextOrder;
  }, 1);
  const canvasOpacity = Number(snapshot.canvasColorOpacity ?? 100);

  return {
    ...snapshot,
    schemaVersion: COMPONENT_SCHEMA_VERSION,
    componentId: snapshot.componentId ?? currentComponent?.id ?? null,
    componentName: typeof snapshot.componentName === "string"
      ? snapshot.componentName
      : currentComponent?.name ?? "Component",
    componentFrame: {
      attributes: { ...(componentFrame.attributes ?? {}) },
      dataset: { ...defaultComponentFrame.dataset, ...componentFrameDataset },
      style: typeof componentFrame.style === "string" || componentFrame.style === null
        ? componentFrame.style
        : defaultComponentFrame.style,
    },
    layers,
    expandedFrameIds: getSnapshotArray(snapshot, "expandedFrameIds"),
    expandedInstanceTreeKeys: getSnapshotArray(snapshot, "expandedInstanceTreeKeys")
      .filter(key => typeof key === "string" && key.startsWith(`${snapshot.componentId ?? currentComponent?.id}/`)),
    nextFrameId: normalizeSnapshotCounter(snapshot.nextFrameId, getNextSnapshotRecordId(frames)),
    nextTextId: normalizeSnapshotCounter(snapshot.nextTextId, getNextSnapshotRecordId(texts)),
    nextVectorId: normalizeSnapshotCounter(snapshot.nextVectorId, getNextSnapshotRecordId(vectors)),
    nextComponentInstanceId: normalizeSnapshotCounter(snapshot.nextComponentInstanceId,
      getNextSnapshotRecordId(layers.filter((entry) => entry.type === "component-instance"))),
    nextLayerOrder: normalizeSnapshotCounter(snapshot.nextLayerOrder, nextLayerOrderFallback),
    componentProps: normalizedComponentProps,
    variantProps: normalizedVariantProps,
    variantRules: normalizedVariantRules,
    variants: normalizedVariants,
    nextComponentPropId: normalizeSnapshotCounter(
      snapshot.nextComponentPropId,
      getNextSnapshotEntityId(normalizedComponentProps),
    ),
    nextVariantPropId: normalizeSnapshotCounter(
      snapshot.nextVariantPropId,
      getNextSnapshotEntityId(normalizedVariantProps),
    ),
    nextVariantRuleId: normalizeSnapshotCounter(
      snapshot.nextVariantRuleId,
      getNextSnapshotEntityId(normalizedVariantRules),
    ),
    nextVariantId: normalizeSnapshotCounter(
      snapshot.nextVariantId,
      getNextSnapshotEntityId(normalizedVariants),
    ),
    canvasColor: typeof snapshot.canvasColor === "string" ? snapshot.canvasColor : "#121619",
    canvasColorOpacity: Number.isFinite(canvasOpacity) ? Math.max(0, Math.min(100, canvasOpacity)) : 100,
    activeTool: typeof snapshot.activeTool === "string" ? snapshot.activeTool : "select",
  };
}

function attachRestoredLayers(parentId, parentElement) {
  getLayerChildren(parentId).forEach((layer) => {
    if (parentId === null && canvasRootStack instanceof HTMLElement) {
      canvasRootStack.append(layer.record.element);
    } else parentElement.append(layer.record.element);
    if (layer.type === "frame") attachRestoredLayers(layer.record.id, layer.record.element);
  });
}

function applyWorkspaceSnapshot(snapshot, views) {
  const allElements = new Set([
    ...layerRecords.map((record) => record.element),
  ]);
  allElements.forEach((element) => element.remove());

  if (canvasRootStack instanceof HTMLElement) {
    if (currentComponent && typeof snapshot.componentName === "string") {
      const previousName = currentComponent.name;
      currentComponent.name = snapshot.componentName;
      currentComponent.frameRecord.name = snapshot.componentName;
      if (previousName !== currentComponent.name) renameComponentInstances(currentComponent.id, currentComponent.name);
    }
    const componentFrameState = snapshot.componentFrame ?? getDefaultComponentFrameState();
    restoreElementState(canvasRootStack, componentFrameState.dataset, componentFrameState.style);
    setRenderedLayerScope(canvasRootStack, snapshot.componentId);
    applyAuthoredAttributes(canvasRootStack, componentFrameState.attributes);
    canvasRootStack.style.removeProperty("outline");
    syncLayerVisibility(canvasRootStack);
    canvasRootStack.setAttribute("aria-label", currentComponent?.name || "Component");
    canvasRootStack.setAttribute("aria-selected", "false");
  }

  layerRecords = views;

  nextFrameId = snapshot.nextFrameId;
  nextTextId = snapshot.nextTextId;
  nextVectorId = snapshot.nextVectorId ?? 1;
  nextComponentInstanceId = snapshot.nextComponentInstanceId ?? 1;
  nextLayerOrder = snapshot.nextLayerOrder;
  componentProps = (snapshot.componentProps ?? []).map((prop) => {
    const normalizedProp = {
      ...prop,
      ...(Array.isArray(prop.options) ? { options: [...prop.options] } : {}),
    };
    const legacyEnumType = normalizedProp.type;
    if (["size", "variant", "shape"].includes(legacyEnumType)) {
      normalizedProp.name = normalizedProp.name || normalizedProp.type;
      normalizedProp.type = "enum";
      normalizedProp.property = "custom";
    }
    if (normalizedProp.type === "enum") {
      const isState = normalizedProp.variantSubtype === "state";
      const isFocus = normalizedProp.variantSubtype === "focus";
      const options = isState
        ? [...INTERACTION_STATE_OPTIONS]
        : isFocus
          ? [...FOCUS_STATE_OPTIONS]
          : Array.isArray(normalizedProp.options) && normalizedProp.options.length > 0
            ? normalizedProp.options
            : ["default"];
      normalizedProp.options = options;
      normalizedProp.defaultValue = options[0];
      const enumProperties = ["custom", "state", "focus"];
      const savedProperty = String(normalizedProp.property ?? "").toLowerCase();
      const namedProperty = String(normalizedProp.name ?? "").trim().toLowerCase();
      const migratedProperty = ["size", "kind", "type", "variant"].includes(savedProperty)
        ? "custom"
        : savedProperty;
      const migratedNamedProperty = ["size", "kind", "type", "variant"].includes(namedProperty)
        ? "custom"
        : namedProperty;
      normalizedProp.property = isState
        ? "state"
        : isFocus
          ? "focus"
          : enumProperties.includes(migratedProperty)
            ? migratedProperty
            : enumProperties.includes(migratedNamedProperty) ? migratedNamedProperty : "custom";
    } else if (normalizedProp.type === "boolean") {
      normalizedProp.defaultValue = normalizedProp.defaultValue === true || normalizedProp.defaultValue === "true";
    }
    return normalizedProp;
  });
  nextComponentPropId = snapshot.nextComponentPropId ?? 1;
  variantModel.restore(snapshot);
  if (variantModel.getVariants().length > 0 && (snapshot.variantModelVersion ?? 0) < 2) {
    variantModel.addVariant({
      name: "Variant 1",
      componentId: currentComponent?.id ?? snapshot.componentId,
      parentVariantId: null,
      propValues: Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
      overrides: [],
    }, { prepend: true });
  }
  normalizeDefaultVariant();
  expandedFrameIds.clear();
  snapshot.expandedFrameIds.forEach((frameId) => expandedFrameIds.add(frameId));
  for (const key of expandedInstanceTreeKeys) {
    if (key.startsWith(`${snapshot.componentId}/`)) expandedInstanceTreeKeys.delete(key);
  }
  snapshot.expandedInstanceTreeKeys.forEach(key => expandedInstanceTreeKeys.add(key));
  restoreSelectionState(snapshot);

  attachRestoredLayers(null, canvas);
  if (layerRecords.some(record => record.type === "component-instance")) applyAllLayerSizing();
  syncElementSelectionStyles();
  canvasColorValue = snapshot.canvasColor ?? "#121619";
  canvasColorOpacity = Math.max(0, Math.min(100, Number(snapshot.canvasColorOpacity ?? 100)));
  canvas.style.backgroundColor = canvasColorValue ? getColorWithOpacity(canvasColorValue, canvasColorOpacity) : "transparent";
  if (colorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
  }
  selectTool(snapshot.activeTool);
}

function restoreWorkspaceState(snapshot, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;

  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  validateComponentDependencies(normalizedSnapshot);
  const views = createWorkspaceLayerViews(normalizedSnapshot, { interactive: true });
  const previousRestoringHistory = isRestoringHistory;
  isRestoringHistory = true;
  try {
    applyWorkspaceSnapshot(normalizedSnapshot, views);
  } finally {
    isRestoringHistory = previousRestoringHistory;
  }
  commitCanvasComponentData();
  if (options.render !== false) renderTree();
}

function recordHistory() {
  if (isRestoringHistory || isBatchingHistory) return false;
  undoHistory.push(captureWorkspaceState());
  if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
  redoHistory.length = 0;
  return true;
}

let recordedHistoryGestureOwners = new WeakSet();

function beginHistoryGesture(owner) {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  recordedHistoryGestureOwners.delete(owner);
}

function recordHistoryForGesture(owner) {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) {
    recordHistory();
    return;
  }
  if (recordedHistoryGestureOwners.has(owner)) return;
  if (recordHistory()) recordedHistoryGestureOwners.add(owner);
}

function endHistoryGesture(owner) {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  recordedHistoryGestureOwners.delete(owner);
}

function bindHistoryGesture(owner) {
  if (!(owner instanceof HTMLElement)) return;
  owner.addEventListener("focus", () => beginHistoryGesture(owner));
  owner.addEventListener("blur", () => {
    queueMicrotask(() => endHistoryGesture(owner));
  });
  owner.addEventListener("keydown", (event) => {
    if (event.key === "Enter") queueMicrotask(() => endHistoryGesture(owner));
  });
  owner.addEventListener("keyup", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") endHistoryGesture(owner);
  });
}

function undoWorkspaceChange() {
  const snapshot = undoHistory.pop();
  if (!snapshot) return;
  recordedHistoryGestureOwners = new WeakSet();
  if (isComponentDeletionHistoryEntry(snapshot)) {
    if (!restoreComponentDeletion(snapshot)) undoHistory.push(snapshot);
    return;
  }
  redoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

function redoWorkspaceChange() {
  const snapshot = redoHistory.pop();
  if (!snapshot) return;
  recordedHistoryGestureOwners = new WeakSet();
  if (isComponentDeletionHistoryEntry(snapshot)) {
    if (!replayComponentDeletion(snapshot)) redoHistory.push(snapshot);
    return;
  }
  undoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

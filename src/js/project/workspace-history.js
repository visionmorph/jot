/* Workspace snapshots, restoration, and undo/redo history. */

function captureWorkspaceState() {
  return {
    componentId: currentComponent?.id ?? null,
    componentName: currentComponent?.name ?? "Component",
    componentFrame: canvasRootStack instanceof HTMLElement
      ? {
          dataset: { ...canvasRootStack.dataset },
          style: canvasRootStack.getAttribute("style"),
        }
      : getDefaultComponentFrameState(),
    frames: frameRecords.map((record) => ({
      record,
      name: record.name,
      parentId: record.parentId,
      order: record.order,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
    })),
    texts: textRecords.map((record) => ({
      record,
      name: record.name,
      parentFrameId: record.parentFrameId,
      order: record.order,
      isNew: record.isNew,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
      textContent: record.element.textContent ?? "",
      contentEditable: record.element.contentEditable,
    })),
    vectors: vectorRecords.map((record) => ({
      record,
      parentFrameId: record.parentFrameId,
      order: record.order,
      name: record.name,
      svgSource: record.svgSource,
      originalSvgSource: record.originalSvgSource,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
    })),
    selection: captureSelectionState(),
    expandedFrameIds: [...expandedFrameIds],
    nextFrameId,
    nextTextId,
    nextVectorId,
    nextLayerOrder,
    componentProps: componentProps.map((prop) => ({
      ...prop,
      ...(Array.isArray(prop.options) ? { options: [...prop.options] } : {}),
    })),
    nextComponentPropId,
    ...variantModel.capture(),
    variantModelVersion: 3,
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

function normalizeWorkspaceLayerEntries(snapshot, key) {
  return getSnapshotArray(snapshot, key).map((entry, index) => {
    if (!entry || typeof entry !== "object" || !entry.record || typeof entry.record !== "object") {
      throw new TypeError(`Workspace snapshot "${key}[${index}]" is missing its layer record.`);
    }
    if (!(entry.record.element instanceof HTMLElement)) {
      throw new TypeError(`Workspace snapshot "${key}[${index}]" is missing its layer element.`);
    }
    return {
      ...entry,
      dataset: entry.dataset && typeof entry.dataset === "object" && !Array.isArray(entry.dataset)
        ? { ...entry.dataset }
        : {},
      style: typeof entry.style === "string" ? entry.style : null,
    };
  });
}

function getNextSnapshotRecordId(entries) {
  return entries.reduce((nextId, entry) => {
    const id = Number(entry.record.id);
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

  const frames = normalizeWorkspaceLayerEntries(snapshot, "frames");
  const texts = normalizeWorkspaceLayerEntries(snapshot, "texts");
  const vectors = normalizeWorkspaceLayerEntries(snapshot, "vectors").map((entry) => ({
    ...entry,
    svgSource: String(entry.svgSource ?? entry.record.svgSource ?? ""),
  }));
  const normalizedComponentProps = getSnapshotArray(snapshot, "componentProps");
  const normalizedVariantProps = getSnapshotArray(snapshot, "variantProps");
  const normalizedVariantRules = getSnapshotArray(snapshot, "variantRules");
  const normalizedVariantInstances = getSnapshotArray(snapshot, "variantInstances");
  const defaultComponentFrame = getDefaultComponentFrameState();
  const componentFrame = snapshot.componentFrame && typeof snapshot.componentFrame === "object"
    ? snapshot.componentFrame
    : defaultComponentFrame;
  const componentFrameDataset = componentFrame.dataset
    && typeof componentFrame.dataset === "object"
    && !Array.isArray(componentFrame.dataset)
    ? componentFrame.dataset
    : {};
  const layerEntries = [...frames, ...texts, ...vectors];
  const nextLayerOrderFallback = layerEntries.reduce((nextOrder, entry) => {
    const order = Number(entry.order);
    return Number.isFinite(order) && order >= nextOrder ? order + 1 : nextOrder;
  }, 1);
  const canvasOpacity = Number(snapshot.canvasColorOpacity ?? 100);

  return {
    ...snapshot,
    componentId: snapshot.componentId ?? currentComponent?.id ?? null,
    componentName: typeof snapshot.componentName === "string"
      ? snapshot.componentName
      : currentComponent?.name ?? "Component",
    componentFrame: {
      dataset: { ...defaultComponentFrame.dataset, ...componentFrameDataset },
      style: typeof componentFrame.style === "string" || componentFrame.style === null
        ? componentFrame.style
        : defaultComponentFrame.style,
    },
    frames,
    texts,
    vectors,
    expandedFrameIds: getSnapshotArray(snapshot, "expandedFrameIds"),
    nextFrameId: normalizeSnapshotCounter(snapshot.nextFrameId, getNextSnapshotRecordId(frames)),
    nextTextId: normalizeSnapshotCounter(snapshot.nextTextId, getNextSnapshotRecordId(texts)),
    nextVectorId: normalizeSnapshotCounter(snapshot.nextVectorId, getNextSnapshotRecordId(vectors)),
    nextLayerOrder: normalizeSnapshotCounter(snapshot.nextLayerOrder, nextLayerOrderFallback),
    componentProps: normalizedComponentProps,
    variantProps: normalizedVariantProps,
    variantRules: normalizedVariantRules,
    variantInstances: normalizedVariantInstances,
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
    nextVariantInstanceId: normalizeSnapshotCounter(
      snapshot.nextVariantInstanceId,
      getNextSnapshotEntityId(normalizedVariantInstances),
    ),
    canvasColor: typeof snapshot.canvasColor === "string" ? snapshot.canvasColor : "#121619",
    canvasColorOpacity: Number.isFinite(canvasOpacity) ? Math.max(0, Math.min(100, canvasOpacity)) : 100,
    activeTool: typeof snapshot.activeTool === "string" ? snapshot.activeTool : "select",
  };
}

function attachRestoredLayers(parentFrameId, parentElement) {
  getLayerChildren(parentFrameId).forEach((layer) => {
    if (parentFrameId === null && canvasRootStack instanceof HTMLElement) {
      canvasRootStack.append(layer.record.element);
    } else parentElement.append(layer.record.element);
    if (layer.type === "frame") attachRestoredLayers(layer.record.id, layer.record.element);
  });
}

function applyWorkspaceSnapshot(snapshot, preparedVectorSvgs) {
  const allElements = new Set([
    ...frameRecords.map((record) => record.element),
    ...textRecords.map((record) => record.element),
    ...vectorRecords.map((record) => record.element),
    ...snapshot.frames.map((entry) => entry.record.element),
    ...snapshot.texts.map((entry) => entry.record.element),
    ...(snapshot.vectors ?? []).map((entry) => entry.record.element),
  ]);
  allElements.forEach((element) => element.remove());

  if (canvasRootStack instanceof HTMLElement) {
    if (currentComponent && typeof snapshot.componentName === "string") {
      currentComponent.name = snapshot.componentName;
      currentComponent.frameRecord.name = snapshot.componentName;
    }
    const componentFrameState = snapshot.componentFrame ?? getDefaultComponentFrameState();
    restoreElementState(canvasRootStack, componentFrameState.dataset, componentFrameState.style);
    canvasRootStack.style.removeProperty("outline");
    syncLayerVisibility(canvasRootStack);
    canvasRootStack.setAttribute("aria-label", currentComponent?.name || "Component");
    canvasRootStack.setAttribute("aria-selected", "false");
  }

  frameRecords = snapshot.frames.map((entry) => {
    entry.record.name = entry.name ?? `Frame ${entry.record.id}`;
    entry.record.parentId = entry.parentId;
    entry.record.order = entry.order;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    syncLayerVisibility(entry.record.element);
    return entry.record;
  });
  textRecords = snapshot.texts.map((entry) => {
    entry.record.name = entry.name;
    entry.record.parentFrameId = entry.parentFrameId;
    entry.record.order = entry.order;
    entry.record.isNew = entry.isNew;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    syncLayerVisibility(entry.record.element);
    entry.record.element.textContent = entry.textContent;
    entry.record.element.contentEditable = entry.contentEditable;
    return entry.record;
  });
  vectorRecords = snapshot.vectors.map((entry, index) => {
    entry.record.parentFrameId = entry.parentFrameId;
    entry.record.order = entry.order;
    entry.record.name = entry.name;
    entry.record.svgSource = entry.svgSource;
    entry.record.originalSvgSource = entry.originalSvgSource ?? entry.record.originalSvgSource ?? entry.svgSource;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    syncLayerVisibility(entry.record.element);
    entry.record.element.replaceChildren(preparedVectorSvgs[index]);
    return entry.record;
  });

  nextFrameId = snapshot.nextFrameId;
  nextTextId = snapshot.nextTextId;
  nextVectorId = snapshot.nextVectorId ?? 1;
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
      normalizedProp.property = legacyEnumType === "size"
        ? "size"
        : "kind";
    }
    if (normalizedProp.type === "enum") {
      const isState = normalizedProp.variantSubtype === "state";
      const options = isState
        ? ["enabled", "hover", "active", "focus-visible"]
        : Array.isArray(normalizedProp.options) && normalizedProp.options.length > 0
        ? normalizedProp.options
        : ["default"];
      normalizedProp.options = options;
      normalizedProp.defaultValue = options[0];
      const enumProperties = ["size", "kind", "state"];
      const savedProperty = String(normalizedProp.property ?? "").toLowerCase();
      const namedProperty = String(normalizedProp.name ?? "").trim().toLowerCase();
      const migratedProperty = savedProperty === "type" || savedProperty === "variant"
        ? "kind"
        : savedProperty;
      const migratedNamedProperty = namedProperty === "type" || namedProperty === "variant"
        ? "kind"
        : namedProperty;
      normalizedProp.property = isState
        ? "state"
        : enumProperties.includes(migratedProperty)
          ? migratedProperty
          : enumProperties.includes(migratedNamedProperty) ? migratedNamedProperty : "kind";
    } else if (normalizedProp.type === "boolean") {
      normalizedProp.defaultValue = normalizedProp.defaultValue === true || normalizedProp.defaultValue === "true";
    }
    return normalizedProp;
  });
  nextComponentPropId = snapshot.nextComponentPropId ?? 1;
  variantModel.restore(snapshot);
  if (variantModel.getInstances().length > 0 && (snapshot.variantModelVersion ?? 0) < 2) {
    variantModel.addInstance({
      name: "Variant 1",
      componentId: currentComponent?.id ?? snapshot.componentId,
      parentVariantId: null,
      propValues: Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
      overrides: [],
    }, { prepend: true });
  }
  normalizeDefaultVariantInstance();
  expandedFrameIds.clear();
  snapshot.expandedFrameIds.forEach((frameId) => expandedFrameIds.add(frameId));
  restoreSelectionState(snapshot);

  attachRestoredLayers(null, canvas);
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
  const preparedVectorSvgs = normalizedSnapshot.vectors.map((entry) => createCanvasSvg(entry.svgSource));
  const previousRestoringHistory = isRestoringHistory;
  isRestoringHistory = true;
  try {
    applyWorkspaceSnapshot(normalizedSnapshot, preparedVectorSvgs);
  } finally {
    isRestoringHistory = previousRestoringHistory;
  }
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
  redoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

function redoWorkspaceChange() {
  const snapshot = redoHistory.pop();
  if (!snapshot) return;
  recordedHistoryGestureOwners = new WeakSet();
  undoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

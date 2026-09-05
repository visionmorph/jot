/* Shared component, layer, and variant selection model. */

function getLayerKey(type, id) {
  return `${type}:${id}`;
}

function getElementForLayerKey(key) {
  const [type, rawId] = key.split(":");
  const id = Number(rawId);
  if (type === "frame") return getFrameRecord(id)?.element ?? null;
  if (type === "text") return getTextRecord(id)?.element ?? null;
  if (type === "vector") return getVectorRecord(id)?.element ?? null;
  return null;
}

function getLayerParentKey(key) {
  const [type, rawId] = String(key).split(":");
  const id = Number(rawId);
  const record = type === "frame" ? getFrameRecord(id) : type === "text" ? getTextRecord(id) : getVectorRecord(id);
  if (!record || record.isComponent) return null;
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  return parentId === null ? "component:0" : `frame:${parentId}`;
}

function getLayerDepth(key) {
  let parentKey = getLayerParentKey(key);
  let depth = 0;
  while (parentKey?.startsWith("frame:")) {
    depth += 1;
    parentKey = getLayerParentKey(parentKey);
  }
  return depth;
}

function getShallowestPrimaryLayerKey(keys) {
  if (keys.length === 0) return null;
  const minimumDepth = Math.min(...keys.map(getLayerDepth));
  return [...keys].reverse().find((key) => getLayerDepth(key) === minimumDepth) ?? keys[keys.length - 1];
}

function normalizeLayerSelection(keys, primaryKey = null) {
  const uniqueKeys = [...new Set(keys)].filter((key) => getElementForLayerKey(key) instanceof HTMLElement);
  const resolvedPrimary = uniqueKeys.includes(primaryKey) ? primaryKey : uniqueKeys[uniqueKeys.length - 1] ?? null;
  if (!resolvedPrimary) return { keys: [], primaryKey: null };
  const parentKey = getLayerParentKey(resolvedPrimary);
  const peerKeys = uniqueKeys.filter((key) => getLayerParentKey(key) === parentKey);
  return {
    keys: peerKeys,
    primaryKey: peerKeys.includes(resolvedPrimary) ? resolvedPrimary : peerKeys[peerKeys.length - 1] ?? null,
  };
}

function selectCanvasState() {
  selectionState = { kind: "canvas" };
}

function selectComponentState(componentId = currentComponent?.id) {
  if (componentId == null) return false;
  selectionState = { kind: "component", componentId };
  return true;
}

function selectVariantState(instanceId, target = null, componentId = currentComponent?.id) {
  if (instanceId == null || componentId == null) return false;
  const normalizedTarget = target === null || getElementForLayerKey(target) instanceof HTMLElement ? target : null;
  selectionState = {
    kind: "variant",
    componentId,
    instanceId,
    targets: normalizedTarget === null ? [] : [normalizedTarget],
    anchorTarget: normalizedTarget,
    target: normalizedTarget,
  };
  return true;
}

function selectVariantLayerTargetsState(
  instanceId,
  targets,
  anchorTarget = null,
  componentId = currentComponent?.id,
) {
  if (instanceId == null || componentId == null || !getVariantInstance(instanceId)) return false;
  const normalized = normalizeLayerSelection(targets, anchorTarget);
  if (normalized.keys.length === 0) {
    selectCanvasState();
    return false;
  }
  selectionState = {
    kind: "variant",
    componentId,
    instanceId,
    targets: normalized.keys,
    anchorTarget: normalized.primaryKey,
    // Keep the singular field for inspectors and older snapshots. It is an
    // internal anchor only; selection and movement use the complete target set.
    target: normalized.primaryKey,
  };
  return true;
}

function selectVariantLayerTarget(instanceId, target, additive = false, componentId = currentComponent?.id) {
  const currentTargets = selectionState.kind === "variant" && selectionState.instanceId === instanceId
    ? getSelectedVariantLayerTargets()
    : [];
  if (!additive) return selectVariantLayerTargetsState(instanceId, [target], target, componentId);
  const nextTargets = [...currentTargets];
  const existingIndex = nextTargets.indexOf(target);
  if (existingIndex >= 0) {
    nextTargets.splice(existingIndex, 1);
    return selectVariantLayerTargetsState(
      instanceId,
      nextTargets,
      nextTargets[nextTargets.length - 1] ?? null,
      componentId,
    );
  }
  return selectVariantLayerTargetsState(instanceId, [...nextTargets, target], target, componentId);
}

function getSelectedVariantLayerTargets() {
  if (selectionState.kind === "variants") return selectionState.targets ?? [];
  if (selectionState.kind !== "variant") return [];
  if (Array.isArray(selectionState.targets)) return selectionState.targets;
  return selectionState.target === null ? [] : [selectionState.target];
}

function isVariantLayerTargetSelected(instanceId, target) {
  return isVariantInstanceSelected(instanceId)
    && getSelectedVariantLayerTargets().includes(target);
}

function selectVariantInstancesLayerTargetsState(instanceIds, targets, primaryInstanceId = null, componentId = currentComponent?.id) {
  const keys = [...new Set(targets)].filter((key) => getElementForLayerKey(key) instanceof HTMLElement);
  const normalized = { keys, primaryKey: getShallowestPrimaryLayerKey(keys) };
  if (!selectVariantInstancesState(instanceIds, primaryInstanceId, componentId)) return false;
  selectionState = {
    ...selectionState,
    targets: normalized.keys,
    anchorTarget: normalized.primaryKey,
    target: normalized.primaryKey,
  };
  return true;
}

function getSelectedVariantInstanceIds() {
  if (selectionState.kind === "variants") return [...selectionState.instanceIds];
  if (selectionState.kind === "variant") return [selectionState.instanceId];
  return [];
}

function isVariantInstanceSelected(instanceId) {
  return getSelectedVariantInstanceIds().includes(instanceId);
}

function selectVariantInstancesState(instanceIds, primaryInstanceId = null, componentId = currentComponent?.id) {
  if (componentId == null) return false;
  const validIds = new Set(variantModel.getInstances().map((instance) => instance.id));
  const normalizedIds = [...new Set(instanceIds)].filter((instanceId) => validIds.has(instanceId));
  if (normalizedIds.length === 0) {
    selectCanvasState();
    return false;
  }
  const resolvedPrimary = normalizedIds.includes(primaryInstanceId)
    ? primaryInstanceId
    : normalizedIds[normalizedIds.length - 1];
  if (normalizedIds.length === 1) return selectVariantState(normalizedIds[0], null, componentId);
  selectionState = {
    kind: "variants",
    componentId,
    instanceIds: normalizedIds,
    primaryInstanceId: resolvedPrimary,
  };
  return true;
}

function selectLayerKeys(keys, primaryKey = null, componentId = currentComponent?.id) {
  if (componentId == null) return false;
  const normalized = normalizeLayerSelection(keys, primaryKey);
  if (normalized.keys.length === 0) {
    selectCanvasState();
    return false;
  }
  selectionState = {
    kind: "layers",
    componentId,
    keys: normalized.keys,
    primaryKey: normalized.primaryKey,
  };
  return true;
}

function selectLayerKey(key, additive = false) {
  const currentKeys = selectionState.kind === "layers" ? selectionState.keys : [];
  if (!additive) return selectLayerKeys([key], key);
  const nextKeys = [...currentKeys];
  const existingIndex = nextKeys.indexOf(key);
  if (existingIndex >= 0) {
    nextKeys.splice(existingIndex, 1);
    return selectLayerKeys(nextKeys, nextKeys[nextKeys.length - 1] ?? null);
  }
  return selectLayerKeys([...nextKeys, key], key);
}

function removeLayerKeyFromSelection(key) {
  if (selectionState.kind !== "layers" || !selectionState.keys.includes(key)) return false;
  const nextKeys = selectionState.keys.filter((candidate) => candidate !== key);
  return selectLayerKeys(nextKeys, nextKeys[nextKeys.length - 1] ?? null);
}

function getSelectedLayerKeys() {
  return selectionState.kind === "layers" ? selectionState.keys : [];
}

function getPrimarySelectedLayerKey() {
  return selectionState.kind === "layers" ? selectionState.primaryKey : null;
}

function captureSelectionState() {
  if (selectionState.kind === "layers") {
    return { ...selectionState, keys: [...selectionState.keys] };
  }
  if (selectionState.kind === "variant") {
    return { ...selectionState, targets: [...getSelectedVariantLayerTargets()] };
  }
  if (selectionState.kind === "variants") {
    return { ...selectionState, instanceIds: [...selectionState.instanceIds], targets: [...getSelectedVariantLayerTargets()] };
  }
  return { ...selectionState };
}

function restoreSelectionState(snapshot) {
  const savedSelection = snapshot.selection;
  if (savedSelection?.kind === "component" && savedSelection.componentId === currentComponent?.id) {
    selectComponentState(savedSelection.componentId);
    return;
  }
  if (savedSelection?.kind === "variant"
    && savedSelection.componentId === currentComponent?.id
    && getVariantInstance(savedSelection.instanceId)) {
    const savedTargets = Array.isArray(savedSelection.targets)
      ? savedSelection.targets
      : savedSelection.target == null ? [] : [savedSelection.target];
    if (savedTargets.length > 0) {
      selectVariantLayerTargetsState(
        savedSelection.instanceId,
        savedTargets,
        savedSelection.anchorTarget ?? savedSelection.target ?? null,
        savedSelection.componentId,
      );
    } else {
      selectVariantState(savedSelection.instanceId, null, savedSelection.componentId);
    }
    return;
  }
  if (savedSelection?.kind === "variants" && savedSelection.componentId === currentComponent?.id) {
    if (selectVariantInstancesLayerTargetsState(
      savedSelection.instanceIds ?? [],
      savedSelection.targets ?? [],
      savedSelection.primaryInstanceId ?? null,
      savedSelection.componentId,
    )) return;
  }
  if (savedSelection?.kind === "layers" && savedSelection.componentId === currentComponent?.id) {
    if (selectLayerKeys(savedSelection.keys ?? [], savedSelection.primaryKey ?? null, savedSelection.componentId)) return;
  }

  // Migrate snapshots created before selection became a single state object.
  if (snapshot.selectedVariantInstanceId != null && getVariantInstance(snapshot.selectedVariantInstanceId)) {
    selectVariantState(snapshot.selectedVariantInstanceId, snapshot.selectedVariantLayerTarget ?? null);
    return;
  }
  const legacyKeys = [...(snapshot.selectedLayerKeys ?? [])];
  if (legacyKeys.length === 0) {
    const legacyElementEntries = [
      ["frame", snapshot.selectedCanvasFrame],
      ["text", snapshot.selectedCanvasText],
      ["vector", snapshot.selectedCanvasVector],
    ];
    legacyElementEntries.forEach(([type, element]) => {
      const records = type === "frame" ? frameRecords : type === "text" ? textRecords : vectorRecords;
      const record = records.find((candidate) => candidate.element === element);
      if (record) legacyKeys.push(getLayerKey(type, record.id));
    });
  }
  if (selectLayerKeys(legacyKeys, legacyKeys[legacyKeys.length - 1] ?? null)) return;
  if (snapshot.selectedComponentId === currentComponent?.id) {
    selectComponentState(snapshot.selectedComponentId);
    return;
  }
  selectCanvasState();
}

const selectedLayerKeys = Object.freeze({
  get size() { return getSelectedLayerKeys().length; },
  has(key) { return getSelectedLayerKeys().includes(key); },
  forEach(callback, thisArg) {
    getSelectedLayerKeys().forEach((key) => callback.call(thisArg, key, key, selectedLayerKeys));
  },
  [Symbol.iterator]() { return getSelectedLayerKeys()[Symbol.iterator](); },
});

const selectedVariantLayerTargets = Object.freeze({
  get size() { return getSelectedVariantLayerTargets().length; },
  has(target) { return getSelectedVariantLayerTargets().includes(target); },
  forEach(callback, thisArg) {
    getSelectedVariantLayerTargets().forEach(
      (target) => callback.call(thisArg, target, target, selectedVariantLayerTargets),
    );
  },
  [Symbol.iterator]() { return getSelectedVariantLayerTargets()[Symbol.iterator](); },
});

function getPrimarySelectedElement(type) {
  const key = getPrimarySelectedLayerKey();
  return key?.startsWith(`${type}:`) ? getElementForLayerKey(key) : null;
}

Object.defineProperties(globalThis, {
  selectedComponentId: {
    configurable: true,
    get: () => selectionState.kind === "component" ? selectionState.componentId : null,
  },
  selectedVariantInstanceId: {
    configurable: true,
    get: () => selectionState.kind === "variant"
      ? selectionState.instanceId
      : selectionState.kind === "variants" ? selectionState.primaryInstanceId : null,
  },
  selectedVariantLayerTarget: {
    configurable: true,
    get: () => ["variant", "variants"].includes(selectionState.kind) ? selectionState.target ?? null : null,
  },
  selectedVariantInstanceIds: {
    configurable: true,
    get: () => getSelectedVariantInstanceIds(),
  },
  selectedCanvasFrame: {
    configurable: true,
    get: () => getPrimarySelectedElement("frame"),
  },
  selectedCanvasText: {
    configurable: true,
    get: () => getPrimarySelectedElement("text"),
  },
  selectedCanvasVector: {
    configurable: true,
    get: () => getPrimarySelectedElement("vector"),
  },
});

function isLayerSelected(type, id) {
  return selectedLayerKeys.has(getLayerKey(type, id));
}

function setPrimarySelectionFromKey(key) {
  selectLayerKeys(getSelectedLayerKeys(), key);
}

function setPrimarySelectionToLatest() {
  const keys = getSelectedLayerKeys();
  setPrimarySelectionFromKey(keys[keys.length - 1]);
}

/* Shared component, layer, and variant selection model. */

function getLayerKey(type, id) {
  return `${type}:${id}`;
}

function getElementForLayerKey(key) {
  const localKey = toLocalLayerKey(key, currentComponent?.id);
  if (!localKey) return null;
  const [type, rawId] = localKey.split(":");
  const id = Number(rawId);
  return getLayerRecord({ type, id })?.element ?? null;
}

function getLayerParentKey(key) {
  const localKey = toLocalLayerKey(key, currentComponent?.id);
  if (!localKey) return null;
  const [type, rawId] = localKey.split(":");
  const id = Number(rawId);
  const record = getLayerRecord({ type, id });
  if (!record || record.isComponent) return null;
  const parentId = record.parentId;
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
  keys = keys.map((key) => toLocalLayerKey(key, currentComponent?.id)).filter(Boolean);
  primaryKey = primaryKey == null ? null : toLocalLayerKey(primaryKey, currentComponent?.id);
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

function selectVariantState(variantId, target = null, componentId = currentComponent?.id) {
  if (variantId == null || componentId !== currentComponent?.id) return false;
  if (target != null) {
    target = toLocalLayerKey(target, componentId);
    if (!target) return false;
  }
  const normalizedTarget = target === null || getElementForLayerKey(target) instanceof HTMLElement ? target : null;
  selectionState = {
    kind: "variant",
    componentId,
    variantId,
    targets: normalizedTarget === null ? [] : [normalizedTarget],
    anchorTarget: normalizedTarget,
    target: normalizedTarget,
  };
  return true;
}

function selectVariantLayerTargetsState(
  variantId,
  targets,
  anchorTarget = null,
  componentId = currentComponent?.id,
) {
  if (variantId == null || componentId !== currentComponent?.id || !getVariant(variantId)) return false;
  if (targets.some((target) => !toLocalLayerKey(target, componentId))) return false;
  const normalized = normalizeLayerSelection(targets, anchorTarget);
  if (normalized.keys.length === 0) {
    selectCanvasState();
    return false;
  }
  selectionState = {
    kind: "variant",
    componentId,
    variantId,
    targets: normalized.keys,
    anchorTarget: normalized.primaryKey,
    // Keep the singular field for inspectors and older snapshots. It is an
    // internal anchor only; selection and movement use the complete target set.
    target: normalized.primaryKey,
  };
  return true;
}

function selectVariantLayerTarget(variantId, target, additive = false, componentId = currentComponent?.id) {
  target = toLocalLayerKey(target, componentId);
  if (!target || componentId !== currentComponent?.id) return false;
  const currentTargets = selectionState.kind === "variant" && selectionState.variantId === variantId
    ? getSelectedVariantLayerTargets()
    : [];
  if (!additive) return selectVariantLayerTargetsState(variantId, [target], target, componentId);
  const nextTargets = [...currentTargets];
  const existingIndex = nextTargets.indexOf(target);
  if (existingIndex >= 0) {
    nextTargets.splice(existingIndex, 1);
    return selectVariantLayerTargetsState(
      variantId,
      nextTargets,
      nextTargets[nextTargets.length - 1] ?? null,
      componentId,
    );
  }
  return selectVariantLayerTargetsState(variantId, [...nextTargets, target], target, componentId);
}

function getSelectedVariantLayerTargets(variantId = null) {
  if (selectionState.kind === "variants") {
    if (variantId !== null && selectionState.targetsByVariant) {
      return selectionState.targetsByVariant[String(variantId)] ?? [];
    }
    return selectionState.targets ?? [];
  }
  if (selectionState.kind !== "variant"
    || (variantId !== null && selectionState.variantId !== variantId)) return [];
  if (Array.isArray(selectionState.targets)) return selectionState.targets;
  return selectionState.target === null ? [] : [selectionState.target];
}

function isVariantLayerTargetSelected(variantId, target) {
  return isVariantSelected(variantId)
    && getSelectedVariantLayerTargets(variantId).includes(target);
}

function isVariantRootSelected(variantId) {
  return isVariantSelected(variantId)
    && getSelectedVariantLayerTargets(variantId).length === 0;
}

function selectVariantsLayerTargetsState(variantIds, targets, primaryVariantId = null, componentId = currentComponent?.id) {
  if (componentId !== currentComponent?.id) return false;
  if (targets.some((target) => !toLocalLayerKey(target, componentId))) return false;
  targets = targets.map((target) => toLocalLayerKey(target, componentId)).filter(Boolean);
  const keys = [...new Set(targets)].filter((key) => getElementForLayerKey(key) instanceof HTMLElement);
  const normalized = { keys, primaryKey: getShallowestPrimaryLayerKey(keys) };
  if (!selectVariantsState(variantIds, primaryVariantId, componentId)) return false;
  const targetsByVariant = Object.fromEntries(
    getSelectedVariantIds().map((variantId) => [String(variantId), [...normalized.keys]]),
  );
  selectionState = {
    ...selectionState,
    targets: normalized.keys,
    targetsByVariant,
    anchorTarget: normalized.primaryKey,
    target: normalized.primaryKey,
  };
  return true;
}

function selectVariantMarqueeState(
  rootVariantIds,
  layerTargetsByVariant,
  primaryVariantId = null,
  componentId = currentComponent?.id,
) {
  if (componentId !== currentComponent?.id) return false;
  const validIds = new Set(variantModel.getVariants().map((variant) => variant.id));
  const rootIds = new Set([...rootVariantIds].filter((variantId) => validIds.has(variantId)));
  const targetsByVariant = {};
  const childIds = [];
  const entries = layerTargetsByVariant instanceof Map
    ? [...layerTargetsByVariant.entries()]
    : Object.entries(layerTargetsByVariant ?? {}).map(([variantId, targets]) => [Number(variantId), targets]);
  entries.forEach(([variantId, targets]) => {
    if (!validIds.has(variantId) || rootIds.has(variantId)) return;
    const keys = [...new Set(targets.map((target) => toLocalLayerKey(target, componentId)))].filter((key) => key && getElementForLayerKey(key) instanceof HTMLElement);
    if (keys.length === 0) return;
    targetsByVariant[String(variantId)] = keys;
    childIds.push(variantId);
  });
  rootIds.forEach((variantId) => { targetsByVariant[String(variantId)] = []; });
  const selectedIdSet = new Set([...rootIds, ...childIds]);
  const variantIds = variantModel.getVariants()
    .map((variant) => variant.id)
    .filter((variantId) => selectedIdSet.has(variantId));
  if (variantIds.length === 0) {
    selectCanvasState();
    return false;
  }
  const resolvedPrimary = variantIds.includes(primaryVariantId)
    ? primaryVariantId
    : variantIds[variantIds.length - 1];
  if (variantIds.length === 1) {
    const variantId = variantIds[0];
    const targets = targetsByVariant[String(variantId)];
    if (targets.length === 0) return selectVariantState(variantId, null, componentId);
    const anchorTarget = getShallowestPrimaryLayerKey(targets);
    selectionState = {
      kind: "variant",
      componentId,
      variantId,
      targets,
      anchorTarget,
      target: anchorTarget,
    };
    return true;
  }
  const targets = [...new Set(Object.values(targetsByVariant).flat())];
  const anchorTarget = getShallowestPrimaryLayerKey(targets);
  selectionState = {
    kind: "variants",
    componentId,
    variantIds,
    primaryVariantId: resolvedPrimary,
    targetsByVariant,
    targets,
    anchorTarget,
    target: anchorTarget,
  };
  return true;
}

function getSelectedVariantIds() {
  if (selectionState.kind === "variants") return [...selectionState.variantIds];
  if (selectionState.kind === "variant") return [selectionState.variantId];
  return [];
}

function isVariantSelected(variantId) {
  return getSelectedVariantIds().includes(variantId);
}

function selectVariantsState(variantIds, primaryVariantId = null, componentId = currentComponent?.id) {
  if (componentId !== currentComponent?.id) return false;
  const validIds = new Set(variantModel.getVariants().map((variant) => variant.id));
  const normalizedIds = [...new Set(variantIds)].filter((variantId) => validIds.has(variantId));
  if (normalizedIds.length === 0) {
    selectCanvasState();
    return false;
  }
  const resolvedPrimary = normalizedIds.includes(primaryVariantId)
    ? primaryVariantId
    : normalizedIds[normalizedIds.length - 1];
  if (normalizedIds.length === 1) return selectVariantState(normalizedIds[0], null, componentId);
  selectionState = {
    kind: "variants",
    componentId,
    variantIds: normalizedIds,
    primaryVariantId: resolvedPrimary,
  };
  return true;
}

function selectLayerKeys(keys, primaryKey = null, componentId = currentComponent?.id) {
  if (componentId !== currentComponent?.id) return false;
  if (keys.some((key) => !toLocalLayerKey(key, componentId))) return false;
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
  key = toLocalLayerKey(key, currentComponent?.id);
  if (!key) return false;
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
  key = toLocalLayerKey(key, currentComponent?.id);
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
    const targetsByVariant = selectionState.targetsByVariant
      ? Object.fromEntries(Object.entries(selectionState.targetsByVariant).map(([id, targets]) => [id, [...targets]]))
      : undefined;
    return {
      ...selectionState,
      variantIds: [...selectionState.variantIds],
      targets: [...getSelectedVariantLayerTargets()],
      ...(targetsByVariant ? { targetsByVariant } : {}),
    };
  }
  return { ...selectionState };
}

function restoreSelectionState(snapshot) {
  const savedSelection = mapSelectionLayerReferences(snapshot.selection,
    (value) => toRuntimeLayerTarget(value, snapshot.componentId));
  if (savedSelection?.kind === "component" && savedSelection.componentId === currentComponent?.id) {
    selectComponentState(savedSelection.componentId);
    return;
  }
  if (savedSelection?.kind === "variant"
    && savedSelection.componentId === currentComponent?.id
    && getVariant(savedSelection.variantId)) {
    const savedTargets = Array.isArray(savedSelection.targets)
      ? savedSelection.targets
      : savedSelection.target == null ? [] : [savedSelection.target];
    if (savedTargets.length > 0) {
      selectVariantLayerTargetsState(
        savedSelection.variantId,
        savedTargets,
        savedSelection.anchorTarget ?? savedSelection.target ?? null,
        savedSelection.componentId,
      );
    } else {
      selectVariantState(savedSelection.variantId, null, savedSelection.componentId);
    }
    return;
  }
  if (savedSelection?.kind === "variants" && savedSelection.componentId === currentComponent?.id) {
    if (savedSelection.targetsByVariant) {
      const roots = (savedSelection.variantIds ?? []).filter(
        (variantId) => (savedSelection.targetsByVariant[String(variantId)] ?? []).length === 0,
      );
      if (selectVariantMarqueeState(
        roots,
        savedSelection.targetsByVariant,
        savedSelection.primaryVariantId ?? null,
        savedSelection.componentId,
      )) return;
    }
    if (selectVariantsLayerTargetsState(
      savedSelection.variantIds ?? [],
      savedSelection.targets ?? [],
      savedSelection.primaryVariantId ?? null,
      savedSelection.componentId,
    )) return;
  }
  if (savedSelection?.kind === "layers" && savedSelection.componentId === currentComponent?.id) {
    if (selectLayerKeys(savedSelection.keys ?? [], savedSelection.primaryKey ?? null, savedSelection.componentId)) return;
  }

  // Migrate snapshots created before selection became a single state object.
  if (snapshot.selectedVariantId != null && getVariant(snapshot.selectedVariantId)) {
    selectVariantState(snapshot.selectedVariantId, snapshot.selectedVariantLayerTarget ?? null);
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
  selectedVariantId: {
    configurable: true,
    get: () => selectionState.kind === "variant"
      ? selectionState.variantId
      : selectionState.kind === "variants" ? selectionState.primaryVariantId : null,
  },
  selectedVariantLayerTarget: {
    configurable: true,
    get: () => ["variant", "variants"].includes(selectionState.kind) ? selectionState.target ?? null : null,
  },
  selectedVariantIds: {
    configurable: true,
    get: () => getSelectedVariantIds(),
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

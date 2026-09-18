/* Commands that act on the current canvas layer selection. */

function copyElementDataset(source, target, excludedKeys) {
  Object.entries(source.dataset).forEach(([key, value]) => {
    if (!excludedKeys.includes(key)) target.dataset[key] = value;
  });
}

function copyTextPresentation(source, target) {
  copyElementDataset(source, target, ["textId"]);
  target.setAttribute("style", source.getAttribute("style") || "");
  const styles = getComputedStyle(source);
  target.dataset.fontFamily = styles.fontFamily.split(",")[0].replace(/^['"]|['"]$/g, "").trim() || DEFAULT_FONT_FAMILY;
  target.dataset.fontWeight = String(Number.parseFloat(styles.fontWeight) || DEFAULT_FONT_WEIGHT);
  target.dataset.fontSize = String(Number.parseFloat(styles.fontSize) || 14);
  target.dataset.lineHeight = styles.lineHeight === "normal" ? "Auto" : String(Number.parseFloat(styles.lineHeight) || 0);
  target.dataset.letterSpacing = styles.letterSpacing === "normal" ? "0%" : styles.letterSpacing;
  const rgbaAlpha = styles.color.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
  const opacity = rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : 100;
  target.dataset.textColor = opacity === 0 ? "" : cssColorToHex(styles.color) || "#000000";
  target.dataset.textColorOpacity = String(opacity);
}

function duplicateTextRecord(
  sourceRecord,
  parentRecord,
  offsetRoot = false,
  presentationSource = sourceRecord.element,
  targetMap = null,
) {
  const source = sourceRecord.element;
  const runData = getCurrentTextRunData(presentationSource);
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasText(parentRecord, x, y, {
    beginEditing: false,
    recordHistory: false,
    isNew: false,
    textContent: runData.textContent,
  });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  copyTextPresentation(presentationSource, duplicate);
  duplicate.innerHTML = runData.html;
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;
  duplicate.contentEditable = "false";
  duplicate.setAttribute("aria-label", runData.textContent || `Text ${duplicateRecord.id}`);
  applyLayerSizing("text", duplicateRecord);
  targetMap?.set(`text:${sourceRecord.id}`, `text:${duplicateRecord.id}`);
  return duplicateRecord;
}

function duplicateVectorRecord(sourceRecord, parentRecord, offsetRoot = false, targetMap = null) {
  const source = sourceRecord.element;
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasVector({
    source: sourceRecord.svgSource,
    width: Number(source.dataset.width || "24"),
    height: Number(source.dataset.height || "24"),
    name: sourceRecord.name,
  }, x, y, parentRecord, { recordHistory: false, select: false });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  duplicateRecord.originalSvgSource = sourceRecord.originalSvgSource || sourceRecord.svgSource;
  copyElementDataset(source, duplicate, ["vectorId"]);
  duplicate.setAttribute("style", source.getAttribute("style") || "");
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;
  targetMap?.set(`vector:${sourceRecord.id}`, `vector:${duplicateRecord.id}`);
  return duplicateRecord;
}

function duplicateFrameRecord(sourceRecord, parentRecord, offsetRoot = false, targetMap = null) {
  const source = sourceRecord.element;
  const childLayers = getLayerChildren(sourceRecord.id);
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasFrame(x, y, parentRecord, { recordHistory: false, select: false });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  duplicateRecord.name = sourceRecord.name;
  duplicate.setAttribute("aria-label", duplicateRecord.name || `Frame ${duplicateRecord.id}`);
  copyElementDataset(source, duplicate, ["frameId"]);
  duplicate.setAttribute("style", source.getAttribute("style") || "");
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;
  targetMap?.set(`frame:${sourceRecord.id}`, `frame:${duplicateRecord.id}`);

  childLayers.forEach((childLayer) => {
    duplicateLayerRecord(childLayer.record, duplicateRecord, false, targetMap);
  });
  return duplicateRecord;
}

function duplicateLayerRecord(record, parentRecord, offsetRoot = false, targetMap = null) {
  const duplicate = {
    frame: duplicateFrameRecord,
    text: (source, parent, offset, targets) => duplicateTextRecord(source, parent, offset, source.element, targets),
    vector: duplicateVectorRecord,
    "component-instance": (source, parent, offset, targets) => {
      const entry = captureWorkspaceState().layers.find((node) => node.type === source.type && node.id === source.id);
      entry.id = nextComponentInstanceId++;
      entry.parentId = parent?.isComponent ? null : parent?.id ?? null;
      entry.order = nextLayerOrder++;
      const [copy] = createWorkspaceLayerViews({ layers: [entry] }, { interactive: true });
      layerRecords.push(copy);
      (parent?.element ?? canvasRootStack).append(copy.element);
      targets?.set(`component-instance:${source.id}`, `component-instance:${copy.id}`);
      return copy;
    },
  }[record.type];
  return duplicate?.(record, parentRecord, offsetRoot, targetMap) ?? null;
}

function cloneVariantDataForDuplicatedTargets(targetMap) {
  if (!(targetMap instanceof Map) || targetMap.size === 0) return;
  const remap = (target) => {
    if (targetMap.has(target)) return targetMap.get(target);
    const identity = normalizeLayerIdentity(target, currentComponent.id);
    if (identity.kind !== "placed" || identity.ownerComponentId !== currentComponent.id || !identity.instancePath.length) return null;
    const copy = targetMap.get(`component-instance:${identity.instancePath[0]}`);
    if (!copy) return null;
    return getLayerIdentityKey(createPlacedLayerIdentity(identity.ownerComponentId,
      [Number(copy.split(":")[1]), ...identity.instancePath.slice(1)], identity.source));
  };
  variantModel.getVariants().forEach((variant) => {
    const copiedOverrides = [...(variant.overrides ?? [])].flatMap((override) => {
      const target = remap(override.target);
      return target ? [{ ...structuredClone(override), target }] : [];
    });
    variant.overrides = [...(variant.overrides ?? []), ...copiedOverrides];
  });
  const copiedRules = variantModel.getRules().flatMap((rule) => {
    const target = remap(rule.target);
    return target ? [{ ...structuredClone(rule), id: undefined, target }] : [];
  });
  copiedRules.forEach(({ id, ...rule }) => variantModel.addRule(rule));
}

function captureSelectedLayerCopies() {
  const variantIds = getSelectedVariantIds();
  const keys = variantIds.length > 0
    ? getSelectedVariantLayerTargets()
    : getSelectedLayerKeys();
  const layers = getSelectedTopLevelLayers(keys).map((layer) => ({
    type: layer.type,
    id: layer.record.id,
  }));
  return {
    layers,
    variantIds,
    primaryVariantId: selectedVariantId,
  };
}

function insertLayerCopies(copy) {
  if (!currentComponent || !copy?.layers?.length) return false;
  const sourceLayers = copy.layers.map((layer) => ({
    type: layer.type,
    record: getLayerRecord(layer),
  })).filter(({ record }) => record);
  if (sourceLayers.length === 0) return false;

  return runCanvasMutation(() => {
    const targetMap = new Map();
    const duplicates = sourceLayers.map(({ type, record }) => {
      const parentId = record.parentId;
      const parentRecord = parentId === null ? null : getFrameRecord(parentId);
      const duplicate = duplicateLayerRecord(record, parentRecord, parentId === null, targetMap);
      if (duplicate) {
        moveLayerRelative(
          { type, id: duplicate.id },
          { type, id: record.id },
          "after",
        );
      }
      return duplicate ? { type, record: duplicate } : null;
    }).filter(Boolean);
    if (duplicates.length === 0) return false;

    cloneVariantDataForDuplicatedTargets(targetMap);
    const duplicateKeys = duplicates.map(({ type, record }) => getLayerKey(type, record.id));
    const validVariantIds = copy.variantIds.filter((id) => getVariant(id));
    if (validVariantIds.length > 0) {
      selectVariantsLayerTargetsState(
        validVariantIds,
        duplicateKeys,
        validVariantIds.includes(copy.primaryVariantId)
          ? copy.primaryVariantId
          : validVariantIds[validVariantIds.length - 1],
      );
      clearMasterSelectionForVariant();
    } else {
      selectLayerKeys(duplicateKeys, duplicateKeys[duplicateKeys.length - 1]);
      syncElementSelectionStyles();
    }
    queueCanvasMutationEffects({ sizing: true, selection: true, tree: true });
    return true;
  });
}

function duplicateSelectedLayer() {
  const variantCopies = captureSelectedVariantCopies();
  if (variantCopies.length > 0) return insertVariantCopies(variantCopies);
  if (selectedComponentId !== null) return;
  return insertLayerCopies(captureSelectedLayerCopies());
}

function getPrimaryLayerDescriptor() {
  const instance = getSelectedComponentInstances().at(-1);
  if (instance) return { type: "component-instance", record: instance };
  if (selectedComponentId === currentComponent?.id) return { type: "component", record: currentComponent.frameRecord };
  const frameRecord = getSelectedFrameRecord();
  if (frameRecord && !frameRecord.isComponent) return { type: "frame", record: frameRecord };
  const textRecord = getSelectedTextRecord();
  if (textRecord) return { type: "text", record: textRecord };
  const vectorRecord = getSelectedVectorRecord();
  if (vectorRecord) return { type: "vector", record: vectorRecord };
  return null;
}

function selectLayerDescriptor(layer) {
  if (!layer) return false;
  const variantId = selectedVariantId;
  if (variantId !== null) {
    selectVariant(variantId, {
      render: false,
      layerTarget: layer.type === "component" ? null : getLayerKey(layer.type, layer.record.id),
    });
    return true;
  }
  if (layer.type === "component") {
    selectComponentTreeNode(currentComponent?.id);
    return true;
  }
  if (layer.type === "component-instance") selectComponentInstance(layer.record.id);
  else if (layer.type === "frame") selectCanvasFrame(layer.record.element);
  else if (layer.type === "text") selectCanvasText(layer.record.element);
  else selectCanvasVector(layer.record.element);
  return true;
}

function getSelectedTopLevelLayers(keys = getSelectedLayerKeys()) {
  const selectedFrameIds = new Set();
  keys.forEach((key) => {
    const [type, rawId] = key.split(":");
    if (type === "frame") selectedFrameIds.add(Number(rawId));
  });

  const hasSelectedFrameAncestor = (parentId) => {
    let ancestorId = parentId;
    while (ancestorId !== null) {
      if (selectedFrameIds.has(ancestorId)) return true;
      ancestorId = getFrameRecord(ancestorId)?.parentId ?? null;
    }
    return false;
  };

  return [...keys].flatMap((key) => {
    const [type, rawId] = key.split(":");
    const id = Number(rawId);
    const record = getLayerRecord({ type, id });
    if (!record) return [];
    const parentId = record.parentId;
    if (hasSelectedFrameAncestor(parentId)) return [];
    return [{ type, record, parentId }];
  }).sort((a, b) => a.record.order - b.record.order);
}

function wrapSelectedLayersInFrame() {
  if (selectedComponentId !== null || !currentComponent) return false;
  const variantIds = getSelectedVariantIds();
  const primaryVariantId = selectedVariantId;
  const layers = getSelectedTopLevelLayers(
    variantIds.length > 0 ? getSelectedVariantLayerTargets() : getSelectedLayerKeys(),
  );
  if (layers.length === 0) return false;
  const parentId = layers[0].parentId;
  if (layers.some((layer) => layer.parentId !== parentId)) return false;
  const siblings = getLayerChildren(parentId);
  const insertionIndex = Math.min(...layers.map((layer) => siblings.findIndex(
    (sibling) => sibling.type === layer.type && sibling.record.id === layer.record.id,
  )).filter((index) => index >= 0));
  if (!Number.isFinite(insertionIndex)) return false;

  const positionedLayers = layers.filter((layer) => layer.record.element instanceof HTMLElement);
  const directionCandidates = positionedLayers.filter((layer) => layer.type === "frame");
  const nodesToMeasure = directionCandidates.length >= 2 ? directionCandidates : positionedLayers;
  const centers = nodesToMeasure.map((layer) => {
    const bounds = layer.record.element.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
  });
  const horizontalSpread = centers.length > 1
    ? Math.max(...centers.map(({ x }) => x)) - Math.min(...centers.map(({ x }) => x))
    : 0;
  const verticalSpread = centers.length > 1
    ? Math.max(...centers.map(({ y }) => y)) - Math.min(...centers.map(({ y }) => y))
    : 0;
  const wrapperDirection = verticalSpread > horizontalSpread ? "vertical" : "horizontal";
  const orderedBounds = positionedLayers
    .map((layer) => layer.record.element.getBoundingClientRect())
    .sort((first, second) => wrapperDirection === "vertical"
      ? first.top - second.top
      : first.left - second.left);
  const gaps = orderedBounds.slice(1).map((bounds, index) => {
    const previous = orderedBounds[index];
    return Math.max(0, wrapperDirection === "vertical"
      ? bounds.top - previous.bottom
      : bounds.left - previous.right);
  });
  const averageGap = gaps.length > 0
    ? Math.round((gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length) * 100) / 100
    : 0;

  return runCanvasMutation(() => {
    const parentRecord = parentId === null ? currentComponent.frameRecord : getFrameRecord(parentId);
    const wrapper = createCanvasFrame(0, 0, parentRecord, { recordHistory: false, select: false });
    if (!wrapper) return false;
    wrapper.element.dataset.direction = wrapperDirection;
    wrapper.element.style.flexDirection = wrapperDirection === "vertical" ? "column" : "row";
    ["Left", "Top", "Right", "Bottom"].forEach((side) => {
      wrapper.element.dataset[`padding${side}`] = "0";
    });
    wrapper.element.style.padding = "0";
    wrapper.element.dataset.gapMode = "fixed";
    wrapper.element.dataset.gap = String(averageGap);
    wrapper.element.style.gap = `${averageGap}px`;
    applyFrameAlignment(wrapper.element);
    wrapper.element.dataset.widthMode = "hug";
    wrapper.element.dataset.heightMode = "hug";
    applyLayerSizing("frame", wrapper);
    moveLayer({ type: "frame", id: wrapper.id }, parentId, insertionIndex);
    layers.forEach((layer, index) => moveLayer({ type: layer.type, id: layer.record.id }, wrapper.id, index));
    expandedFrameIds.add(wrapper.id);
    if (variantIds.length > 0) {
      selectVariantsLayerTargetsState(variantIds, [getLayerKey("frame", wrapper.id)], primaryVariantId);
      clearMasterSelectionForVariant();
      queueCanvasMutationEffects({ selection: true, tree: true });
    } else {
      selectCanvasFrame(wrapper.element);
    }
    return true;
  });
}

function reorderPrimaryLayer(step = 0, edge = null) {
  if (getSelectedVariantIds().length > 0 && getSelectedVariantLayerTargets().length === 0) {
    return reorderSelectedVariants(step, edge);
  }
  const layer = getPrimaryLayerDescriptor();
  if (!layer || layer.type === "component") return false;
  const parentId = layer.record.parentId;
  const siblings = getLayerChildren(parentId);
  const anchorLayer = { type: layer.type, id: layer.record.id };
  const variantId = selectedVariantId;
  const selectedKeys = new Set(
    variantId === null ? getSelectedLayerKeys() : getSelectedVariantLayerTargets(),
  );
  const anchorKey = getLayerDescriptorKey(anchorLayer);
  const draggedLayers = selectedKeys.size > 1 && selectedKeys.has(anchorKey)
    ? siblings
      .map((sibling) => ({ type: sibling.type, id: sibling.record.id }))
      .filter((candidate) => selectedKeys.has(getLayerDescriptorKey(candidate)))
    : [anchorLayer];
  const draggedKeys = new Set(draggedLayers.map(getLayerDescriptorKey));
  const targetIndex = getCollectionReorderIndex(
    siblings,
    draggedKeys,
    step,
    edge,
    (sibling) => getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id }),
  );
  if (targetIndex === null) return false;
  const previousPositions = captureCanvasLayerPositions(false, variantId);
  const didMove = moveLayers(draggedLayers, parentId, targetIndex);
  if (didMove) animateCanvasLayerReflow(previousPositions, variantId);
  return didMove;
}

function selectMatchingLayers() {
  const variantIds = getSelectedVariantIds();
  // Canvas records have unique schema IDs. Only variants repeat those
  // IDs; a standalone canvas layer or component therefore has no other match.
  if (variantIds.length !== 1) return false;
  const targets = getSelectedVariantLayerTargets(variantIds[0]);
  const variant = getVariant(variantIds[0]);
  if (!variant || variant.componentId !== currentComponent?.id) return false;
  const matchingIds = variantModel.getVariants()
    .filter((candidate) => candidate.componentId === variant.componentId)
    .map((candidate) => candidate.id);
  if (matchingIds.length < 2) return false;

  // Local editor keys address the same qualified source in every variant of
  // this definition, regardless of names, styling, or local overrides.
  if (targets.length > 0) {
    if (targets.some((target) => !getElementForLayerKey(target))) return false;
    selectVariantsLayerTargetsState(matchingIds, targets, variant.id);
  } else {
    selectVariantsState(matchingIds, variant.id);
  }
  clearMasterSelectionForVariant();
  renderTree();
  return true;
}

function selectHierarchyChild() {
  if (selectedComponentId === currentComponent?.id && variantModel.getVariants().length > 0) {
    selectVariantsState(variantModel.getVariants().map((variant) => variant.id));
    clearMasterSelectionForVariant();
    renderTree();
    return true;
  }
  if (selectedVariantId !== null && getSelectedVariantLayerTargets().length === 0) {
    const targets = getLayerChildren(null).map((child) => getLayerKey(child.type, child.record.id));
    if (targets.length === 0) return false;
    expandFramePath(null);
    selectVariantsLayerTargetsState(getSelectedVariantIds(), targets, selectedVariantId);
    clearMasterSelectionForVariant();
    renderTree();
    return true;
  }
  if (selectedVariantId !== null) {
    const frames = getSelectedVariantLayerTargets()
      .filter((target) => target.startsWith("frame:"))
      .map((target) => Number(target.split(":")[1]));
    const children = frames.flatMap((id) => getLayerChildren(id));
    if (children.length === 0) return false;
    frames.forEach(expandFramePath);
    selectVariantsLayerTargetsState(
      getSelectedVariantIds(),
      children.map((child) => getLayerKey(child.type, child.record.id)),
      selectedVariantId,
    );
    clearMasterSelectionForVariant();
    renderTree();
    return true;
  }
  const layer = getPrimaryLayerDescriptor();
  if (!layer) return false;
  const children = layer.type === "component"
    ? getLayerChildren(null)
    : layer.type === "frame" ? getLayerChildren(layer.record.id) : [];
  if (children.length === 0) return false;

  expandFramePath(layer.type === "frame" ? layer.record.id : null);
  const childKeys = children.map((child) => getLayerKey(child.type, child.record.id));
  if (selectedVariantId !== null) {
    selectVariantsLayerTargetsState(
      getSelectedVariantIds(),
      childKeys,
      selectedVariantId,
    );
    clearMasterSelectionForVariant();
  } else {
    selectLayerKeys(childKeys, childKeys[childKeys.length - 1]);
    syncElementSelectionStyles();
  }
  renderTree();
  return true;
}

function selectHierarchyParent() {
  if (selectedVariantId !== null) {
    const targets = getSelectedVariantLayerTargets();
    if (targets.length === 0) {
      selectComponentState(currentComponent.id);
      syncElementSelectionStyles();
    } else {
      const parentKeys = targets.map(getLayerParentKey).filter((key) => key?.startsWith("frame:"));
      selectVariantsLayerTargetsState(
        getSelectedVariantIds(),
        parentKeys,
        selectedVariantId,
      );
      clearMasterSelectionForVariant();
    }
    renderTree();
    return true;
  }
  const layer = getPrimaryLayerDescriptor();
  if (!layer || layer.type === "component") return false;
  const parentId = layer.record.parentId;
  if (parentId === null) return selectLayerDescriptor({ type: "component", record: currentComponent.frameRecord });
  const parentRecord = getFrameRecord(parentId);
  return parentRecord ? selectLayerDescriptor({ type: "frame", record: parentRecord }) : false;
}

function selectSiblingLayer(offset) {
  const variantIds = getSelectedVariantIds();
  const targets = getSelectedVariantLayerTargets();
  if (offset > 0 && (variantIds.length > 1 || (variantIds.length > 0 && targets.length > 1))) {
    selectVariantState(variantIds[0], targets[0] ?? null);
    clearMasterSelectionForVariant();
    renderTree();
    return true;
  }
  const layer = getPrimaryLayerDescriptor();
  if (!layer) return false;
  if (layer.type === "component") {
    const currentIndex = components.findIndex((component) => component.id === currentComponent?.id);
    if (currentIndex < 0 || components.length === 0) return false;
    const nextIndex = (currentIndex + offset + components.length) % components.length;
    const nextComponent = components[nextIndex];
    selectComponentTreeNode(nextComponent.id);
    return true;
  }
  const parentId = layer.record.parentId;
  const siblings = getLayerChildren(parentId);
  const currentIndex = siblings.findIndex(
    (sibling) => sibling.type === layer.type && sibling.record.id === layer.record.id,
  );
  if (currentIndex < 0 || siblings.length === 0) return false;
  const nextIndex = (currentIndex + offset + siblings.length) % siblings.length;
  return selectLayerDescriptor(siblings[nextIndex]);
}

function setSelectedLayersOpacity(percent) {
  const normalizedPercent = Math.max(10, Math.min(100, percent));
  let elements = [];
  if (selectedComponentId === currentComponent?.id) {
    elements = [currentComponent.frameRecord.element];
  } else {
    elements = getSelectedTopLevelLayers().map((layer) => layer.record.element);
  }
  if (elements.length === 0) return false;
  const hasChanges = elements.some((element) => Number(element.dataset.opacity || "100") !== normalizedPercent);
  if (!hasChanges) return false;
  recordHistory();
  elements.forEach((element) => {
    element.dataset.opacity = String(normalizedPercent);
    element.style.opacity = normalizedPercent === 100 ? "" : String(normalizedPercent / 100);
  });
  requestAnimationFrame(syncResizeOverlay);
  return true;
}

function deleteLayers(layers) {
  const removed = new Set(layers.flatMap((layer) => getLayerNodeDescendants(layerRecords, layer)));
  if (removed.size === 0) return false;
  recordHistory();
  const deletedTargets = new Set([...removed].map((record) => `${record.type}:${record.id}`));
  const isDeleted = (target) => {
    if (deletedTargets.has(target)) return true;
    const identity = normalizeLayerIdentity(target, currentComponent.id);
    return identity.kind === "placed" && identity.ownerComponentId === currentComponent.id
      && deletedTargets.has(`component-instance:${identity.instancePath[0]}`);
  };
  variantModel.getVariants().forEach((variant) => {
    variant.overrides = (variant.overrides ?? []).filter((override) => !isDeleted(override.target));
  });
  variantModel.replaceRules(variantModel.getRules().filter((rule) => !isDeleted(rule.target)));

  const removedComponentProps = componentProps.filter((prop) => (
    (prop.targetFrameId != null && deletedTargets.has(`frame:${prop.targetFrameId}`))
    || (prop.targetTextId != null && deletedTargets.has(`text:${prop.targetTextId}`))
    || (prop.targetVectorId != null && deletedTargets.has(`vector:${prop.targetVectorId}`))
  ));
  const removedVariantPropIds = new Set(removedComponentProps
    .map((prop) => prop.variantPropId)
    .filter((id) => id != null));
  componentProps = componentProps.filter((prop) => !removedComponentProps.includes(prop));
  if (removedVariantPropIds.size > 0) {
    variantModel.replaceProps(
      variantModel.getProps().filter((prop) => !removedVariantPropIds.has(prop.id)),
    );
    variantModel.getVariants().forEach((variant) => {
      removedVariantPropIds.forEach((id) => { delete variant.propValues[id]; });
    });
    variantModel.getRules().forEach((rule) => {
      removedVariantPropIds.forEach((id) => { delete rule.conditions[id]; });
    });
    variantModel.replaceRules(
      variantModel.getRules().filter((rule) => Object.keys(rule.conditions).length > 0),
    );
  }

  const parents = new Set([...removed].map((record) => record.parentId));
  removed.forEach((record) => {
    record.element.remove();
    if (record.type === "frame") expandedFrameIds.delete(record.id);
  });
  layerRecords = layerRecords.filter((record) => !removed.has(record));
  parents.forEach(normalizeSiblingOrder);
  applyAllLayerSizing();
  selectCanvasState();
  syncElementSelectionStyles();
  renderTree();
  return true;
}

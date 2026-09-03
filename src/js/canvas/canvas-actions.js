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
  textContent = sourceRecord.element.textContent ?? "",
  presentationSource = sourceRecord.element,
) {
  const source = sourceRecord.element;
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasText(parentRecord, x, y, {
    beginEditing: false,
    recordHistory: false,
    isNew: false,
    textContent,
  });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  copyTextPresentation(presentationSource, duplicate);
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;
  duplicate.contentEditable = "false";
  duplicateRecord.name = sourceRecord.name;
  duplicate.setAttribute("aria-label", duplicateRecord.name || `Text ${duplicateRecord.id}`);
  applyLayerSizing("text", duplicateRecord);
  return duplicateRecord;
}

function duplicateVectorRecord(sourceRecord, parentRecord, offsetRoot = false) {
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
  return duplicateRecord;
}

function duplicateFrameRecord(sourceRecord, parentRecord, offsetRoot = false) {
  const source = sourceRecord.element;
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

  getLayerChildren(sourceRecord.id).forEach((childLayer) => {
    if (childLayer.type === "frame") duplicateFrameRecord(childLayer.record, duplicateRecord);
    else if (childLayer.type === "text") duplicateTextRecord(childLayer.record, duplicateRecord);
    else duplicateVectorRecord(childLayer.record, duplicateRecord);
  });
  return duplicateRecord;
}

function duplicateSelectedLayer() {
  if (selectedComponentId !== null) return;
  const variantSelection = selectionState.kind === "variant" ? { ...selectionState } : null;
  if (variantSelection?.target === null) {
    addVariantInstance();
    return;
  }
  let selectedFrameRecord = getSelectedFrameRecord();
  let selectedTextRecord = getSelectedTextRecord();
  let selectedVectorRecord = getSelectedVectorRecord();
  const selectedTextContent = selectedTextRecord?.element.textContent ?? null;
  const selectedTextPresentation = selectedTextRecord?.element ?? null;
  if (variantSelection) {
    if (selectedFrameRecord?.isVariantInstance) selectedFrameRecord = getFrameRecord(selectedFrameRecord.id);
    if (selectedTextRecord?.isVariantInstance) selectedTextRecord = getTextRecord(selectedTextRecord.id);
    if (selectedVectorRecord?.isVariantInstance) selectedVectorRecord = getVectorRecord(selectedVectorRecord.id);
  }
  if (!selectedFrameRecord && !selectedTextRecord && !selectedVectorRecord) return;

  const selectDuplicate = (type, record) => {
    if (variantSelection) {
      selectVariantInstance(variantSelection.instanceId, {
        render: false,
        layerTarget: getLayerKey(type, record.id),
      });
      queueCanvasMutationEffects({ selection: true, tree: true });
      return;
    }
    if (type === "frame") selectCanvasFrame(record.element);
    else if (type === "text") selectCanvasText(record.element);
    else selectCanvasVector(record.element);
  };

  return runCanvasMutation(() => {
    if (selectedFrameRecord) {
      const parentRecord = selectedFrameRecord.parentId === null
        ? null
        : getFrameRecord(selectedFrameRecord.parentId);
      const duplicateRecord = duplicateFrameRecord(
        selectedFrameRecord,
        parentRecord,
        selectedFrameRecord.parentId === null,
      );
      if (!duplicateRecord) return;
      moveLayerRelative(
        { type: "frame", id: duplicateRecord.id },
        { type: "frame", id: selectedFrameRecord.id },
        "after",
      );
      selectDuplicate("frame", duplicateRecord);
      return;
    }

    if (selectedTextRecord) {
      const parentRecord = selectedTextRecord.parentFrameId === null
        ? null
        : getFrameRecord(selectedTextRecord.parentFrameId);
      const duplicateRecord = duplicateTextRecord(
        selectedTextRecord,
        parentRecord,
        selectedTextRecord.parentFrameId === null,
        selectedTextContent ?? "",
        selectedTextPresentation ?? selectedTextRecord.element,
      );
      if (!duplicateRecord) return;
      moveLayerRelative(
        { type: "text", id: duplicateRecord.id },
        { type: "text", id: selectedTextRecord.id },
        "after",
      );
      selectDuplicate("text", duplicateRecord);
      return;
    }

    const parentRecord = selectedVectorRecord.parentFrameId === null
      ? null
      : getFrameRecord(selectedVectorRecord.parentFrameId);
    const duplicateRecord = duplicateVectorRecord(
      selectedVectorRecord,
      parentRecord,
      selectedVectorRecord.parentFrameId === null,
    );
    if (!duplicateRecord) return;
    moveLayerRelative(
      { type: "vector", id: duplicateRecord.id },
      { type: "vector", id: selectedVectorRecord.id },
      "after",
    );
    selectDuplicate("vector", duplicateRecord);
  });
}

function getPrimaryLayerDescriptor() {
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
  const variantInstanceId = selectedVariantInstanceId;
  if (variantInstanceId !== null) {
    selectVariantInstance(variantInstanceId, {
      render: false,
      layerTarget: layer.type === "component" ? null : getLayerKey(layer.type, layer.record.id),
    });
    return true;
  }
  if (layer.type === "component") {
    selectComponentTreeNode(currentComponent?.id);
    return true;
  }
  if (layer.type === "frame") selectCanvasFrame(layer.record.element);
  else if (layer.type === "text") selectCanvasText(layer.record.element);
  else selectCanvasVector(layer.record.element);
  return true;
}

function getSelectedTopLevelLayers() {
  const selectedFrameIds = new Set();
  selectedLayerKeys.forEach((key) => {
    const [type, rawId] = key.split(":");
    if (type === "frame") selectedFrameIds.add(Number(rawId));
  });

  const hasSelectedFrameAncestor = (parentFrameId) => {
    let ancestorId = parentFrameId;
    while (ancestorId !== null) {
      if (selectedFrameIds.has(ancestorId)) return true;
      ancestorId = getFrameRecord(ancestorId)?.parentId ?? null;
    }
    return false;
  };

  return [...selectedLayerKeys].flatMap((key) => {
    const [type, rawId] = key.split(":");
    const id = Number(rawId);
    const record = type === "frame" ? getFrameRecord(id) : type === "text" ? getTextRecord(id) : getVectorRecord(id);
    if (!record) return [];
    const parentId = type === "frame" ? record.parentId : record.parentFrameId;
    if (hasSelectedFrameAncestor(parentId)) return [];
    return [{ type, record, parentId }];
  }).sort((a, b) => a.record.order - b.record.order);
}

function wrapSelectedLayersInFrame() {
  if (selectedComponentId !== null || selectedLayerKeys.size === 0 || !currentComponent) return false;
  const layers = getSelectedTopLevelLayers();
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
    selectCanvasFrame(wrapper.element);
    return true;
  });
}

function reorderPrimaryLayer(step = 0, edge = null) {
  const layer = getPrimaryLayerDescriptor();
  if (!layer || layer.type === "component") return false;
  const parentId = layer.type === "frame" ? layer.record.parentId : layer.record.parentFrameId;
  const siblings = getLayerChildren(parentId);
  const anchorLayer = { type: layer.type, id: layer.record.id };
  const variantInstanceId = selectedVariantInstanceId;
  const selectedKeys = new Set(
    variantInstanceId === null ? getSelectedLayerKeys() : getSelectedVariantLayerTargets(),
  );
  const anchorKey = getLayerDescriptorKey(anchorLayer);
  const draggedLayers = selectedKeys.size > 1 && selectedKeys.has(anchorKey)
    ? siblings
      .map((sibling) => ({ type: sibling.type, id: sibling.record.id }))
      .filter((candidate) => selectedKeys.has(getLayerDescriptorKey(candidate)))
    : [anchorLayer];
  const draggedKeys = new Set(draggedLayers.map(getLayerDescriptorKey));
  const firstMovingIndex = siblings.findIndex(
    (sibling) => draggedKeys.has(getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id })),
  );
  if (firstMovingIndex < 0) return false;
  const remainingSiblings = siblings.filter(
    (sibling) => !draggedKeys.has(getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id })),
  );
  const currentInsertionIndex = siblings
    .slice(0, firstMovingIndex)
    .filter((sibling) => !draggedKeys.has(getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id })))
    .length;
  const targetIndex = edge === "back"
    ? 0
    : edge === "front"
      ? remainingSiblings.length
      : Math.max(0, Math.min(remainingSiblings.length, currentInsertionIndex + step));
  const previousPositions = captureCanvasLayerPositions(false, variantInstanceId);
  const didMove = moveLayers(draggedLayers, parentId, targetIndex);
  if (didMove) animateCanvasLayerReflow(previousPositions, variantInstanceId);
  return didMove;
}

function selectHierarchyChild() {
  const layer = getPrimaryLayerDescriptor();
  if (!layer) return false;
  const children = layer.type === "component"
    ? getLayerChildren(null)
    : layer.type === "frame" ? getLayerChildren(layer.record.id) : [];
  if (children.length === 0) return false;

  const childKeys = children.map((child) => getLayerKey(child.type, child.record.id));
  if (selectedVariantInstanceId !== null) {
    selectVariantLayerTargetsState(
      selectedVariantInstanceId,
      childKeys,
      childKeys[childKeys.length - 1],
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
  const layer = getPrimaryLayerDescriptor();
  if (!layer || layer.type === "component") return false;
  const parentId = layer.type === "frame" ? layer.record.parentId : layer.record.parentFrameId;
  if (parentId === null) return selectLayerDescriptor({ type: "component", record: currentComponent.frameRecord });
  const parentRecord = getFrameRecord(parentId);
  return parentRecord ? selectLayerDescriptor({ type: "frame", record: parentRecord }) : false;
}

function selectSiblingLayer(offset) {
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
  const parentId = layer.type === "frame" ? layer.record.parentId : layer.record.parentFrameId;
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

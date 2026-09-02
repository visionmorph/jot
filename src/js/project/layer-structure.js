/* Shared layer parent relationships, ordering, movement, and nesting. */

function getFrameChildren(parentId) {
  return frameRecords.filter((record) => record.parentId === parentId);
}

function getTextChildren(parentFrameId) {
  return textRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getVectorChildren(parentFrameId) {
  return vectorRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getLayerChildren(parentFrameId) {
  return [
    ...getFrameChildren(parentFrameId).map((record) => ({ type: "frame", record })),
    ...getTextChildren(parentFrameId).map((record) => ({ type: "text", record })),
    ...getVectorChildren(parentFrameId).map((record) => ({ type: "vector", record })),
  ].sort((a, b) => a.record.order - b.record.order);
}

function canNestFrame(draggedFrameId, parentFrameId) {
  if (draggedFrameId === parentFrameId) return false;
  let ancestor = getFrameRecord(parentFrameId);

  while (ancestor) {
    if (ancestor.id === draggedFrameId) return false;
    ancestor = ancestor.parentId === null ? undefined : getFrameRecord(ancestor.parentId);
  }

  return true;
}

function getLayerParentId(layer) {
  if (layer.type === "frame") return getFrameRecord(layer.id)?.parentId ?? null;
  if (layer.type === "text") return getTextRecord(layer.id)?.parentFrameId ?? null;
  return getVectorRecord(layer.id)?.parentFrameId ?? null;
}

function getLayerRecord(layer) {
  if (layer.type === "frame") return getFrameRecord(layer.id);
  if (layer.type === "text") return getTextRecord(layer.id);
  return getVectorRecord(layer.id);
}

function normalizeSiblingOrder(parentFrameId) {
  getLayerChildren(parentFrameId).forEach((layer, index) => {
    layer.record.order = index + 1;
  });
  nextLayerOrder = Math.max(
    1,
    ...frameRecords.map((record) => record.order + 1),
    ...textRecords.map((record) => record.order + 1),
    ...vectorRecords.map((record) => record.order + 1),
  );
}

function syncLayerDomOrder(parentFrameId) {
  const parentElement = parentFrameId === null ? canvasRootStack : getFrameRecord(parentFrameId)?.element;
  if (!(parentElement instanceof HTMLElement)) return;
  getLayerChildren(parentFrameId).forEach((layer) => {
    parentElement.append(layer.record.element);
  });
}

function moveLayer(layer, parentFrameId, targetIndex, rootPosition) {
  const record = getLayerRecord(layer);
  if (!record) return false;
  if (layer.type === "frame" && parentFrameId !== null && !canNestFrame(layer.id, parentFrameId)) return false;

  const previousParentId = getLayerParentId(layer);
  const previousSiblings = getLayerChildren(previousParentId);
  const previousIndex = previousSiblings.findIndex((sibling) => sibling.type === layer.type && sibling.record.id === layer.id);
  const nextSiblings = getLayerChildren(parentFrameId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? nextSiblings.length, nextSiblings.length));
  if (previousParentId === parentFrameId && previousIndex === insertionIndex) return false;

  recordHistory();
  const element = record.element;
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
  const elementBounds = element.getBoundingClientRect();

  if (layer.type === "frame") record.parentId = parentFrameId;
  else record.parentFrameId = parentFrameId;

  if (parentFrameId === null) {
    const left = rootPosition?.x ?? (canvasBounds ? elementBounds.left - canvasBounds.left : 0);
    const top = rootPosition?.y ?? (canvasBounds ? elementBounds.top - canvasBounds.top : 0);
    element.style.left = `${Math.max(0, left)}px`;
    element.style.top = `${Math.max(0, top)}px`;
  } else {
    element.style.left = "";
    element.style.top = "";
    expandedFrameIds.add(parentFrameId);
  }

  nextSiblings.splice(insertionIndex, 0, { type: layer.type, record });
  nextSiblings.forEach((sibling, index) => {
    sibling.record.order = index + 1;
  });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentFrameId);
  syncLayerDomOrder(previousParentId);
  if (parentFrameId !== previousParentId) syncLayerDomOrder(parentFrameId);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return true;
}

function moveLayers(layers, parentFrameId, targetIndex) {
  const uniqueLayers = [...new Map(
    layers.map((layer) => [`${layer.type}:${layer.id}`, layer]),
  ).values()];
  if (uniqueLayers.length === 0) return false;
  if (uniqueLayers.length === 1) return moveLayer(uniqueLayers[0], parentFrameId, targetIndex);
  if (uniqueLayers.some((layer) => !getLayerRecord(layer))) return false;

  const previousParentIds = new Set(uniqueLayers.map(getLayerParentId));
  if (previousParentIds.size !== 1) return false;
  if (uniqueLayers.some(
    (layer) => layer.type === "frame" && parentFrameId !== null && !canNestFrame(layer.id, parentFrameId),
  )) return false;

  const previousParentId = uniqueLayers.length > 0 ? getLayerParentId(uniqueLayers[0]) : null;
  const movingKeys = new Set(uniqueLayers.map((layer) => `${layer.type}:${layer.id}`));
  const previousSiblings = getLayerChildren(previousParentId);
  const movingSiblings = previousSiblings.filter(
    (sibling) => movingKeys.has(`${sibling.type}:${sibling.record.id}`),
  );
  if (movingSiblings.length !== uniqueLayers.length) return false;

  const targetSiblings = getLayerChildren(parentFrameId).filter(
    (sibling) => !movingKeys.has(`${sibling.type}:${sibling.record.id}`),
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? targetSiblings.length, targetSiblings.length));
  const nextTargetSiblings = [...targetSiblings];
  nextTargetSiblings.splice(insertionIndex, 0, ...movingSiblings);

  if (previousParentId === parentFrameId) {
    const previousOrder = previousSiblings.map((sibling) => `${sibling.type}:${sibling.record.id}`);
    const nextOrder = nextTargetSiblings.map((sibling) => `${sibling.type}:${sibling.record.id}`);
    if (previousOrder.every((key, index) => key === nextOrder[index])) return false;
  }

  recordHistory();
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
  const rootPositions = new Map(movingSiblings.map((sibling) => {
    const bounds = sibling.record.element.getBoundingClientRect();
    return [`${sibling.type}:${sibling.record.id}`, {
      x: canvasBounds ? bounds.left - canvasBounds.left : 0,
      y: canvasBounds ? bounds.top - canvasBounds.top : 0,
    }];
  }));

  movingSiblings.forEach((sibling) => {
    if (sibling.type === "frame") sibling.record.parentId = parentFrameId;
    else sibling.record.parentFrameId = parentFrameId;
    if (parentFrameId === null) {
      const position = rootPositions.get(`${sibling.type}:${sibling.record.id}`);
      sibling.record.element.style.left = `${Math.max(0, position?.x ?? 0)}px`;
      sibling.record.element.style.top = `${Math.max(0, position?.y ?? 0)}px`;
    } else {
      sibling.record.element.style.left = "";
      sibling.record.element.style.top = "";
      expandedFrameIds.add(parentFrameId);
    }
  });

  if (previousParentId !== parentFrameId) {
    previousSiblings
      .filter((sibling) => !movingKeys.has(`${sibling.type}:${sibling.record.id}`))
      .forEach((sibling, index) => { sibling.record.order = index + 1; });
  }
  nextTargetSiblings.forEach((sibling, index) => { sibling.record.order = index + 1; });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentFrameId);
  syncLayerDomOrder(previousParentId);
  if (parentFrameId !== previousParentId) syncLayerDomOrder(parentFrameId);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return true;
}

function nestLayer(layer, parentFrameId) {
  return moveLayer(layer, parentFrameId, getLayerChildren(parentFrameId).length);
}

function moveLayerRelative(layer, targetLayer, position) {
  if (position === "inside" && targetLayer.type === "frame") {
    return nestLayer(layer, targetLayer.id);
  }

  const parentFrameId = getLayerParentId(targetLayer);
  const siblings = getLayerChildren(parentFrameId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const targetIndex = siblings.findIndex(
    (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
  );
  if (targetIndex < 0) return false;
  return moveLayer(layer, parentFrameId, targetIndex + (position === "after" ? 1 : 0));
}

function collectFrameAndDescendantIds(frameId) {
  const ids = new Set([frameId]);
  let foundChild = true;

  while (foundChild) {
    foundChild = false;
    frameRecords.forEach((record) => {
      if (record.parentId !== null && ids.has(record.parentId) && !ids.has(record.id)) {
        ids.add(record.id);
        foundChild = true;
      }
    });
  }

  return ids;
}

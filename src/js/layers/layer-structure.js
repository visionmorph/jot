/* Layer parent relationships, ordering, movement, and nesting. */

const LAYER_TYPES = Object.freeze(["frame", "text", "vector", "component-instance"]);

function findLayerNode(nodes, { type, id }) {
  return nodes.find((node) => node.type === type && node.id === id) ?? null;
}

function getLayerNodeChildren(nodes, parentId) {
  return nodes.filter((node) => node.parentId === parentId).sort((a, b) => a.order - b.order);
}

function getLayerNodeDescendants(nodes, layer) {
  const root = findLayerNode(nodes, layer);
  if (!root) return [];
  const result = [];
  const visited = new Set();
  const visit = (node) => {
    const key = `${node.type}:${node.id}`;
    if (visited.has(key)) return;
    visited.add(key);
    result.push(node);
    if (node.type === "frame") getLayerNodeChildren(nodes, node.id).forEach(visit);
  };
  visit(root);
  return result;
}

function getLayerChildren(parentId) {
  return getLayerNodeChildren(layerRecords, parentId).map((record) => ({ type: record.type, record }));
}

function getCollectionReorderIndex(items, movingKeys, step = 0, edge = null, getKey = (item) => item) {
  const movingKeySet = new Set(movingKeys);
  const firstMovingIndex = items.findIndex((item) => movingKeySet.has(getKey(item)));
  if (firstMovingIndex < 0) return null;
  const remainingItems = items.filter((item) => !movingKeySet.has(getKey(item)));
  const currentInsertionIndex = items
    .slice(0, firstMovingIndex)
    .filter((item) => !movingKeySet.has(getKey(item)))
    .length;
  if (edge === "back") return 0;
  if (edge === "front") return remainingItems.length;
  return Math.max(0, Math.min(remainingItems.length, currentInsertionIndex + step));
}

function canNestFrame(draggedFrameId, parentId) {
  if (draggedFrameId === parentId) return false;
  let ancestor = getFrameRecord(parentId);
  if (parentId !== null && !ancestor) return false;
  const visited = new Set();

  while (ancestor) {
    if (ancestor.id === draggedFrameId || visited.has(ancestor.id)) return false;
    visited.add(ancestor.id);
    ancestor = ancestor.parentId === null ? undefined : getFrameRecord(ancestor.parentId);
  }

  return true;
}

function getLayerParentId(layer) {
  return getLayerRecord(layer)?.parentId ?? null;
}

function getLayerRecord(layer) {
  if (layer?.kind || typeof layer === "string") {
    const key = toLocalLayerKey(layer, currentComponent?.id);
    if (!key) return null;
    const [type, id] = key.split(":");
    layer = { type, id: Number(id) };
  }
  return findLayerNode(layerRecords, layer);
}

function normalizeSiblingOrder(parentId) {
  getLayerChildren(parentId).forEach((layer, index) => {
    layer.record.order = index + 1;
  });
  nextLayerOrder = Math.max(
    1,
    ...layerRecords.map((record) => record.order + 1),
  );
}

function syncLayerDomOrder(parentId) {
  const parentElement = parentId === null ? canvasRootStack : getFrameRecord(parentId)?.element;
  if (!(parentElement instanceof HTMLElement)) return;
  getLayerChildren(parentId).forEach((layer) => {
    parentElement.append(layer.record.element);
  });
}

function moveLayer(layer, parentId, targetIndex, rootPosition) {
  const record = getLayerRecord(layer);
  if (!record) return false;
  if (parentId !== null && (parentId === 0 || !getFrameRecord(parentId))) return false;
  if (layer.type === "frame" && parentId !== null && !canNestFrame(layer.id, parentId)) return false;

  const previousParentId = getLayerParentId(layer);
  const previousSiblings = getLayerChildren(previousParentId);
  const previousIndex = previousSiblings.findIndex((sibling) => sibling.type === layer.type && sibling.record.id === layer.id);
  const nextSiblings = getLayerChildren(parentId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? nextSiblings.length, nextSiblings.length));
  if (previousParentId === parentId && previousIndex === insertionIndex) return false;

  recordHistory();
  const element = record.element;
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
  const elementBounds = element.getBoundingClientRect();

  record.parentId = parentId;

  if (parentId === null) {
    const left = rootPosition?.x ?? (canvasBounds ? elementBounds.left - canvasBounds.left : 0);
    const top = rootPosition?.y ?? (canvasBounds ? elementBounds.top - canvasBounds.top : 0);
    element.style.left = `${Math.max(0, left)}px`;
    element.style.top = `${Math.max(0, top)}px`;
  } else {
    element.style.left = "";
    element.style.top = "";
    expandedFrameIds.add(parentId);
  }

  nextSiblings.splice(insertionIndex, 0, { type: layer.type, record });
  nextSiblings.forEach((sibling, index) => {
    sibling.record.order = index + 1;
  });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentId);
  syncLayerDomOrder(previousParentId);
  if (parentId !== previousParentId) syncLayerDomOrder(parentId);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return true;
}

function moveLayers(layers, parentId, targetIndex) {
  const uniqueLayers = [...new Map(
    layers.map((layer) => [`${layer.type}:${layer.id}`, layer]),
  ).values()];
  if (uniqueLayers.length === 0) return false;
  if (uniqueLayers.length === 1) return moveLayer(uniqueLayers[0], parentId, targetIndex);
  if (uniqueLayers.some((layer) => !getLayerRecord(layer))) return false;
  if (parentId !== null && (parentId === 0 || !getFrameRecord(parentId))) return false;

  const previousParentIds = new Set(uniqueLayers.map(getLayerParentId));
  if (previousParentIds.size !== 1) return false;
  if (uniqueLayers.some(
    (layer) => layer.type === "frame" && parentId !== null && !canNestFrame(layer.id, parentId),
  )) return false;

  const previousParentId = uniqueLayers.length > 0 ? getLayerParentId(uniqueLayers[0]) : null;
  const movingKeys = new Set(uniqueLayers.map((layer) => `${layer.type}:${layer.id}`));
  const previousSiblings = getLayerChildren(previousParentId);
  const movingSiblings = previousSiblings.filter(
    (sibling) => movingKeys.has(`${sibling.type}:${sibling.record.id}`),
  );
  if (movingSiblings.length !== uniqueLayers.length) return false;

  const targetSiblings = getLayerChildren(parentId).filter(
    (sibling) => !movingKeys.has(`${sibling.type}:${sibling.record.id}`),
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? targetSiblings.length, targetSiblings.length));
  const nextTargetSiblings = [...targetSiblings];
  nextTargetSiblings.splice(insertionIndex, 0, ...movingSiblings);

  if (previousParentId === parentId) {
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
    sibling.record.parentId = parentId;
    if (parentId === null) {
      const position = rootPositions.get(`${sibling.type}:${sibling.record.id}`);
      sibling.record.element.style.left = `${Math.max(0, position?.x ?? 0)}px`;
      sibling.record.element.style.top = `${Math.max(0, position?.y ?? 0)}px`;
    } else {
      sibling.record.element.style.left = "";
      sibling.record.element.style.top = "";
      expandedFrameIds.add(parentId);
    }
  });

  if (previousParentId !== parentId) {
    previousSiblings
      .filter((sibling) => !movingKeys.has(`${sibling.type}:${sibling.record.id}`))
      .forEach((sibling, index) => { sibling.record.order = index + 1; });
  }
  nextTargetSiblings.forEach((sibling, index) => { sibling.record.order = index + 1; });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentId);
  syncLayerDomOrder(previousParentId);
  if (parentId !== previousParentId) syncLayerDomOrder(parentId);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return true;
}

function nestLayer(layer, parentId) {
  return moveLayer(layer, parentId, getLayerChildren(parentId).length);
}

function moveLayerRelative(layer, targetLayer, position) {
  if (!getLayerRecord(targetLayer) || !["inside", "before", "after"].includes(position)) return false;
  if (position === "inside" && targetLayer.type !== "frame") return false;
  if (position === "inside" && targetLayer.type === "frame") {
    return nestLayer(layer, targetLayer.id);
  }

  const parentId = getLayerParentId(targetLayer);
  const siblings = getLayerChildren(parentId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const targetIndex = siblings.findIndex(
    (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
  );
  if (targetIndex < 0) return false;
  return moveLayer(layer, parentId, targetIndex + (position === "after" ? 1 : 0));
}

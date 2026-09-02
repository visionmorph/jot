/* Coordinates canvas hit detection, shared drag sessions, and committed moves. */

let canvasDragSession = null;

function isSameLayerDescriptor(first, second) {
  return Boolean(first && second && first.type === second.type && first.id === second.id);
}

function getLayerDescriptorKey(layer) {
  return layer ? `${layer.type}:${layer.id}` : "";
}

function normalizeCanvasDraggedLayers(layers) {
  const candidates = Array.isArray(layers) ? layers : [layers];
  return [...new Map(
    candidates.filter(Boolean).map((layer) => [getLayerDescriptorKey(layer), layer]),
  ).values()];
}

function isCanvasDraggedLayer(layer, draggedLayers) {
  const key = getLayerDescriptorKey(layer);
  return normalizeCanvasDraggedLayers(draggedLayers).some((candidate) => getLayerDescriptorKey(candidate) === key);
}

function getOrderedCanvasDragLayers(anchorLayer) {
  const selectedKeys = new Set(getSelectedLayerKeys());
  const anchorKey = getLayerDescriptorKey(anchorLayer);
  if (selectedKeys.size < 2 || !selectedKeys.has(anchorKey)) return [anchorLayer];
  const parentFrameId = getLayerParentId(anchorLayer);
  return getLayerChildren(parentFrameId)
    .map((sibling) => ({ type: sibling.type, id: sibling.record.id }))
    .filter((layer) => selectedKeys.has(getLayerDescriptorKey(layer)));
}

function resolveCanvasHit(target) {
  if (!(target instanceof Element) || !(canvas instanceof HTMLElement) || !canvas.contains(target)) {
    return { kind: "outside", target };
  }

  const resizeControl = target.closest("[data-resize-handle]");
  if (resizeControl instanceof HTMLElement && resizeOverlay.contains(resizeControl)) {
    return {
      kind: "resize-control",
      target,
      element: resizeControl,
      direct: target === resizeControl,
    };
  }

  const variantPreview = target.closest(".variant-preview");
  if (variantPreview instanceof HTMLElement && componentSet?.contains(variantPreview)) {
    const instanceId = Number(variantPreview.dataset.variantInstanceId);
    const layerElement = target.closest(".canvas-frame, .canvas-text, .canvas-vector");
    const layer = getCanvasLayerDescriptor(layerElement);
    if (layerElement instanceof HTMLElement && layer && variantPreview.contains(layerElement)) {
      return {
        kind: "variant-layer",
        target,
        element: layerElement,
        layer,
        instanceId,
        preview: variantPreview,
        direct: target === layerElement,
      };
    }
    const root = variantPreview.querySelector(".canvas-root-stack");
    return {
      kind: "variant-root",
      target,
      element: root instanceof HTMLElement ? root : variantPreview,
      instanceId,
      preview: variantPreview,
      direct: target === root,
    };
  }

  const layerElement = target.closest(".canvas-frame, .canvas-text, .canvas-vector");
  const layer = getCanvasLayerDescriptor(layerElement);
  if (layerElement instanceof HTMLElement && layer && canvasRootStack?.contains(layerElement)) {
    return {
      kind: "layer",
      target,
      element: layerElement,
      layer,
      direct: target === layerElement,
    };
  }

  if (canvasRootStack instanceof HTMLElement && canvasRootStack.contains(target)) {
    return {
      kind: "component-root",
      target,
      element: canvasRootStack,
      direct: target === canvasRootStack,
    };
  }
  if (target === componentSet) return { kind: "component-set", target, element: componentSet, direct: true };
  if (target === canvas) return { kind: "canvas", target, element: canvas, direct: true };
  return { kind: "canvas-ui", target, element: target, direct: true };
}

function startCanvasDragSession(
  draggedLayer,
  deferDraggingStyle = false,
  draggedLayersInput = null,
  variantInstanceId = null,
) {
  const requestedLayers = normalizeCanvasDraggedLayers(
    draggedLayersInput ?? getOrderedCanvasDragLayers(draggedLayer),
  );
  const record = getLayerRecord(draggedLayer);
  if (!record || !(record.element instanceof HTMLElement) || requestedLayers.length === 0) return null;
  if (
    canvasDragSession
    && canvasDragSession.variantInstanceId === variantInstanceId
    && isSameLayerDescriptor(canvasDragSession.draggedLayer, draggedLayer)
    && canvasDragSession.draggedLayers.length === requestedLayers.length
    && canvasDragSession.draggedLayers.every(
      (layer, index) => getLayerDescriptorKey(layer) === getLayerDescriptorKey(requestedLayers[index]),
    )
  ) {
    return canvasDragSession;
  }
  clearCanvasDragSession();
  const originalParentId = getLayerParentId(draggedLayer);
  if (requestedLayers.some((layer) => getLayerParentId(layer) !== originalParentId)) return null;
  const originalSiblings = getLayerChildren(originalParentId);
  const requestedKeys = new Set(requestedLayers.map(getLayerDescriptorKey));
  const movingSiblings = originalSiblings.filter(
    (sibling) => requestedKeys.has(getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id })),
  );
  if (movingSiblings.length !== requestedLayers.length) return null;
  const draggedLayers = movingSiblings.map((sibling) => ({ type: sibling.type, id: sibling.record.id }));
  const elements = movingSiblings.map((sibling) => getCanvasLayerElement(
    { type: sibling.type, id: sibling.record.id },
    variantInstanceId,
  ));
  if (elements.some((element) => !(element instanceof HTMLElement))) return null;
  const firstMovingIndex = originalSiblings.findIndex(
    (sibling) => requestedKeys.has(getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id })),
  );
  const originalIndex = originalSiblings
    .slice(0, Math.max(0, firstMovingIndex))
    .filter((sibling) => !requestedKeys.has(getLayerDescriptorKey({ type: sibling.type, id: sibling.record.id })))
    .length;
  const parentElement = getCanvasParentElement(originalParentId, variantInstanceId);
  if (!(parentElement instanceof HTMLElement)) return null;
  const { placeholder, placeholderItems } = createCanvasDragPlaceholder(elements, parentElement);
  elements[0].insertAdjacentElement("beforebegin", placeholder);
  canvasDragSession = {
    draggedLayer,
    draggedLayers,
    element: elements[0],
    elements,
    variantInstanceId,
    placeholder,
    placeholderItems,
    preview: null,
    originalParentId,
    originalIndex,
    intent: null,
    targetElement: null,
    insideLock: null,
  };
  const applyDraggingStyle = () => {
    if (canvasDragSession?.element !== elements[0]) return;
    canvasDragSession.elements.forEach((element) => element.classList.add("is-canvas-dragging"));
  };
  if (deferDraggingStyle) requestAnimationFrame(applyDraggingStyle);
  else applyDraggingStyle();
  resizeOverlay.hidden = true;
  return canvasDragSession;
}

function commitCanvasLayerDrop(draggedLayer, intent) {
  const draggedLayers = canvasDragSession?.draggedLayers
    ?? normalizeCanvasDraggedLayers(draggedLayer);
  const variantInstanceId = canvasDragSession?.variantInstanceId ?? null;
  const previousPositions = captureCanvasLayerPositions(true);
  clearCanvasDragSession();
  const didMove = draggedLayers.length > 1
    ? moveLayers(draggedLayers, intent.parentFrameId, intent.targetIndex)
    : moveLayer(draggedLayers[0], intent.parentFrameId, intent.targetIndex);
  animateCanvasLayerReflow(previousPositions, variantInstanceId);
  return didMove;
}

function clearCanvasDragSession() {
  if (!canvasDragSession) return;
  clearCanvasDropTarget();
  canvasDragSession.preview?.remove();
  canvasDragSession.placeholder.remove();
  canvasDragSession.elements.forEach((element) => element.classList.remove("is-canvas-dragging"));
  canvasDragSession = null;
  requestAnimationFrame(syncResizeOverlay);
}

canvas?.addEventListener("dragover", (event) => {
  if (hasFileTransfer(event.dataTransfer)) return;
  const draggedLayer = canvasDragSession?.draggedLayer ?? getLayerDragData(event);
  if (!draggedLayer) return;
  const session = canvasDragSession ?? startCanvasDragSession(draggedLayer);
  const intent = session ? getCanvasDropIntent(event, session.draggedLayers) : null;
  if (!intent) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "move";
  previewCanvasDropIntent(intent);
}, true);

canvas?.addEventListener("dragleave", (event) => {
  if (!canvasDragSession || !(canvas instanceof HTMLElement)) return;
  const bounds = canvas.getBoundingClientRect();
  const isOutside = event.clientX <= bounds.left
    || event.clientX >= bounds.right
    || event.clientY <= bounds.top
    || event.clientY >= bounds.bottom;
  if (isOutside) restoreCanvasDragPreview();
}, true);

canvas?.addEventListener("drop", (event) => {
  if (hasFileTransfer(event.dataTransfer)) return;
  const draggedLayer = canvasDragSession?.draggedLayer ?? getLayerDragData(event);
  if (!draggedLayer) return;
  const intent = getCanvasDropIntent(
    event,
    canvasDragSession?.draggedLayers ?? [draggedLayer],
  ) ?? canvasDragSession?.intent;
  if (!intent) return;
  event.preventDefault();
  event.stopPropagation();
  commitCanvasLayerDrop(draggedLayer, intent);
}, true);

document.addEventListener("dragend", clearCanvasDragSession);

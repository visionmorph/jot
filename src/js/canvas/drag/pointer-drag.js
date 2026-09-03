/* Handles pointer-driven canvas drag gestures and floating previews. */

let canvasPointerDrag = null;

const CANVAS_DRAG_THRESHOLD = 4;

function getOrderedVariantDragLayers(anchorLayer, instanceId) {
  const selectedTargets = new Set(
    selectedVariantInstanceId === instanceId ? getSelectedVariantLayerTargets() : [],
  );
  const anchorKey = getLayerDescriptorKey(anchorLayer);
  if (selectedTargets.size < 2 || !selectedTargets.has(anchorKey)) return [anchorLayer];
  const parentFrameId = getLayerParentId(anchorLayer);
  return getLayerChildren(parentFrameId)
    .map((sibling) => ({ type: sibling.type, id: sibling.record.id }))
    .filter((layer) => selectedTargets.has(getLayerDescriptorKey(layer)));
}

function selectDraggedCanvasLayer(layer) {
  const record = getLayerRecord(layer);
  if (!record) return;
  if (layer.type === "frame") selectCanvasFrame(record.element);
  else if (layer.type === "text") selectCanvasText(record.element);
  else selectCanvasVector(record.element);
}

function getPointerCanvasDropIntent(event, draggedLayers) {
  if (!(canvas instanceof HTMLElement)) return null;
  const canvasBounds = canvas.getBoundingClientRect();
  const isInsideCanvas = event.clientX >= canvasBounds.left
    && event.clientX <= canvasBounds.right
    && event.clientY >= canvasBounds.top
    && event.clientY <= canvasBounds.bottom;
  if (!isInsideCanvas) return null;
  const insideLock = canvasDragSession?.insideLock;
  if (
    insideLock
    && event.clientX >= insideLock.left
    && event.clientX <= insideLock.right
    && event.clientY >= insideLock.top
    && event.clientY <= insideLock.bottom
  ) return insideLock.intent;
  if (canvasDragSession) canvasDragSession.insideLock = null;
  const target = document.elementFromPoint(event.clientX, event.clientY);
  return getCanvasDropIntent({
    target,
    clientX: event.clientX,
    clientY: event.clientY,
  }, draggedLayers, canvasDragSession?.variantInstanceId ?? null);
}

function createCanvasPointerDragPreview(pointerDrag, event) {
  if (!canvasDragSession || canvasDragSession.preview) return;
  const preview = document.createElement("div");
  preview.className = "canvas-drag-preview canvas-drag-preview-group";
  preview.setAttribute("aria-hidden", "true");
  preview.style.display = "flex";
  preview.style.width = "max-content";
  preview.style.height = "max-content";
  const parentElement = getCanvasParentElement(
    canvasDragSession.originalParentId,
    canvasDragSession.variantInstanceId,
  );
  if (parentElement instanceof HTMLElement) syncCanvasDragGroupLayout(preview, parentElement);
  pointerDrag.items.forEach(({ layer, element, width, height }) => {
    const item = element.cloneNode(true);
    item.classList.remove("is-canvas-dragging");
    item.classList.add("canvas-drag-preview-item");
    if (layer.type === "text") {
      const textStyle = getComputedStyle(element);
      item.classList.remove("canvas-text", "is-selected", "is-selection-hovered", "is-new-empty");
      item.classList.add("canvas-drag-preview-text");
      item.removeAttribute("data-text-id");
      item.removeAttribute("aria-label");
      item.removeAttribute("aria-selected");
      item.removeAttribute("contenteditable");
      item.style.setProperty("color", element.style.color || textStyle.color, "important");
      item.style.fontFamily = textStyle.fontFamily;
      item.style.fontSize = textStyle.fontSize;
      item.style.fontWeight = textStyle.fontWeight;
      item.style.letterSpacing = textStyle.letterSpacing;
      item.style.lineHeight = textStyle.lineHeight;
      item.style.textAlign = textStyle.textAlign;
      item.style.whiteSpace = textStyle.whiteSpace;
      item.style.overflowWrap = textStyle.overflowWrap;
    }
    item.removeAttribute("draggable");
    item.style.width = `${width}px`;
    item.style.height = `${height}px`;
    item.style.flex = "0 0 auto";
    preview.append(item);
  });
  canvasDragSession.preview = preview;
  document.body.append(preview);
  positionCanvasPointerDragPreview(pointerDrag, event);
}

function positionCanvasPointerDragPreview(pointerDrag, event) {
  const preview = canvasDragSession?.preview;
  if (!(preview instanceof HTMLElement)) return;
  preview.style.left = `${event.clientX - pointerDrag.grabOffsetX}px`;
  preview.style.top = `${event.clientY - pointerDrag.grabOffsetY}px`;
}

function syncCanvasPointerDragSourceElements(pointerDrag = canvasPointerDrag) {
  if (!pointerDrag?.hasStarted) return;
  const sourceElements = pointerDrag.draggedLayers
    .map((layer) => getCanvasLayerElement(layer, pointerDrag.variantInstanceId))
    .filter((element) => element instanceof HTMLElement);
  if (sourceElements.length === 0) return;
  pointerDrag.sourceElements = sourceElements;
  sourceElements.forEach((element) => {
    element.classList.add("is-canvas-pointer-drag-source");
  });
}

function updateCanvasPointerDrag(event) {
  if (!canvasPointerDrag || event.pointerId !== canvasPointerDrag.pointerId) return false;
  const distance = Math.hypot(
    event.clientX - canvasPointerDrag.startX,
    event.clientY - canvasPointerDrag.startY,
  );
  if (!canvasPointerDrag.hasStarted && distance < CANVAS_DRAG_THRESHOLD) return false;

  if (!canvasPointerDrag.hasStarted) {
    canvasPointerDrag.hasStarted = true;
    if (canvasPointerDrag.element.isConnected
      && !canvasPointerDrag.element.hasPointerCapture(event.pointerId)) {
      canvasPointerDrag.element.setPointerCapture(event.pointerId);
    }
    if (canvasPointerDrag.draggedLayers.length === 1) {
      selectDraggedCanvasLayer(canvasPointerDrag.draggedLayer);
    }
    startCanvasDragSession(
      canvasPointerDrag.draggedLayer,
      false,
      canvasPointerDrag.draggedLayers,
      canvasPointerDrag.variantInstanceId,
    );
    syncCanvasPointerDragSourceElements();
    canvasPointerDrag.sourceObserver = new MutationObserver(() => {
      syncCanvasPointerDragSourceElements(canvasPointerDrag);
    });
    canvasPointerDrag.sourceObserver.observe(canvas, { childList: true, subtree: true });
    createCanvasPointerDragPreview(canvasPointerDrag, event);
  }

  event.preventDefault();
  event.stopPropagation();
  positionCanvasPointerDragPreview(canvasPointerDrag, event);
  const intent = getPointerCanvasDropIntent(event, canvasPointerDrag.draggedLayers);
  if (intent) previewCanvasDropIntent(intent);
  else restoreCanvasDragPreview();
  syncCanvasPointerDragSourceElements();
  return true;
}

function finishCanvasPointerDrag(event, shouldCommit) {
  if (!canvasPointerDrag || event.pointerId !== canvasPointerDrag.pointerId) return;
  const pointerDrag = canvasPointerDrag;
  if (pointerDrag.hasStarted) updateCanvasPointerDrag(event);
  const intent = shouldCommit ? canvasDragSession?.intent ?? null : null;
  canvasPointerDrag = null;
  pointerDrag.sourceObserver?.disconnect();

  pointerDrag.items.forEach(({ element, wasDraggable }) => { element.draggable = wasDraggable; });
  if (pointerDrag.element.hasPointerCapture(event.pointerId)) {
    pointerDrag.element.releasePointerCapture(event.pointerId);
  }
  if (!pointerDrag.hasStarted) {
    if (pointerDrag.collapseVariantSelectionOnClick && pointerDrag.variantInstanceId !== null) {
      selectVariantInstance(pointerDrag.variantInstanceId, {
        render: false,
        layerTargets: [getLayerDescriptorKey(pointerDrag.draggedLayer)],
        anchorTarget: getLayerDescriptorKey(pointerDrag.draggedLayer),
      });
    }
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  if (intent) commitCanvasLayerDrop(pointerDrag.draggedLayer, intent);
  else clearCanvasDragSession();
  (pointerDrag.sourceElements ?? pointerDrag.items.map(({ element }) => element)).forEach((element) => {
    element.classList.remove("is-canvas-pointer-drag-source");
  });
  suppressCanvasClickForGesture(event);
}

canvas?.addEventListener("pointerdown", (event) => {
  if (
    event.button !== 0
    || !event.isPrimary
    || activeTool !== "select"
    || canvasPointerDrag
    || resizeInteraction
  ) return;
  const hit = resolveCanvasHit(event.target);
  const isVariantLayer = hit.kind === "variant-layer";
  const element = hit.kind === "layer" || isVariantLayer ? hit.element : null;
  const draggedLayer = hit.kind === "layer" || isVariantLayer ? hit.layer : null;
  if (!(element instanceof HTMLElement) || !draggedLayer || element.isContentEditable) return;
  const variantInstanceId = isVariantLayer ? hit.instanceId : null;
  const additive = event.shiftKey || event.ctrlKey || event.metaKey;
  let collapseVariantSelectionOnClick = false;
  if (variantInstanceId !== null) {
    const target = getLayerDescriptorKey(draggedLayer);
    const wasSelected = isVariantLayerTargetSelected(variantInstanceId, target);
    const wasGroupSelection = selectedVariantInstanceId === variantInstanceId
      && selectedVariantLayerTargets.size > 1;
    if (additive) {
      const didSelect = selectVariantLayerTarget(variantInstanceId, target, true);
      if (didSelect) {
        selectVariantInstance(variantInstanceId, {
          render: false,
          layerTargets: getSelectedVariantLayerTargets(),
          anchorTarget: selectedVariantLayerTarget,
        });
      } else {
        clearMasterSelectionForVariant();
        renderTree();
      }
      if (wasSelected) return;
    } else if (wasSelected && wasGroupSelection) {
      collapseVariantSelectionOnClick = true;
    } else {
      selectVariantInstance(variantInstanceId, {
        render: false,
        layerTargets: [target],
        anchorTarget: target,
      });
    }
  }
  const draggedLayers = variantInstanceId === null
    ? getOrderedCanvasDragLayers(draggedLayer)
    : getOrderedVariantDragLayers(draggedLayer, variantInstanceId);
  const isDraggingSelection = draggedLayers.length > 1;
  if (variantInstanceId === null
    && !event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && !isDraggingSelection) {
    selectDraggedCanvasLayer(draggedLayer);
  }
  element.focus({ preventScroll: true });
  const items = draggedLayers.map((layer) => {
    const itemElement = getCanvasLayerElement(layer, variantInstanceId);
    if (!(itemElement instanceof HTMLElement)) return null;
    const bounds = itemElement.getBoundingClientRect();
    return {
      layer,
      element: itemElement,
      width: bounds.width,
      height: bounds.height,
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
      wasDraggable: itemElement.draggable,
    };
  }).filter(Boolean);
  if (items.length !== draggedLayers.length) return;
  const groupBounds = {
    left: Math.min(...items.map((item) => item.left)),
    top: Math.min(...items.map((item) => item.top)),
  };

  canvasPointerDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    grabOffsetX: event.clientX - groupBounds.left,
    grabOffsetY: event.clientY - groupBounds.top,
    draggedLayer,
    draggedLayers,
    variantInstanceId,
    collapseVariantSelectionOnClick,
    element,
    items,
    hasStarted: false,
  };
  items.forEach((item) => { item.element.draggable = false; });
}, true);

canvas?.addEventListener("pointermove", (event) => {
  updateCanvasPointerDrag(event);
}, true);

canvas?.addEventListener("pointerup", (event) => {
  finishCanvasPointerDrag(event, true);
}, true);

canvas?.addEventListener("pointercancel", (event) => {
  finishCanvasPointerDrag(event, false);
}, true);

canvas?.addEventListener("lostpointercapture", (event) => {
  if (canvasPointerDrag?.pointerId === event.pointerId) finishCanvasPointerDrag(event, false);
}, true);

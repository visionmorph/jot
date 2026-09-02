/* Canvas layer hit detection, drag-and-drop placement, previews, and pointer interactions. */

let canvasDragSession = null;

let canvasPointerDrag = null;

const CANVAS_DRAG_THRESHOLD = 4;

const CANVAS_REFLOW_DURATION = 160;

const CANVAS_REFLOW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const canvasReflowAnimations = new WeakMap();

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

function getVariantPreviewRoot(instanceId) {
  const preview = componentSet?.querySelector(
    `.variant-preview[data-variant-instance-id="${CSS.escape(String(instanceId))}"]`,
  );
  const root = preview?.querySelector(".canvas-root-stack");
  return root instanceof HTMLElement ? root : null;
}

function getCanvasLayerElement(layer, variantInstanceId = null) {
  if (variantInstanceId === null) return getLayerRecord(layer)?.element ?? null;
  const root = getVariantPreviewRoot(variantInstanceId);
  return root ? findVariantTarget(root, getLayerDescriptorKey(layer)) : null;
}

function getCanvasParentElement(parentFrameId, variantInstanceId = null) {
  if (variantInstanceId !== null) {
    const root = getVariantPreviewRoot(variantInstanceId);
    if (!root) return null;
    return parentFrameId === null ? root : findVariantTarget(root, `frame:${parentFrameId}`);
  }
  return parentFrameId === null ? canvasRootStack : getFrameRecord(parentFrameId)?.element ?? null;
}

function canMoveCanvasLayerToParent(layer, parentFrameId) {
  return layer.type !== "frame" || parentFrameId === null || canNestFrame(layer.id, parentFrameId);
}

function getCanvasInsertionIndex(parentFrameId, draggedLayers, clientX, clientY, variantInstanceId = null) {
  const parentElement = getCanvasParentElement(parentFrameId, variantInstanceId);
  if (!(parentElement instanceof HTMLElement)) return 0;
  const isVertical = parentElement.dataset.direction === "vertical";
  const pointerPosition = isVertical ? clientY : clientX;
  const siblings = getLayerChildren(parentFrameId).filter(
    (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
  );

  const insertionIndex = siblings.findIndex((sibling) => {
    const element = getCanvasLayerElement(
      { type: sibling.type, id: sibling.record.id },
      variantInstanceId,
    );
    if (!(element instanceof HTMLElement)) return false;
    const bounds = element.getBoundingClientRect();
    const midpoint = isVertical
      ? bounds.top + bounds.height / 2
      : bounds.left + bounds.width / 2;
    return pointerPosition < midpoint;
  });
  return insertionIndex < 0 ? siblings.length : insertionIndex;
}

function getCanvasDropIntent(event, draggedLayersInput, variantInstanceId = null) {
  if (!(canvasRootStack instanceof HTMLElement)) return null;
  const draggedLayers = normalizeCanvasDraggedLayers(draggedLayersInput);
  if (draggedLayers.length === 0) return null;
  const hit = resolveCanvasHit(event.target);
  const expectedLayerKind = variantInstanceId === null ? "layer" : "variant-layer";
  const expectedRootKind = variantInstanceId === null ? "component-root" : "variant-root";
  const hitMatchesContext = hit.kind === expectedLayerKind
    && (variantInstanceId === null || hit.instanceId === variantInstanceId);
  const targetElement = hitMatchesContext ? hit.element : null;
  const targetLayer = hitMatchesContext ? hit.layer : null;

  if (targetLayer && isCanvasDraggedLayer(targetLayer, draggedLayers)) return null;

  if (targetElement && targetLayer) {
    const targetBounds = targetElement.getBoundingClientRect();
    const horizontalRatio = targetBounds.width > 0 ? (event.clientX - targetBounds.left) / targetBounds.width : 0.5;
    const verticalRatio = targetBounds.height > 0 ? (event.clientY - targetBounds.top) / targetBounds.height : 0.5;
    const isCurrentParent = targetLayer.type === "frame"
      && draggedLayers.every((layer) => getLayerParentId(layer) === targetLayer.id);
    if (isCurrentParent) {
      const targetIndex = getCanvasInsertionIndex(
        targetLayer.id,
        draggedLayers,
        event.clientX,
        event.clientY,
        variantInstanceId,
      );
      return {
        parentFrameId: targetLayer.id,
        targetIndex,
        mode: "within",
        targetElement: null,
        key: `${targetLayer.id}:${targetIndex}:within`,
      };
    }
    const canNestInside = targetLayer.type === "frame"
      && draggedLayers.every((layer) => layer.type !== "frame")
      && horizontalRatio >= 0.25
      && horizontalRatio <= 0.75
      && verticalRatio >= 0.25
      && verticalRatio <= 0.75
      && draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, targetLayer.id));

    if (canNestInside) {
      const targetIndex = getLayerChildren(targetLayer.id).filter(
        (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
      ).length;
      return {
        parentFrameId: targetLayer.id,
        targetIndex,
        mode: "inside",
        targetElement,
        key: `${targetLayer.id}:${targetIndex}:inside`,
      };
    }

    const parentFrameId = getLayerParentId(targetLayer);
    if (!draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, parentFrameId))) return null;
    const parentElement = getCanvasParentElement(parentFrameId, variantInstanceId);
    const isVertical = parentElement?.dataset.direction === "vertical";
    const targetRatio = isVertical ? verticalRatio : horizontalRatio;
    const siblings = getLayerChildren(parentFrameId).filter(
      (sibling) => !isCanvasDraggedLayer({ type: sibling.type, id: sibling.record.id }, draggedLayers),
    );
    const targetIndex = siblings.findIndex(
      (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
    );
    if (targetIndex < 0) return null;
    const mode = targetRatio < 0.5 ? "before" : "after";
    const insertionIndex = targetIndex + (mode === "after" ? 1 : 0);
    return {
      parentFrameId,
      targetIndex: insertionIndex,
      mode,
      targetElement,
      key: `${parentFrameId ?? "root"}:${insertionIndex}:${mode}`,
    };
  }

  const parentElement = hit.kind === expectedRootKind
    && (variantInstanceId === null || hit.instanceId === variantInstanceId)
    ? hit.element
    : event.target instanceof Element
      ? event.target.closest(".canvas-frame, [data-canvas-root-stack]")
      : null;
  if (variantInstanceId !== null && !getVariantPreviewRoot(variantInstanceId)?.contains(parentElement)) return null;
  const parentFrameId = parentElement instanceof HTMLElement && parentElement.classList.contains("canvas-frame")
    ? Number(parentElement.dataset.frameId)
    : null;
  if (!draggedLayers.every((layer) => canMoveCanvasLayerToParent(layer, parentFrameId))) return null;
  const targetIndex = getCanvasInsertionIndex(
    parentFrameId,
    draggedLayers,
    event.clientX,
    event.clientY,
    variantInstanceId,
  );
  return {
    parentFrameId,
    targetIndex,
    mode: "inside",
    targetElement: getCanvasParentElement(parentFrameId, variantInstanceId),
    key: `${parentFrameId ?? "root"}:${targetIndex}:inside`,
  };
}

function syncCanvasDragGroupLayout(group, parentElement) {
  if (!(group instanceof HTMLElement) || !(parentElement instanceof HTMLElement)) return;
  const style = getComputedStyle(parentElement);
  const isVertical = parentElement.dataset.direction === "vertical" || style.flexDirection === "column";
  group.style.flexDirection = isVertical ? "column" : "row";
  group.style.gap = isVertical ? style.rowGap : style.columnGap;
  group.style.alignItems = style.alignItems;
}

function createCanvasDragPlaceholder(elements, parentElement) {
  const placeholder = document.createElement("div");
  const placeholderItems = new Map();
  placeholder.className = "canvas-drop-placeholder canvas-drop-placeholder-group";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.style.display = "flex";
  placeholder.style.flex = "0 0 auto";
  placeholder.style.alignSelf = getComputedStyle(elements[0]).alignSelf;
  syncCanvasDragGroupLayout(placeholder, parentElement);
  elements.forEach((element) => {
    const bounds = element.getBoundingClientRect();
    const item = document.createElement("div");
    item.className = "canvas-drop-placeholder-item";
    item.style.width = `${bounds.width}px`;
    item.style.height = `${bounds.height}px`;
    item.style.flex = "0 0 auto";
    item.style.alignSelf = getComputedStyle(element).alignSelf;
    placeholder.append(item);
    placeholderItems.set(element, item);
  });
  return { placeholder, placeholderItems };
}

function captureCanvasItemPositions(elements, getKey = (element) => element, getBounds = (element) => element.getBoundingClientRect()) {
  const positions = new Map();
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const bounds = getBounds(element);
    positions.set(getKey(element), {
      left: bounds.left,
      top: bounds.top,
    });
  });
  elements.forEach((element) => {
    const activeAnimation = canvasReflowAnimations.get(element);
    activeAnimation?.cancel();
    canvasReflowAnimations.delete(element);
  });
  const activeResizeAnimation = canvasReflowAnimations.get(resizeOverlay);
  activeResizeAnimation?.cancel();
  canvasReflowAnimations.delete(resizeOverlay);
  return positions;
}

function captureCanvasLayerPositions(
  usePlaceholderForDraggedLayer = false,
  variantInstanceId = canvasDragSession?.variantInstanceId ?? null,
) {
  const root = variantInstanceId === null ? canvasRootStack : getVariantPreviewRoot(variantInstanceId);
  if (!(root instanceof HTMLElement)) return new Map();
  const elements = Array.from(root.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector"));
  return captureCanvasItemPositions(
    elements,
    (element) => variantInstanceId === null
      ? element
      : getLayerDescriptorKey(getCanvasLayerDescriptor(element)),
    (element) => {
      const placeholderItem = usePlaceholderForDraggedLayer
        ? canvasDragSession?.placeholderItems.get(element)
        : null;
      return placeholderItem?.isConnected
        ? placeholderItem.getBoundingClientRect()
        : element.getBoundingClientRect();
    },
  );
}

function animateCanvasItemReflow(previousPositions, elements, {
  getKey = (element) => element,
  getAnimatedAncestor = () => null,
} = {}) {
  if (
    previousPositions.size === 0
    || typeof Element.prototype.animate !== "function"
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) return;

  const movements = new Map();
  elements.forEach((element) => {
    if (!(element instanceof HTMLElement) || !element.isConnected || element.classList.contains("is-canvas-dragging")) return;
    const previous = previousPositions.get(getKey(element));
    if (!previous) return;
    const bounds = element.getBoundingClientRect();
    const x = previous.left - bounds.left;
    const y = previous.top - bounds.top;
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
    movements.set(element, { x, y });
  });

  const trackAnimation = (element, animation) => {
    canvasReflowAnimations.set(element, animation);
    animation.addEventListener("finish", () => {
      if (canvasReflowAnimations.get(element) === animation) canvasReflowAnimations.delete(element);
    }, { once: true });
    animation.addEventListener("cancel", () => {
      if (canvasReflowAnimations.get(element) === animation) canvasReflowAnimations.delete(element);
    }, { once: true });
  };

  const selectedResizeElement = getSelectedResizeElement();
  let resizeMovement = selectedResizeElement instanceof HTMLElement
    ? movements.get(selectedResizeElement)
    : null;
  if (!resizeMovement && selectedResizeElement instanceof HTMLElement) {
    const movingAncestors = Array.from(movements.entries())
      .filter(([element]) => element.contains(selectedResizeElement));
    resizeMovement = movingAncestors[movingAncestors.length - 1]?.[1] ?? null;
  }
  if (resizeMovement) {
    positionResizeOverlay();
    const animation = resizeOverlay.animate(
      [
        { transform: `translate(${resizeMovement.x}px, ${resizeMovement.y}px)` },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: CANVAS_REFLOW_DURATION,
        easing: CANVAS_REFLOW_EASING,
      },
    );
    trackAnimation(resizeOverlay, animation);
  }

  movements.forEach((movement, element) => {
    const animatedAncestor = getAnimatedAncestor(element);
    const ancestorMovement = animatedAncestor ? movements.get(animatedAncestor) : null;
    const x = movement.x - (ancestorMovement?.x ?? 0);
    const y = movement.y - (ancestorMovement?.y ?? 0);
    if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5) return;
    const animation = element.animate(
      [
        { transform: `translate(${x}px, ${y}px)` },
        { transform: "translate(0, 0)" },
      ],
      {
        duration: CANVAS_REFLOW_DURATION,
        easing: CANVAS_REFLOW_EASING,
      },
    );
    trackAnimation(element, animation);
  });
}

function animateCanvasLayerReflow(previousPositions, variantInstanceId = null) {
  const root = variantInstanceId === null ? canvasRootStack : getVariantPreviewRoot(variantInstanceId);
  if (!(root instanceof HTMLElement)) return;
  animateCanvasItemReflow(
    previousPositions,
    Array.from(root.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector")),
    {
      getKey: (element) => variantInstanceId === null
        ? element
        : getLayerDescriptorKey(getCanvasLayerDescriptor(element)),
      getAnimatedAncestor: (element) => element.parentElement?.closest(".canvas-frame"),
    },
  );
}

function clearCanvasDropTarget() {
  canvasDragSession?.targetElement?.classList.remove("is-canvas-drop-inside");
  if (canvasDragSession) {
    canvasDragSession.targetElement = null;
    canvasDragSession.insideLock = null;
  }
}

function previewCanvasDropIntent(intent) {
  if (!canvasDragSession || !intent || canvasDragSession.intent?.key === intent.key) return;
  const previousPositions = captureCanvasLayerPositions();
  clearCanvasDropTarget();
  const parentElement = getCanvasParentElement(
    intent.parentFrameId,
    canvasDragSession.variantInstanceId,
  );
  if (!(parentElement instanceof HTMLElement)) return;
  syncCanvasDragGroupLayout(canvasDragSession.placeholder, parentElement);
  const shouldLockInsideTarget = intent.mode === "inside"
    && intent.targetElement?.classList.contains("canvas-frame")
    && canvasDragSession.originalParentId !== intent.parentFrameId;
  const insideTargetBounds = shouldLockInsideTarget
    ? intent.targetElement.getBoundingClientRect()
    : null;
  const siblings = getLayerChildren(intent.parentFrameId).filter(
    (sibling) => !isCanvasDraggedLayer(
      { type: sibling.type, id: sibling.record.id },
      canvasDragSession.draggedLayers,
    ),
  );
  const referenceLayer = siblings[intent.targetIndex];
  const referenceElement = referenceLayer
    ? getCanvasLayerElement(
        { type: referenceLayer.type, id: referenceLayer.record.id },
        canvasDragSession.variantInstanceId,
      )
    : null;
  parentElement.insertBefore(canvasDragSession.placeholder, referenceElement);
  canvasDragSession.intent = intent;
  canvasDragSession.targetElement = intent.mode === "inside" ? intent.targetElement : null;
  canvasDragSession.insideLock = insideTargetBounds
    ? {
        intent,
        left: insideTargetBounds.left + insideTargetBounds.width * 0.25,
        top: insideTargetBounds.top + insideTargetBounds.height * 0.25,
        right: insideTargetBounds.right - insideTargetBounds.width * 0.25,
        bottom: insideTargetBounds.bottom - insideTargetBounds.height * 0.25,
      }
    : null;
  canvasDragSession.targetElement?.classList.add("is-canvas-drop-inside");
  animateCanvasLayerReflow(previousPositions, canvasDragSession.variantInstanceId);
  requestAnimationFrame(syncResizeOverlay);
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

function restoreCanvasDragPreview() {
  if (!canvasDragSession) return;
  const previousPositions = captureCanvasLayerPositions();
  clearCanvasDropTarget();
  const parentElement = getCanvasParentElement(
    canvasDragSession.originalParentId,
    canvasDragSession.variantInstanceId,
  );
  if (!(parentElement instanceof HTMLElement)) return;
  syncCanvasDragGroupLayout(canvasDragSession.placeholder, parentElement);
  const siblings = getLayerChildren(canvasDragSession.originalParentId).filter(
    (sibling) => !isCanvasDraggedLayer(
      { type: sibling.type, id: sibling.record.id },
      canvasDragSession.draggedLayers,
    ),
  );
  const referenceLayer = siblings[canvasDragSession.originalIndex];
  const referenceElement = referenceLayer
    ? getCanvasLayerElement(
        { type: referenceLayer.type, id: referenceLayer.record.id },
        canvasDragSession.variantInstanceId,
      )
    : null;
  parentElement.insertBefore(canvasDragSession.placeholder, referenceElement);
  canvasDragSession.intent = null;
  animateCanvasLayerReflow(previousPositions, canvasDragSession.variantInstanceId);
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

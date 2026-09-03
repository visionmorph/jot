/* Renders canvas drag placeholders, target highlighting, and reflow animation. */

const CANVAS_REFLOW_DURATION = 160;

const CANVAS_REFLOW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const canvasReflowAnimations = new WeakMap();

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

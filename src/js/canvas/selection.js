/* Canvas selection state, overlays, layer selection, and marquee interactions. */

const selectionRectangle = document.createElement("div");
selectionRectangle.className = "selection-rectangle";
selectionRectangle.setAttribute("aria-hidden", "true");

const variantActionOverlay = document.createElement("div");
const variantSizeLabel = document.createElement("span");
const variantAddTooltip = document.createElement("span");
const variantAddButton = document.createElement("button");
const variantAddButtonTooltip = document.createElement("span");
variantActionOverlay.className = "variant-action-overlay";
variantActionOverlay.hidden = true;
variantSizeLabel.className = "component-variant-size-label";
variantSizeLabel.setAttribute("aria-hidden", "true");
variantAddTooltip.className = "tooltip tooltip--bottom tooltip--align-center";
variantAddButton.className = "canvas-add-variant-button";
variantAddButton.type = "button";
variantAddButton.setAttribute("aria-label", "Add variant");
variantAddButton.innerHTML = '<span class="plus-icon" aria-hidden="true"></span>';
variantAddButtonTooltip.className = "tooltip__content";
variantAddButtonTooltip.setAttribute("role", "tooltip");
variantAddButtonTooltip.textContent = "Add variant";
variantAddTooltip.append(variantAddButton, variantAddButtonTooltip);
variantActionOverlay.append(variantSizeLabel, variantAddTooltip);

let selectionDrag = null;



let canvasGestureState = null;


if (canvas instanceof HTMLElement) {
  canvas.insertBefore(selectionRectangle, toolbar instanceof Node ? toolbar : null);
  canvas.insertBefore(variantActionOverlay, toolbar instanceof Node ? toolbar : null);
}

function beginCanvasGesture(event) {
  if (event.button !== 0 || !event.isPrimary) return;
  canvasGestureState = {
    pointerId: event.pointerId,
    suppressClick: false,
  };
}

function suppressCanvasClickForGesture(event) {
  if (canvasGestureState?.pointerId === event.pointerId) {
    canvasGestureState.suppressClick = true;
  }
}

function consumeSuppressedCanvasClick(event) {
  if (!canvasGestureState || canvasGestureState.pointerId !== event.pointerId) return false;
  const shouldSuppress = canvasGestureState.suppressClick;
  canvasGestureState = null;
  return shouldSuppress;
}

canvas?.addEventListener("pointerdown", beginCanvasGesture, true);
canvas?.addEventListener("pointercancel", (event) => {
  if (canvasGestureState?.pointerId === event.pointerId) canvasGestureState = null;
}, true);

function syncVariantActionOverlay() {
  if (!(canvas instanceof HTMLElement)) return;
  if (variantActionOverlay.classList.contains("is-variant-reordering")) return;
  if (activeTool !== "select") {
    variantActionOverlay.hidden = true;
    return;
  }
  const selectedVariantPreviews = Array.from(
    componentSet?.querySelectorAll(".variant-preview.is-selected") ?? [],
  );
  const selectedVariantRoot = selectedVariantPreviews.length === 1
    ? selectedVariantPreviews[0].querySelector(".canvas-root-stack.is-selected")
    : null;
  const selectedElement = selectedVariantRoot instanceof HTMLElement
    ? selectedVariantRoot
    : getSelectedResizeElement();
  const isComponentRootSelected = selectedComponentId === currentComponent?.id
    && selectedVariantPreviews.length === 0;
  const isVariantRootSelected = selectedVariantRoot instanceof HTMLElement;
  const anchorElement = isComponentRootSelected && variantModel.getInstances().length > 0
    ? componentSet
    : selectedElement;
  if (!(selectedElement instanceof HTMLElement)
    || !(anchorElement instanceof HTMLElement)
    || !selectedElement.isConnected
    || !anchorElement.isConnected) {
    variantActionOverlay.hidden = true;
    return;
  }
  const canAddVariant = isComponentRootSelected || isVariantRootSelected;
  variantAddTooltip.hidden = !canAddVariant;
  const canvasBounds = canvas.getBoundingClientRect();
  const bounds = anchorElement.getBoundingClientRect();
  const selectedBounds = selectedElement.getBoundingClientRect();
  const fallbackVariantRoot = isComponentRootSelected && variantModel.getInstances().length > 0
    ? componentSet?.querySelector(".variant-preview .canvas-root-stack")
    : null;
  const measurementElement = selectedBounds.width > 0 && selectedBounds.height > 0
    ? selectedElement
    : fallbackVariantRoot instanceof HTMLElement ? fallbackVariantRoot : selectedElement;
  const measurementBounds = measurementElement.getBoundingClientRect();
  const getDimensionLabel = (dimension) => {
    const override = selectedVariantInstanceId !== null
      ? getSelectedVariantStyleOverride(dimension, "")
      : "";
    const defaultMode = measurementElement === selectedCanvasText ? "hug" : "fixed";
    const mode = override === "auto"
      ? "hug"
      : override === "100%"
        ? "fill"
        : override ? "fixed" : getLayerDimensionMode(measurementElement, dimension, defaultMode);
    const value = Math.round(measurementBounds[dimension]);
    const suffix = mode === "hug" ? " Hug" : mode === "fill" ? " Fill" : "";
    return `${value}${suffix}`;
  };
  variantSizeLabel.textContent = `${getDimensionLabel("width")} x ${getDimensionLabel("height")}`;
  variantActionOverlay.hidden = false;
  variantActionOverlay.style.left = `${bounds.left - canvasBounds.left + bounds.width / 2}px`;
  variantActionOverlay.style.top = `${bounds.bottom - canvasBounds.top + 8}px`;
}

variantAddButton.addEventListener("pointerdown", (event) => event.stopPropagation());
variantAddButton.addEventListener("click", (event) => {
  requestAddVariant(event);
});
function syncElementSelectionStyles() {
  clearElementSelection();
  if (selectedComponentId === currentComponent?.id && canvasRootStack instanceof HTMLElement) {
    const componentSelectionElement = variantModel.getInstances().length > 0 ? componentSet : canvasRootStack;
    componentSelectionElement?.classList.add("is-selected");
    componentSelectionElement?.setAttribute("aria-selected", "true");
  }
  selectedLayerKeys.forEach((key) => {
    const element = getElementForLayerKey(key);
    if (!(element instanceof HTMLElement)) return;
    element.classList.add("is-selected");
    element.setAttribute("aria-selected", "true");
  });
}

function clearElementSelection() {
  componentSet?.querySelectorAll(".is-selection-hovered").forEach((element) => {
    element.classList.remove("is-selection-hovered");
  });
  if (componentSet instanceof HTMLElement) {
    componentSet.classList.remove("is-selected");
    componentSet.setAttribute("aria-selected", "false");
  }
  if (canvasRootStack instanceof HTMLElement) {
    canvasRootStack.classList.remove("is-selected");
    canvasRootStack.setAttribute("aria-selected", "false");
  }
  frameRecords.forEach((record) => {
    record.element.classList.remove("is-selected");
    record.element.setAttribute("aria-selected", "false");
  });
  textRecords.forEach((record) => {
    record.element.classList.remove("is-selected");
    record.element.setAttribute("aria-selected", "false");
  });
  vectorRecords.forEach((record) => {
    record.element.classList.remove("is-selected");
    record.element.setAttribute("aria-selected", "false");
  });
}

function selectCanvasFrame(frameElement, additive = false) {
  const record = frameRecords.find((frameRecord) => frameRecord.element === frameElement);
  if (!record) return;
  expandFramePath(record.parentId);
  const frameKey = getLayerKey("frame", record.id);
  selectLayerKey(frameKey, additive);
  queueCanvasMutationEffects({ selection: true, tree: true });
}

function selectCanvasText(textElement, additive = false) {
  if (!textElement.isContentEditable && typeof clearActiveTextRangeSelection === "function") {
    clearActiveTextRangeSelection();
  }
  const record = textRecords.find((textRecord) => textRecord.element === textElement);
  if (record) expandFramePath(record.parentFrameId);
  if (!record) return;
  const textKey = getLayerKey("text", record.id);
  selectLayerKey(textKey, additive);
  queueCanvasMutationEffects({ selection: true, tree: true });
}

function selectCanvasVector(vectorElement, additive = false) {
  const record = vectorRecords.find((vectorRecord) => vectorRecord.element === vectorElement);
  if (record) expandFramePath(record.parentFrameId);
  if (!record) return;
  const vectorKey = getLayerKey("vector", record.id);
  selectLayerKey(vectorKey, additive);
  queueCanvasMutationEffects({ selection: true, tree: true });
}

function clearLayerSelection() {
  if (selectedLayerKeys.size === 0 && selectedComponentId === null && selectedVariantInstanceId === null) return;
  selectCanvasState();
  queueCanvasMutationEffects({ selection: true, tree: true });
}
function getMarqueeBounds(startX, startY, endX, endY) {
  return {
    left: Math.min(startX, endX),
    top: Math.min(startY, endY),
    right: Math.max(startX, endX),
    bottom: Math.max(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  };
}

function isRectEnclosed(elementBounds, selectionBounds) {
  return elementBounds.left >= selectionBounds.left
    && elementBounds.top >= selectionBounds.top
    && elementBounds.right <= selectionBounds.right
    && elementBounds.bottom <= selectionBounds.bottom;
}

function doRectsIntersect(elementBounds, selectionBounds) {
  return elementBounds.right >= selectionBounds.left
    && elementBounds.left <= selectionBounds.right
    && elementBounds.bottom >= selectionBounds.top
    && elementBounds.top <= selectionBounds.bottom;
}

function getMarqueeLayerMatches(selectionBounds, parentFrameId = null) {
  return getLayerChildren(parentFrameId).flatMap(({ type, record }) => {
    const bounds = record.element.getBoundingClientRect();
    const isMatch = type === "frame"
      ? isRectEnclosed(bounds, selectionBounds)
      : doRectsIntersect(bounds, selectionBounds);
    const ownMatch = isMatch ? [getLayerKey(type, record.id)] : [];
    const descendantMatches = type === "frame"
      ? getMarqueeLayerMatches(selectionBounds, record.id)
      : [];
    return [...ownMatch, ...descendantMatches];
  });
}

function applyMarqueeSelection(selectionBounds) {
  if (!selectionDrag || !currentComponent) return;
  if (variantModel.getInstances().length > 0) {
    const variantMatches = [];
    const layerMatches = [];
    variantModel.getInstances().forEach((instance) => {
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(instance.id))}"]`);
      const root = preview?.querySelector(".canvas-root-stack");
      if (!(root instanceof HTMLElement)) return;
      if (isRectEnclosed(root.getBoundingClientRect(), selectionBounds)) {
        variantMatches.push(instance.id);
        return;
      }
      root.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector").forEach((element) => {
        const type = element.classList.contains("canvas-frame")
          ? "frame"
          : element.classList.contains("canvas-text") ? "text" : "vector";
        const id = Number(element.dataset[`${type}Id`]);
        if (!Number.isFinite(id)) return;
        const isMatch = type === "frame"
          ? isRectEnclosed(element.getBoundingClientRect(), selectionBounds)
          : doRectsIntersect(element.getBoundingClientRect(), selectionBounds);
        if (isMatch) layerMatches.push({ instanceId: instance.id, target: `${type}:${id}` });
      });
    });
    if (variantMatches.length > 0) {
      const nextIds = selectionDrag.additive
        ? [...new Set([...selectionDrag.initialVariantIds, ...variantMatches])]
        : variantMatches;
      selectVariantInstancesState(nextIds, variantMatches[variantMatches.length - 1]);
      clearMasterSelectionForVariant();
    } else {
      const anchorMatch = layerMatches[layerMatches.length - 1];
      if (anchorMatch) {
        const matchedTargets = layerMatches
          .filter((match) => match.instanceId === anchorMatch.instanceId)
          .map((match) => match.target);
        const initialTargets = selectionDrag.additive
          && selectionDrag.initialVariantInstanceId === anchorMatch.instanceId
          ? selectionDrag.initialVariantTargets
          : [];
        const nextTargets = [...new Set([...initialTargets, ...matchedTargets])];
        const anchorTarget = getShallowestPrimaryLayerKey(nextTargets);
        selectVariantLayerTargetsState(anchorMatch.instanceId, nextTargets, anchorTarget);
        clearMasterSelectionForVariant();
      } else if (!selectionDrag.additive) {
        selectCanvasState();
        clearElementSelection();
      }
    }
    renderTree();
    return;
  }
  const nextKeys = new Set(selectionDrag.additive ? selectionDrag.initialKeys : []);
  const componentIsEnclosed = isRectEnclosed(canvasRootStack.getBoundingClientRect(), selectionBounds);

  if (componentIsEnclosed) {
    selectComponentState(currentComponent.id);
  } else {
    getMarqueeLayerMatches(selectionBounds).forEach((key) => nextKeys.add(key));
    if (nextKeys.size > 0) {
      const keys = [...nextKeys];
      selectLayerKeys(keys, getShallowestPrimaryLayerKey(keys));
    } else if (!selectionDrag.additive) {
      selectCanvasState();
    }
  }
  syncElementSelectionStyles();
  renderTree();
}

canvas?.addEventListener("pointerdown", (event) => {
  const hit = resolveCanvasHit(event.target);
  const startsOnCanvasBackground = hit.kind === "canvas"
    || hit.kind === "component-set";
  if (
    !(canvas instanceof HTMLElement)
    || !startsOnCanvasBackground
    || event.button !== 0
    || activeTool !== "select"
  ) return;
  const canvasBounds = canvas.getBoundingClientRect();
  const startX = Math.max(canvasBounds.left, Math.min(event.clientX, canvasBounds.right));
  const startY = Math.max(canvasBounds.top, Math.min(event.clientY, canvasBounds.bottom));
  selectionDrag = {
    pointerId: event.pointerId,
    startX,
    startY,
    additive: event.shiftKey || event.ctrlKey || event.metaKey,
    initialKeys: [...selectedLayerKeys],
    initialVariantIds: getSelectedVariantInstanceIds(),
    initialVariantInstanceId: selectedVariantInstanceId,
    initialVariantTargets: getSelectedVariantLayerTargets(),
    dragged: false,
  };
  canvas.setPointerCapture(event.pointerId);
});

canvas?.addEventListener("pointermove", (event) => {
  if (!selectionDrag || event.pointerId !== selectionDrag.pointerId || !(canvas instanceof HTMLElement)) return;
  const canvasBounds = canvas.getBoundingClientRect();
  const endX = Math.max(canvasBounds.left, Math.min(event.clientX, canvasBounds.right));
  const endY = Math.max(canvasBounds.top, Math.min(event.clientY, canvasBounds.bottom));
  const bounds = getMarqueeBounds(selectionDrag.startX, selectionDrag.startY, endX, endY);
  if (!selectionDrag.dragged && bounds.width < 3 && bounds.height < 3) return;
  selectionDrag.dragged = true;
  selectionRectangle.classList.add("is-visible");
  selectionRectangle.style.left = `${bounds.left - canvasBounds.left}px`;
  selectionRectangle.style.top = `${bounds.top - canvasBounds.top}px`;
  selectionRectangle.style.width = `${bounds.width}px`;
  selectionRectangle.style.height = `${bounds.height}px`;
  applyMarqueeSelection(bounds);
});

function finishMarqueeSelection(event) {
  if (!selectionDrag || event.pointerId !== selectionDrag.pointerId || !(canvas instanceof HTMLElement)) return;
  const wasDragged = selectionDrag.dragged;
  selectionDrag = null;
  selectionRectangle.classList.remove("is-visible");
  selectionRectangle.removeAttribute("style");
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (wasDragged && event.type === "pointerup") {
    suppressCanvasClickForGesture(event);
    const selectedVariantIds = getSelectedVariantInstanceIds();
    if (selectedVariantIds.length > 0) {
      const focusInstanceId = selectedVariantInstanceId ?? selectedVariantIds[selectedVariantIds.length - 1];
      requestAnimationFrame(() => {
        const preview = componentSet?.querySelector(
          `.variant-preview[data-variant-instance-id="${CSS.escape(String(focusInstanceId))}"]`,
        );
        if (preview instanceof HTMLElement) preview.focus({ preventScroll: true });
      });
    }
  }
}

canvas?.addEventListener("pointerup", finishMarqueeSelection);
canvas?.addEventListener("pointercancel", finishMarqueeSelection);

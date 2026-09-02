/* Canvas sizing calculations, resize overlay, and pointer resize interactions. */

resizeOverlay.className = "resize-overlay";
resizeOverlay.hidden = true;
resizeOverlay.setAttribute("aria-hidden", "true");

RESIZE_HANDLE_DIRECTIONS.filter((direction) => direction.length === 2).forEach((direction) => {
  const handle = document.createElement("button");
  handle.className = `resize-handle resize-handle--${direction}`;
  handle.type = "button";
  handle.tabIndex = -1;
  handle.dataset.resizeHandle = direction;
  handle.setAttribute("aria-label", `Resize ${direction}`);
  resizeOverlay.append(handle);
});

["n", "e", "s", "w"].forEach((direction) => {
  const edge = document.createElement("button");
  edge.className = `resize-edge resize-edge--${direction}`;
  edge.type = "button";
  edge.tabIndex = -1;
  edge.dataset.resizeHandle = direction;
  edge.setAttribute("aria-label", `Resize ${direction}`);
  resizeOverlay.append(edge);
});

if (canvas instanceof HTMLElement) {
  canvas.insertBefore(resizeOverlay, toolbar instanceof Node ? toolbar : null);
}

function getSelectedResizeElement() {
  if (getSelectedVariantInstanceIds().length > 1) return null;
  if (selectedVariantInstanceId !== null) {
    if (selectedVariantLayerTargets.size > 1) return null;
    const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(selectedVariantInstanceId))}"]`);
    const root = preview?.querySelector(".canvas-root-stack");
    if (!(root instanceof HTMLElement)) return null;
    return selectedVariantLayerTarget
      ? findVariantTarget(root, selectedVariantLayerTarget)
      : root;
  }
  if (selectedComponentId === currentComponent?.id) return currentComponent.frameRecord.element;
  return selectedCanvasFrame || selectedCanvasText || selectedCanvasVector;
}

function syncResizeTargetHover(isHovered) {
  const selectedElement = getSelectedResizeElement();
  if (selectedElement instanceof HTMLElement) {
    selectedElement.classList.toggle("is-selection-hovered", isHovered);
  }
}

resizeOverlay.addEventListener("pointerover", () => syncResizeTargetHover(true));
resizeOverlay.addEventListener("pointerout", (event) => {
  if (event.relatedTarget instanceof Node && resizeOverlay.contains(event.relatedTarget)) return;
  syncResizeTargetHover(false);
});

function getSelectedResizeRecord() {
  if (selectedVariantInstanceId !== null && currentComponent?.frameRecord) {
    return {
      type: "variant",
      target: selectedVariantLayerTarget || "component:0",
      targetType: getVariantTargetType(selectedVariantLayerTarget || "component:0"),
      record: currentComponent.frameRecord,
      parentId: null,
    };
  }
  const frameRecord = getSelectedFrameRecord();
  if (frameRecord) return { type: "frame", record: frameRecord, parentId: frameRecord.parentId };
  const textRecord = getSelectedTextRecord();
  if (textRecord) return { type: "text", record: textRecord, parentId: textRecord.parentFrameId };
  const vectorRecord = getSelectedVectorRecord();
  if (vectorRecord) return { type: "vector", record: vectorRecord, parentId: vectorRecord.parentFrameId };
  return null;
}

function positionResizeOverlay() {
  if (!(canvas instanceof HTMLElement)) return;
  if (canvasReflowAnimations.has(resizeOverlay)) return;
  if (activeTool !== "select" || canvasDragSession || canvasPointerDrag?.hasStarted) {
    resizeOverlay.hidden = true;
    return;
  }

  const element = getSelectedResizeElement();
  if (
    !(element instanceof HTMLElement)
    || !element.isConnected
    || getComputedStyle(element).visibility === "hidden"
  ) {
    resizeOverlay.hidden = true;
    return;
  }

  const canvasBounds = canvas.getBoundingClientRect();
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    resizeOverlay.hidden = true;
    return;
  }
  resizeOverlay.hidden = false;
  resizeOverlay.style.left = `${bounds.left - canvasBounds.left}px`;
  resizeOverlay.style.top = `${bounds.top - canvasBounds.top}px`;
  resizeOverlay.style.width = `${bounds.width}px`;
  resizeOverlay.style.height = `${bounds.height}px`;
}

function syncResizeOverlay() {
  const element = getSelectedResizeElement();
  if (element !== observedResizeElement) {
    selectedLayerResizeObserver?.disconnect();
    observedResizeElement = element;
    if (element instanceof HTMLElement) selectedLayerResizeObserver?.observe(element);
    if (canvas instanceof HTMLElement) selectedLayerResizeObserver?.observe(canvas);
  }
  positionResizeOverlay();
  syncVariantActionOverlay();
}

function applyResizePointerPosition(clientX, clientY, proportional = false) {
  if (!resizeInteraction) return;
  const { element, layer, direction } = resizeInteraction;
  if (!element.isConnected) return;

  const deltaX = clientX - resizeInteraction.pointerX;
  const deltaY = clientY - resizeInteraction.pointerY;
  let changesWidth = direction.includes("e") || direction.includes("w");
  let changesHeight = direction.includes("n") || direction.includes("s");
  let nextWidth = changesWidth
    ? Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(resizeInteraction.width + (direction.includes("w") ? -deltaX : deltaX)))
    : resizeInteraction.width;
  let nextHeight = changesHeight
    ? Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(resizeInteraction.height + (direction.includes("n") ? -deltaY : deltaY)))
    : resizeInteraction.height;

  if (proportional && resizeInteraction.width > 0 && resizeInteraction.height > 0) {
    const aspectRatio = resizeInteraction.width / resizeInteraction.height;
    if (changesWidth && changesHeight) {
      const widthDeltaRatio = Math.abs(nextWidth - resizeInteraction.width) / resizeInteraction.width;
      const heightDeltaRatio = Math.abs(nextHeight - resizeInteraction.height) / resizeInteraction.height;
      if (widthDeltaRatio >= heightDeltaRatio) nextHeight = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(nextWidth / aspectRatio));
      else nextWidth = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(nextHeight * aspectRatio));
    } else if (changesWidth) {
      changesHeight = true;
      nextHeight = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(nextWidth / aspectRatio));
    } else if (changesHeight) {
      changesWidth = true;
      nextWidth = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(nextHeight * aspectRatio));
    }
  }
  const widthChanged = changesWidth && nextWidth !== Number(element.dataset.width || resizeInteraction.width);
  const heightChanged = changesHeight && nextHeight !== Number(element.dataset.height || resizeInteraction.height);

  if (!widthChanged && !heightChanged) return;
  if (layer.type === "variant") {
    if (!resizeInteraction.hasRecordedHistory) {
      recordHistory();
      resizeInteraction.hasRecordedHistory = true;
    }
    const setOverride = layer.target === "component:0"
      ? (property, value) => setSelectedVariantStyleOverride(property, value, { render: false, record: false })
      : (property, value) => setSelectedVariantLayerOverride(property, value, { render: false });
    if (changesWidth) {
      setOverride("width", `${nextWidth}px`);
      element.dataset.widthMode = "fixed";
      element.dataset.width = String(nextWidth);
      element.style.width = `${nextWidth}px`;
    }
    if (changesHeight) {
      setOverride("height", `${nextHeight}px`);
      element.dataset.heightMode = "fixed";
      element.dataset.height = String(nextHeight);
      element.style.height = `${nextHeight}px`;
    }
    if (layer.targetType === "text") syncSelectedTextSizeInputs();
    else if (layer.targetType === "component" || layer.targetType === "frame") syncInspectorToSelectedFrame();
    positionResizeOverlay();
    syncVariantActionOverlay();
    return;
  }
  if (!resizeInteraction.hasRecordedHistory) {
    recordHistory();
    resizeInteraction.hasRecordedHistory = true;
  }

  if (changesWidth) {
    element.dataset.widthMode = "fixed";
    element.dataset.width = String(nextWidth);
    element.style.width = `${nextWidth}px`;
    if (layer.type !== "frame" && layer.parentId === null && direction.includes("w")) {
      element.style.left = `${resizeInteraction.left + resizeInteraction.width - nextWidth}px`;
    }
  }
  if (changesHeight) {
    element.dataset.heightMode = "fixed";
    element.dataset.height = String(nextHeight);
    element.style.height = `${nextHeight}px`;
    if (layer.type !== "frame" && layer.parentId === null && direction.includes("n")) {
      element.style.top = `${resizeInteraction.top + resizeInteraction.height - nextHeight}px`;
    }
  }

  applyLayerSizing(layer.type, layer.record);
  if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  if (layer.type === "frame") syncInspectorToSelectedFrame();
  else if (layer.type === "text") syncSelectedTextSizeInputs();
  else syncInspectorToSelectedVector();
  positionResizeOverlay();
  syncVariantActionOverlay();
}

resizeOverlay.addEventListener("pointerdown", (event) => {
  const handle = event.target instanceof HTMLElement ? event.target.closest("[data-resize-handle]") : null;
  const layer = getSelectedResizeRecord();
  const element = getSelectedResizeElement();
  if (!(handle instanceof HTMLButtonElement) || !(element instanceof HTMLElement) || !layer || event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  if (layer.type === "text") {
    element.contentEditable = "false";
    element.draggable = false;
    layer.record.isNew = false;
    element.classList.remove("is-new-empty");
  }
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
  const bounds = element.getBoundingClientRect();
  resizeInteraction = {
    element,
    layer,
    direction: handle.dataset.resizeHandle || "se",
    pointerX: event.clientX,
    pointerY: event.clientY,
    width: bounds.width,
    height: bounds.height,
    left: bounds.left - canvasBounds.left,
    top: bounds.top - canvasBounds.top,
    hasRecordedHistory: false,
  };
  handle.setPointerCapture(event.pointerId);
});

resizeOverlay.addEventListener("pointermove", (event) => {
  if (!(event.target instanceof HTMLButtonElement) || !event.target.hasPointerCapture(event.pointerId)) return;
  applyResizePointerPosition(event.clientX, event.clientY, event.shiftKey);
});

resizeOverlay.addEventListener("pointerup", (event) => {
  if (!(event.target instanceof HTMLButtonElement) || !event.target.hasPointerCapture(event.pointerId)) return;
  applyResizePointerPosition(event.clientX, event.clientY, event.shiftKey);
  event.target.releasePointerCapture(event.pointerId);
  if (resizeInteraction?.layer.type === "variant") renderVariantInstances();
  if (resizeInteraction?.layer.type === "text") resizeInteraction.element.draggable = true;
  resizeInteraction = null;
  syncResizeOverlay();
});

resizeOverlay.addEventListener("pointercancel", (event) => {
  if (event.target instanceof HTMLButtonElement && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  if (resizeInteraction?.layer.type === "variant") renderVariantInstances();
  if (resizeInteraction?.layer.type === "text") resizeInteraction.element.draggable = true;
  resizeInteraction = null;
  syncResizeOverlay();
});

function setResizeEdgeDimensionMode(direction, mode) {
  const layer = getSelectedResizeRecord();
  const element = getSelectedResizeElement();
  const dimension = direction === "e" || direction === "w" ? "width" : "height";
  const targetType = layer?.type === "variant" ? layer.targetType : layer?.type;
  const isFrameTarget = targetType === "frame" || targetType === "component";
  if (!(element instanceof HTMLElement) || !layer || (!isFrameTarget && targetType !== "text")) return;

  recordHistory();
  if (layer.type === "variant") {
    const value = mode === "fill" ? "100%" : "auto";
    if (layer.target === "component:0") {
      setSelectedVariantStyleOverride(dimension, value, { record: false });
    } else {
      setSelectedVariantLayerOverride(dimension, value, { render: true });
    }
    element.dataset[`${dimension}Mode`] = mode;
    element.style[dimension] = value;
  } else {
    element.dataset[`${dimension}Mode`] = mode;
    applyLayerSizing(layer.type, layer.record);
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  }

  if (isFrameTarget) syncInspectorToSelectedFrame();
  else syncSelectedTextSizeInputs();
  syncResizeOverlay();
}

resizeOverlay.addEventListener("dblclick", (event) => {
  const edge = event.target instanceof HTMLElement ? event.target.closest(".resize-edge") : null;
  if (!(edge instanceof HTMLButtonElement) || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  setResizeEdgeDimensionMode(edge.dataset.resizeHandle || "", event.altKey ? "fill" : "hug");
});

window.addEventListener("resize", syncResizeOverlay);

function applyLayerSizing(type, record) {
  const element = record.element;
  const { parentId, parentDirection } = getLayerSizingContext(type, record);
  const widthMode = getLayerDimensionMode(element, "width", type === "text" ? "hug" : "fixed");
  const heightMode = getLayerDimensionMode(element, "height", type === "text" ? "hug" : "fixed");
  const isRoot = Boolean(record.isComponent);
  const mainDimension = parentDirection === "vertical" ? "height" : "width";
  const mainMode = mainDimension === "width" ? widthMode : heightMode;
  const crossMode = mainDimension === "width" ? heightMode : widthMode;

  const applyDimension = (dimension, mode, fallbackValue) => {
    if (mode === "fixed") {
      element.style[dimension] = `${element.dataset[dimension] || fallbackValue}px`;
    } else if (mode === "hug") {
      const isEmptyComponent = isRoot && getLayerChildren(null).length === 0;
      element.style[dimension] = isEmptyComponent
        ? `${element.dataset[dimension] || fallbackValue}px`
        : "max-content";
    } else if (isRoot) {
      element.style[dimension] = "100%";
    } else {
      element.style[dimension] = "auto";
    }
  };

  const fallbackSize = type === "frame" ? "100" : type === "vector" ? "24" : "0";
  applyDimension("width", widthMode, fallbackSize);
  applyDimension("height", heightMode, fallbackSize);
  element.style.flex = isRoot ? "" : mainMode === "fill" ? "1 1 0" : "0 0 auto";
  element.style.alignSelf = !isRoot && crossMode === "fill" ? "stretch" : "";
  element.style.minWidth = !isRoot && mainDimension === "width" && widthMode === "fill" ? "0" : "";
  element.style.minHeight = !isRoot && mainDimension === "height" && heightMode === "fill" ? "0" : "";
}

function applyAllLayerSizing() {
  if (currentComponent?.frameRecord) applyLayerSizing("frame", currentComponent.frameRecord);
  frameRecords.forEach((record) => applyLayerSizing("frame", record));
  textRecords.forEach((record) => applyLayerSizing("text", record));
  vectorRecords.forEach((record) => applyLayerSizing("vector", record));
  requestAnimationFrame(syncResizeOverlay);
}

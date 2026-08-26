/* Canvas tools, layer rendering, editing, resizing, vector import, and direct manipulation. */

resizeOverlay.className = "resize-overlay";

resizeOverlay.hidden = true;

resizeOverlay.setAttribute("aria-hidden", "true");

const selectionRectangle = document.createElement("div");
selectionRectangle.className = "selection-rectangle";
selectionRectangle.setAttribute("aria-hidden", "true");

const variantActionOverlay = document.createElement("div");
const variantSizeTooltip = document.createElement("span");
const variantAddButton = document.createElement("button");
const variantAddButtonTooltip = document.createElement("span");
variantActionOverlay.className = "variant-action-overlay";
variantActionOverlay.hidden = true;
variantSizeTooltip.className = "component-variant-size-tooltip";
variantSizeTooltip.setAttribute("aria-hidden", "true");
variantAddButton.className = "canvas-add-variant-button";
variantAddButton.type = "button";
variantAddButton.setAttribute("aria-label", "Add variant");
variantAddButton.innerHTML = '<span class="plus-icon" aria-hidden="true"></span>';
variantAddButtonTooltip.className = "canvas-add-variant-tooltip";
variantAddButtonTooltip.setAttribute("role", "tooltip");
variantAddButtonTooltip.textContent = "Add variant";
variantActionOverlay.append(variantSizeTooltip, variantAddButton, variantAddButtonTooltip);

let selectionDrag = null;

let canvasDragSession = null;

let canvasPointerDrag = null;

let canvasGestureState = null;

const CANVAS_DRAG_THRESHOLD = 4;

const CANVAS_REFLOW_DURATION = 160;

const CANVAS_REFLOW_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

const canvasReflowAnimations = new WeakMap();

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
  canvas.insertBefore(selectionRectangle, toolbar instanceof Node ? toolbar : null);
  canvas.insertBefore(resizeOverlay, toolbar instanceof Node ? toolbar : null);
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

function getSelectedResizeElement() {
  if (selectedVariantInstanceId !== null) {
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

function syncVariantActionOverlay() {
  if (!(canvas instanceof HTMLElement)) return;
  if (activeTool !== "select") {
    variantActionOverlay.hidden = true;
    return;
  }
  const selectedElement = getSelectedResizeElement();
  const anchorElement = selectedComponentId === currentComponent?.id && variantInstances.length > 0
    ? componentSet
    : selectedElement;
  if (!(selectedElement instanceof HTMLElement)
    || !(anchorElement instanceof HTMLElement)
    || !selectedElement.isConnected
    || !anchorElement.isConnected) {
    variantActionOverlay.hidden = true;
    return;
  }
  const isVariantLayerSelected = selectedVariantInstanceId !== null && selectedVariantLayerTarget !== null;
  variantAddButton.hidden = isVariantLayerSelected;
  variantAddButtonTooltip.hidden = isVariantLayerSelected;
  const canvasBounds = canvas.getBoundingClientRect();
  const bounds = anchorElement.getBoundingClientRect();
  const selectedBounds = selectedElement.getBoundingClientRect();
  const fallbackVariantRoot = selectedComponentId === currentComponent?.id && variantInstances.length > 0
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
  variantSizeTooltip.textContent = `${getDimensionLabel("width")} x ${getDimensionLabel("height")}`;
  variantActionOverlay.hidden = false;
  variantActionOverlay.style.left = `${bounds.left - canvasBounds.left + bounds.width / 2}px`;
  variantActionOverlay.style.top = `${bounds.bottom - canvasBounds.top + 8}px`;
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

variantAddButton.addEventListener("pointerdown", (event) => event.stopPropagation());
variantAddButton.addEventListener("click", (event) => {
  requestAddVariant(event);
});

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
  if (variantInstances.length > 0) scheduleVariantInstanceRender();
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
    if (variantInstances.length > 0) scheduleVariantInstanceRender();
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

function applyFrameAlignment(element) {
  const values = getFrameAlignmentValues(element);
  element.style.alignItems = values.alignItems;
  element.style.justifyContent = element.dataset.gapMode === "auto" ? "space-between" : values.justifyContent;
}

function applyTextAlignment(element) {
  const values = getTextAlignmentValues(element);
  element.style.display = "";
  element.style.flexDirection = "";
  element.style.alignItems = "";
  element.style.justifyContent = "";
  Object.assign(element.style, values);
}

function applyFrameOutline(element) {
  element.style.boxShadow = getFrameOutlineBoxShadow(element);
}

function selectTool(toolName) {
  activeTool = toolName;
  canvas?.classList.toggle("is-frame-tool-active", activeTool === "frame");
  canvas?.classList.toggle("is-text-tool-active", activeTool === "text");

  toolButtons.forEach((toolButton) => {
    const isSelected = toolButton.getAttribute("data-tool") === activeTool;
    toolButton.classList.toggle("is-toggled", isSelected);
    toolButton.setAttribute("aria-pressed", String(isSelected));
  });
  requestAnimationFrame(syncResizeOverlay);
}

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

function syncElementSelectionStyles() {
  clearElementSelection();
  if (selectedComponentId === currentComponent?.id && canvasRootStack instanceof HTMLElement) {
    const componentSelectionElement = variantInstances.length > 0 ? componentSet : canvasRootStack;
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
  syncElementSelectionStyles();
  renderTree();
}

function selectCanvasText(textElement, additive = false) {
  const record = textRecords.find((textRecord) => textRecord.element === textElement);
  if (record) expandFramePath(record.parentFrameId);
  if (!record) return;
  const textKey = getLayerKey("text", record.id);
  selectLayerKey(textKey, additive);
  syncElementSelectionStyles();
  renderTree();
}

function selectCanvasVector(vectorElement, additive = false) {
  const record = vectorRecords.find((vectorRecord) => vectorRecord.element === vectorElement);
  if (record) expandFramePath(record.parentFrameId);
  if (!record) return;
  const vectorKey = getLayerKey("vector", record.id);
  selectLayerKey(vectorKey, additive);
  syncElementSelectionStyles();
  renderTree();
}

function clearLayerSelection() {
  if (selectedLayerKeys.size === 0 && selectedComponentId === null && selectedVariantInstanceId === null) return;
  selectCanvasState();
  clearElementSelection();
  renderTree();
}

function removeCanvasText(textElement) {
  const textRecord = textRecords.find((record) => record.element === textElement);
  textElement.remove();
  if (textRecord) {
    removeLayerKeyFromSelection(getLayerKey("text", textRecord.id));
    textRecords = textRecords.filter((record) => record.id !== textRecord.id);
  }
  applyAllLayerSizing();
  if (selectedCanvasText === textElement) setPrimarySelectionToLatest();
  syncElementSelectionStyles();

  renderTree();
}

function startEditingText(textElement, selectText = true) {
  if (selectText) selectCanvasText(textElement);
  beginHistoryGesture(textElement);
  textElement.draggable = false;
  textElement.contentEditable = "true";
  textElement.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textElement);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function parseSvgLength(value) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  return match ? Number(match[1]) : null;
}

function hasUnsafeSvgCss(cssText) {
  if (/@import|expression\s*\(|(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(cssText)) return true;
  const urlReferences = [...cssText.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)];
  return urlReferences.some((match) => !match[1].trim().startsWith("#"));
}

function getSvgPresentationValue(element, property) {
  let current = element;
  while (current instanceof SVGElement) {
    const inlineValue = current.style.getPropertyValue(property).trim();
    if (inlineValue) return inlineValue;
    const attributeValue = current.getAttribute(property);
    if (attributeValue !== null && attributeValue.trim()) return attributeValue.trim();
    current = current.parentElement;
  }
  return property === "fill" ? "black" : property === "stroke" ? "none" : "1";
}

function getSvgClassPresentationValue(element, property) {
  const svg = element?.ownerSVGElement;
  if (!(svg instanceof SVGElement) || !element.classList.length) return "";
  const propertyPattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;!}]+)`, "i");
  for (const className of element.classList) {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rulePattern = new RegExp(`\\.${escapedClassName}\\s*\\{([^}]*)\\}`, "gi");
    for (const match of svg.querySelectorAll("style")) {
      for (const rule of match.textContent?.matchAll(rulePattern) || []) {
        const declaration = rule[1].match(propertyPattern);
        if (declaration) return declaration[1].trim();
      }
    }
  }
  return "";
}

function getEffectiveSvgPresentationValue(element, property) {
  const inlineValue = element.style.getPropertyValue(property).trim();
  if (inlineValue) return inlineValue;
  return getSvgClassPresentationValue(element, property) || getSvgPresentationValue(element, property);
}

function isTransparentSvgPaint(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "none" || normalized === "transparent") return true;
  if (/^#[\da-f]{8}$/i.test(normalized)) return normalized.slice(7) === "00";
  const colorChannels = normalized.match(/[\d.]+/g);
  return /^(?:rgba|hsla)\(/.test(normalized) && colorChannels?.length >= 4 && Number(colorChannels[3]) === 0;
}

function isExplicitlyTransparentSvgShape(element) {
  if (!(element instanceof SVGElement)) return false;
  if (Number(getEffectiveSvgPresentationValue(element, "opacity")) === 0) return true;
  const fill = getEffectiveSvgPresentationValue(element, "fill");
  const stroke = getEffectiveSvgPresentationValue(element, "stroke");
  const fillOpacity = Number(getEffectiveSvgPresentationValue(element, "fill-opacity"));
  const strokeOpacity = Number(getEffectiveSvgPresentationValue(element, "stroke-opacity"));
  const fillIsTransparent = isTransparentSvgPaint(fill) || fillOpacity === 0;
  const strokeIsTransparent = isTransparentSvgPaint(stroke) || strokeOpacity === 0;
  return fillIsTransparent && strokeIsTransparent;
}

function sanitizeSvgText(svgText) {
  const parsed = new DOMParser().parseFromString(svgText, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("The selected file is not valid SVG.");
  const root = parsed.documentElement;
  if (root.localName.toLowerCase() !== "svg") throw new Error("The selected file does not contain an SVG root.");

  root.querySelectorAll("script, foreignObject, iframe, object, embed, image, animate, animateMotion, animateTransform, set")
    .forEach((element) => element.remove());

  root.querySelectorAll("style").forEach((styleElement) => {
    if (hasUnsafeSvgCss(styleElement.textContent || "")) styleElement.remove();
  });

  [root, ...root.querySelectorAll("*")].forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      const isEventHandler = name.startsWith("on");
      const isExternalReference = (name === "href" || name === "xlink:href") && !value.startsWith("#");
      const hasUnsafeProtocol = /(?:javascript|vbscript|data\s*:\s*text\/html)\s*:/i.test(value);
      const urlReferences = [...value.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)];
      const hasExternalUrl = urlReferences.some((match) => !match[1].trim().startsWith("#"));
      const hasUnsafeStyle = name === "style" && /expression\s*\(/i.test(value);
      if (isEventHandler || isExternalReference || hasUnsafeProtocol || hasExternalUrl || hasUnsafeStyle) {
        element.removeAttribute(attribute.name);
      }
    });
  });

  root.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, use").forEach((shape) => {
    if (isExplicitlyTransparentSvgShape(shape)) shape.remove();
  });

  const viewBox = (root.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBox.length === 4 && Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : null;
  const viewBoxHeight = viewBox.length === 4 && Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : null;
  const width = parseSvgLength(root.getAttribute("width")) || viewBoxWidth || 24;
  const height = parseSvgLength(root.getAttribute("height")) || viewBoxHeight || 24;
  root.removeAttribute("width");
  root.removeAttribute("height");
  if (!root.hasAttribute("viewBox")) root.setAttribute("viewBox", `0 0 ${width} ${height}`);
  if (!root.hasAttribute("xmlns")) root.setAttribute("xmlns", "http://www.w3.org/2000/svg");

  return {
    source: new XMLSerializer().serializeToString(root),
    width,
    height,
  };
}

function createCanvasSvg(svgSource) {
  const parsed = new DOMParser().parseFromString(svgSource, "image/svg+xml");
  const svg = document.importNode(parsed.documentElement, true);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("preserveAspectRatio", svg.getAttribute("preserveAspectRatio") || "xMidYMid meet");
  svg.style.display = "block";
  svg.style.width = "100%";
  svg.style.height = "100%";
  return svg;
}

function getCanvasLayerDescriptor(element) {
  if (!(element instanceof HTMLElement)) return null;
  const frameId = Number(element.dataset.frameId);
  if (element.classList.contains("canvas-frame") && Number.isInteger(frameId)) {
    return { type: "frame", id: frameId };
  }
  const textId = Number(element.dataset.textId);
  if (element.classList.contains("canvas-text") && Number.isInteger(textId)) {
    return { type: "text", id: textId };
  }
  const vectorId = Number(element.dataset.vectorId);
  if (element.classList.contains("canvas-vector") && Number.isInteger(vectorId)) {
    return { type: "vector", id: vectorId };
  }
  return null;
}

function isSameLayerDescriptor(first, second) {
  return Boolean(first && second && first.type === second.type && first.id === second.id);
}

function getCanvasLayerElementFromTarget(target) {
  if (!(target instanceof Element)) return null;
  const element = target.closest(".canvas-frame, .canvas-text, .canvas-vector");
  return element instanceof HTMLElement && canvasRootStack?.contains(element) ? element : null;
}

function getCanvasParentElement(parentFrameId) {
  return parentFrameId === null ? canvasRootStack : getFrameRecord(parentFrameId)?.element ?? null;
}

function canMoveCanvasLayerToParent(layer, parentFrameId) {
  return layer.type !== "frame" || parentFrameId === null || canNestFrame(layer.id, parentFrameId);
}

function getCanvasInsertionIndex(parentFrameId, draggedLayer, clientX, clientY) {
  const parentElement = getCanvasParentElement(parentFrameId);
  if (!(parentElement instanceof HTMLElement)) return 0;
  const isVertical = parentElement.dataset.direction === "vertical";
  const pointerPosition = isVertical ? clientY : clientX;
  const siblings = getLayerChildren(parentFrameId).filter(
    (sibling) => !isSameLayerDescriptor(draggedLayer, { type: sibling.type, id: sibling.record.id }),
  );

  const insertionIndex = siblings.findIndex((sibling) => {
    const bounds = sibling.record.element.getBoundingClientRect();
    const midpoint = isVertical
      ? bounds.top + bounds.height / 2
      : bounds.left + bounds.width / 2;
    return pointerPosition < midpoint;
  });
  return insertionIndex < 0 ? siblings.length : insertionIndex;
}

function getCanvasDropIntent(event, draggedLayer) {
  if (!(canvasRootStack instanceof HTMLElement)) return null;
  const targetElement = getCanvasLayerElementFromTarget(event.target);
  const targetLayer = getCanvasLayerDescriptor(targetElement);

  if (targetLayer && isSameLayerDescriptor(targetLayer, draggedLayer)) {
    const parentFrameId = getLayerParentId(draggedLayer);
    const targetIndex = getLayerChildren(parentFrameId).findIndex(
      (sibling) => sibling.type === draggedLayer.type && sibling.record.id === draggedLayer.id,
    );
    return {
      parentFrameId,
      targetIndex: Math.max(0, targetIndex),
      mode: "before",
      targetElement: null,
      key: `${parentFrameId ?? "root"}:${Math.max(0, targetIndex)}:before`,
    };
  }

  if (targetElement && targetLayer && !isSameLayerDescriptor(targetLayer, draggedLayer)) {
    const targetBounds = targetElement.getBoundingClientRect();
    const horizontalRatio = targetBounds.width > 0 ? (event.clientX - targetBounds.left) / targetBounds.width : 0.5;
    const verticalRatio = targetBounds.height > 0 ? (event.clientY - targetBounds.top) / targetBounds.height : 0.5;
    const isCurrentParent = targetLayer.type === "frame" && getLayerParentId(draggedLayer) === targetLayer.id;
    if (isCurrentParent) {
      const targetIndex = getCanvasInsertionIndex(targetLayer.id, draggedLayer, event.clientX, event.clientY);
      return {
        parentFrameId: targetLayer.id,
        targetIndex,
        mode: "within",
        targetElement: null,
        key: `${targetLayer.id}:${targetIndex}:within`,
      };
    }
    const canNestInside = targetLayer.type === "frame"
      && draggedLayer.type !== "frame"
      && horizontalRatio >= 0.25
      && horizontalRatio <= 0.75
      && verticalRatio >= 0.25
      && verticalRatio <= 0.75
      && canMoveCanvasLayerToParent(draggedLayer, targetLayer.id);

    if (canNestInside) {
      const targetIndex = getLayerChildren(targetLayer.id).filter(
        (sibling) => !isSameLayerDescriptor(draggedLayer, { type: sibling.type, id: sibling.record.id }),
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
    if (!canMoveCanvasLayerToParent(draggedLayer, parentFrameId)) return null;
    const parentElement = getCanvasParentElement(parentFrameId);
    const isVertical = parentElement?.dataset.direction === "vertical";
    const targetRatio = isVertical ? verticalRatio : horizontalRatio;
    const siblings = getLayerChildren(parentFrameId).filter(
      (sibling) => !isSameLayerDescriptor(draggedLayer, { type: sibling.type, id: sibling.record.id }),
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

  const parentElement = event.target instanceof Element
    ? event.target.closest(".canvas-frame, [data-canvas-root-stack]")
    : null;
  const parentFrameId = parentElement instanceof HTMLElement && parentElement.classList.contains("canvas-frame")
    ? Number(parentElement.dataset.frameId)
    : null;
  if (!canMoveCanvasLayerToParent(draggedLayer, parentFrameId)) return null;
  const targetIndex = getCanvasInsertionIndex(parentFrameId, draggedLayer, event.clientX, event.clientY);
  return {
    parentFrameId,
    targetIndex,
    mode: "inside",
    targetElement: getCanvasParentElement(parentFrameId),
    key: `${parentFrameId ?? "root"}:${targetIndex}:inside`,
  };
}

function createCanvasDragPlaceholder(element) {
  const bounds = element.getBoundingClientRect();
  const placeholder = document.createElement("div");
  placeholder.className = "canvas-drop-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.style.width = `${bounds.width}px`;
  placeholder.style.height = `${bounds.height}px`;
  placeholder.style.flex = "0 0 auto";
  placeholder.style.alignSelf = getComputedStyle(element).alignSelf;
  return placeholder;
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
  return positions;
}

function captureCanvasLayerPositions(usePlaceholderForDraggedLayer = false) {
  if (!(canvasRootStack instanceof HTMLElement)) return new Map();
  const elements = Array.from(canvasRootStack.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector"));
  return captureCanvasItemPositions(
    elements,
    (element) => element,
    (element) => usePlaceholderForDraggedLayer && canvasDragSession?.element === element
      ? canvasDragSession.placeholder.getBoundingClientRect()
      : element.getBoundingClientRect(),
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
    canvasReflowAnimations.set(element, animation);
    animation.addEventListener("finish", () => {
      if (canvasReflowAnimations.get(element) === animation) canvasReflowAnimations.delete(element);
    }, { once: true });
    animation.addEventListener("cancel", () => {
      if (canvasReflowAnimations.get(element) === animation) canvasReflowAnimations.delete(element);
    }, { once: true });
  });
}

function animateCanvasLayerReflow(previousPositions) {
  if (!(canvasRootStack instanceof HTMLElement)) return;
  animateCanvasItemReflow(
    previousPositions,
    Array.from(canvasRootStack.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector")),
    { getAnimatedAncestor: (element) => element.parentElement?.closest(".canvas-frame") },
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
  const parentElement = getCanvasParentElement(intent.parentFrameId);
  if (!(parentElement instanceof HTMLElement)) return;
  const shouldLockInsideTarget = intent.mode === "inside"
    && intent.targetElement?.classList.contains("canvas-frame")
    && canvasDragSession.originalParentId !== intent.parentFrameId;
  const insideTargetBounds = shouldLockInsideTarget
    ? intent.targetElement.getBoundingClientRect()
    : null;
  const siblings = getLayerChildren(intent.parentFrameId).filter(
    (sibling) => !isSameLayerDescriptor(canvasDragSession.draggedLayer, { type: sibling.type, id: sibling.record.id }),
  );
  const referenceElement = siblings[intent.targetIndex]?.record.element ?? null;
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
  animateCanvasLayerReflow(previousPositions);
  requestAnimationFrame(syncResizeOverlay);
}

function startCanvasDragSession(draggedLayer, deferDraggingStyle = false) {
  const record = getLayerRecord(draggedLayer);
  if (!record || !(record.element instanceof HTMLElement)) return null;
  if (canvasDragSession && isSameLayerDescriptor(canvasDragSession.draggedLayer, draggedLayer)) {
    return canvasDragSession;
  }
  clearCanvasDragSession();
  const originalParentId = getLayerParentId(draggedLayer);
  const originalSiblings = getLayerChildren(originalParentId);
  const originalIndex = originalSiblings.findIndex(
    (sibling) => sibling.type === draggedLayer.type && sibling.record.id === draggedLayer.id,
  );
  const placeholder = createCanvasDragPlaceholder(record.element);
  record.element.insertAdjacentElement("beforebegin", placeholder);
  canvasDragSession = {
    draggedLayer,
    element: record.element,
    placeholder,
    preview: null,
    originalParentId,
    originalIndex,
    intent: null,
    targetElement: null,
    insideLock: null,
  };
  const applyDraggingStyle = () => {
    if (canvasDragSession?.element === record.element) record.element.classList.add("is-canvas-dragging");
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
  const parentElement = getCanvasParentElement(canvasDragSession.originalParentId);
  if (!(parentElement instanceof HTMLElement)) return;
  const siblings = getLayerChildren(canvasDragSession.originalParentId).filter(
    (sibling) => !isSameLayerDescriptor(canvasDragSession.draggedLayer, { type: sibling.type, id: sibling.record.id }),
  );
  const referenceElement = siblings[canvasDragSession.originalIndex]?.record.element ?? null;
  parentElement.insertBefore(canvasDragSession.placeholder, referenceElement);
  canvasDragSession.intent = null;
  animateCanvasLayerReflow(previousPositions);
}

function commitCanvasLayerDrop(draggedLayer, intent) {
  const previousPositions = captureCanvasLayerPositions(true);
  clearCanvasDragSession();
  const didMove = moveLayer(draggedLayer, intent.parentFrameId, intent.targetIndex);
  animateCanvasLayerReflow(previousPositions);
  return didMove;
}

function clearCanvasDragSession() {
  if (!canvasDragSession) return;
  clearCanvasDropTarget();
  canvasDragSession.preview?.remove();
  canvasDragSession.placeholder.remove();
  canvasDragSession.element.classList.remove("is-canvas-dragging");
  canvasDragSession = null;
  requestAnimationFrame(syncResizeOverlay);
}

function createCanvasVector(svgDefinition, x, y, parentRecord = null, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (options.recordHistory !== false) recordHistory();

  const vectorId = nextVectorId;
  nextVectorId += 1;
  const vector = document.createElement("div");
  const width = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Number(svgDefinition.width) || 24);
  const height = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Number(svgDefinition.height) || 24);
  const record = {
    id: vectorId,
    parentFrameId: parentRecord?.isComponent ? null : parentRecord?.id ?? null,
    element: vector,
    order: nextLayerOrder,
    name: svgDefinition.name || `Vector ${vectorId}`,
    svgSource: svgDefinition.source,
    originalSvgSource: svgDefinition.source,
  };
  nextLayerOrder += 1;

  vector.className = "canvas-vector";
  vector.draggable = true;
  vector.tabIndex = -1;
  vector.dataset.vectorId = String(vectorId);
  vector.dataset.width = String(width);
  vector.dataset.height = String(height);
  vector.dataset.widthMode = "fixed";
  vector.dataset.heightMode = "fixed";
  vector.dataset.layerVisibility = "visible";
  vector.setAttribute("aria-label", record.name);
  vector.setAttribute("aria-selected", "false");
  vector.append(createCanvasSvg(record.svgSource));

  if (parentRecord) {
    parentRecord.element.append(vector);
    if (!parentRecord.isComponent) expandedFrameIds.add(parentRecord.id);
  } else {
    canvasRootStack?.append(vector);
  }

  vector.addEventListener("click", (event) => {
    event.stopPropagation();
    if (consumeSuppressedCanvasClick(event)) return;
    selectCanvasVector(vector, event.shiftKey || event.ctrlKey || event.metaKey);
  });
  vector.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "vector", vectorId);
    startCanvasDragSession({ type: "vector", id: vectorId }, true);
  });

  vectorRecords.push(record);
  vector.dataset.vectorColor = getVectorRenderedColor(record);
  vector.dataset.vectorColorOpacity = "100";
  applyAllLayerSizing();
  renderTree();
  if (options.select !== false) selectCanvasVector(vector);
  return record;
}

function createCanvasText(parentRecord, x, y, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (options.recordHistory !== false) recordHistory();
  clearLayerSelection();

  const textId = nextTextId;
  nextTextId += 1;
  const text = document.createElement("div");
  const initialTextContent = options.textContent == null ? "" : String(options.textContent);
  const record = {
    id: textId,
    parentFrameId: parentRecord?.isComponent ? null : parentRecord?.id ?? null,
    element: text,
    order: nextLayerOrder,
    isNew: options.isNew !== false,
    name: options.useDefaultName === true
      ? `Text ${textId}`
      : options.name == null ? undefined : String(options.name),
  };
  nextLayerOrder += 1;

  text.className = "canvas-text";
  text.classList.toggle("is-new-empty", record.isNew && initialTextContent.length === 0);
  text.draggable = true;
  text.tabIndex = -1;
  text.dataset.textId = String(textId);
  text.textContent = initialTextContent;
  text.contentEditable = "false";
  text.spellcheck = false;
  text.setAttribute("aria-label", `Text ${textId}`);
  text.setAttribute("aria-selected", "false");
  text.dataset.fontFamily = DEFAULT_FONT_FAMILY;
  text.dataset.fontWeight = String(DEFAULT_FONT_WEIGHT);
  text.dataset.fontSize = "14";
  text.dataset.lineHeight = "Auto";
  text.dataset.letterSpacing = "0%";
  text.dataset.textColor = "#000000";
  text.dataset.textColorOpacity = "100";
  text.dataset.alignment = "top-left";
  text.dataset.widthMode = "hug";
  text.dataset.heightMode = "hug";
  text.dataset.layerVisibility = "visible";
  text.style.fontFamily = `${JSON.stringify(DEFAULT_FONT_FAMILY)}, sans-serif`;
  text.style.fontWeight = String(DEFAULT_FONT_WEIGHT);
  text.style.fontSize = "14px";
  text.style.lineHeight = "normal";
  text.style.letterSpacing = "0em";
  text.style.color = "#000000";
  applyTextAlignment(text);

  if (parentRecord) {
    parentRecord.element.append(text);
  } else {
    canvasRootStack?.append(text);
  }

  text.addEventListener("click", (event) => {
    event.stopPropagation();
    if (consumeSuppressedCanvasClick(event)) return;
    if (activeTool === "text") startEditingText(text);
    else selectCanvasText(text, event.shiftKey || event.ctrlKey || event.metaKey);
  });
  text.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startEditingText(text);
  });
  text.addEventListener("input", () => {
    if (!record.isNew) recordHistoryForGesture(text);
    const hasContent = (text.textContent ?? "").length > 0;
    componentProps.forEach((prop) => {
      if (prop.type === "string" && prop.targetTextId === record.id) {
        prop.defaultValue = text.textContent ?? "";
      }
    });
    text.classList.toggle("is-new-empty", record.isNew && !hasContent);
    const textKey = getLayerKey("text", record.id);
    if (record.isNew && hasContent && !selectedLayerKeys.has(textKey)) {
      selectCanvasText(text);
    } else if (record.isNew && !hasContent && selectedLayerKeys.has(textKey)) {
      removeLayerKeyFromSelection(textKey);
      syncElementSelectionStyles();
    }
    if (variantInstances.length > 0) scheduleVariantInstanceRender();
    redoHistory.length = 0;
    renderTree();
  });
  text.addEventListener("blur", () => {
    if (isRestoringHistory) return;
    endHistoryGesture(text);
    if (record.isNew && (text.textContent ?? "").length === 0) {
      selectTool("select");
      removeCanvasText(text);
      return;
    }

    const wasNewText = record.isNew;
    record.isNew = false;
    text.classList.remove("is-new-empty");
    text.contentEditable = "false";
    text.draggable = true;
    if (wasNewText) {
      selectTool("select");
    }
  });
  text.addEventListener("dragstart", (event) => {
    if (text.isContentEditable) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    setLayerDragData(event, "text", textId);
    startCanvasDragSession({ type: "text", id: textId }, true);
  });

  textRecords.push(record);
  applyAllLayerSizing();
  renderTree();
  if (options.beginEditing !== false) startEditingText(text, false);
  return record;
}

function createCanvasFrame(x, y, parentRecord = null, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (options.recordHistory !== false) recordHistory();

  const frameId = nextFrameId;
  nextFrameId += 1;
  const frame = document.createElement("div");
  const record = {
    id: frameId,
    parentId: parentRecord?.isComponent ? null : parentRecord?.id ?? null,
    element: frame,
    order: nextLayerOrder,
    name: `Frame ${frameId}`,
  };
  nextLayerOrder += 1;

  frame.className = "canvas-frame";
  frame.draggable = true;
  frame.tabIndex = -1;
  frame.dataset.frameId = String(frameId);
  frame.setAttribute("aria-label", `Frame ${frameId}`);
  frame.setAttribute("aria-selected", "false");
  frame.dataset.paddingLeft = "10";
  frame.dataset.paddingTop = "10";
  frame.dataset.paddingRight = "10";
  frame.dataset.paddingBottom = "10";
  frame.dataset.width = "100";
  frame.dataset.height = "100";
  frame.dataset.widthMode = "fixed";
  frame.dataset.heightMode = "fixed";
  frame.dataset.radius = "0";
  frame.dataset.frameColor = "";
  frame.dataset.frameColorOpacity = "100";
  frame.dataset.direction = "horizontal";
  frame.dataset.alignment = "top-left";
  frame.dataset.gap = "10";
  frame.dataset.gapMode = "fixed";
  frame.dataset.outlineColor = "";
  frame.dataset.outlineColorOpacity = "100";
  frame.dataset.outlinePosition = "inside";
  frame.dataset.outlineWeight = "1";
  frame.dataset.htmlTag = "div";
  frame.dataset.layerVisibility = "visible";
  frame.style.width = "100px";
  frame.style.height = "100px";
  frame.style.backgroundColor = "";
  if (parentRecord) {
    frame.style.left = "";
    frame.style.top = "";
  } else {
    frame.style.left = `${x}px`;
    frame.style.top = `${y}px`;
  }

  frame.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target !== frame) return;

    if (consumeSuppressedCanvasClick(event)) return;

    if (activeTool === "text") {
      const frameBounds = frame.getBoundingClientRect();
      createCanvasText(record, event.clientX - frameBounds.left, event.clientY - frameBounds.top);
      return;
    }

    if (activeTool === "frame") {
      createCanvasFrame(0, 0, record);
      expandedFrameIds.add(record.id);
      selectTool("select");
      return;
    }

    selectCanvasFrame(frame, event.shiftKey || event.ctrlKey || event.metaKey);
  });
  frame.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "frame", frameId);
    startCanvasDragSession({ type: "frame", id: frameId }, true);
  });

  frameRecords.push(record);
  if (parentRecord) {
    parentRecord.element.append(frame);
    if (!parentRecord.isComponent) expandedFrameIds.add(parentRecord.id);
  } else {
    if (canvasRootStack instanceof HTMLElement) canvasRootStack.append(frame);
    else canvas.insertBefore(frame, toolbar);
  }
  applyAllLayerSizing();
  applyFrameAlignment(frame);
  applyFrameOutline(frame);
  renderTree();
  if (options.select !== false) selectCanvasFrame(frame);
  return record;
}

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
      selectVariantInstance(variantSelection.instanceId, { layerTarget: getLayerKey(type, record.id) });
      return;
    }
    if (type === "frame") selectCanvasFrame(record.element);
    else if (type === "text") selectCanvasText(record.element);
    else selectCanvasVector(record.element);
  };

  recordHistory();
  isBatchingHistory = true;
  try {
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
  } finally {
    isBatchingHistory = false;
  }
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

  recordHistory();
  isBatchingHistory = true;
  try {
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
  } finally {
    isBatchingHistory = false;
  }
}

function reorderPrimaryLayer(step = 0, edge = null) {
  const layer = getPrimaryLayerDescriptor();
  if (!layer || layer.type === "component") return false;
  const parentId = layer.type === "frame" ? layer.record.parentId : layer.record.parentFrameId;
  const siblings = getLayerChildren(parentId);
  const currentIndex = siblings.findIndex(
    (sibling) => sibling.type === layer.type && sibling.record.id === layer.record.id,
  );
  if (currentIndex < 0) return false;
  const targetIndex = edge === "back"
    ? 0
    : edge === "front"
      ? siblings.length
      : Math.max(0, Math.min(siblings.length - 1, currentIndex + step));
  return moveLayer({ type: layer.type, id: layer.record.id }, parentId, targetIndex);
}

function selectHierarchyChild() {
  const layer = getPrimaryLayerDescriptor();
  if (!layer) return false;
  const children = layer.type === "component"
    ? getLayerChildren(null)
    : layer.type === "frame" ? getLayerChildren(layer.record.id) : [];
  if (children.length === 0) return false;

  const childKeys = children.map((child) => getLayerKey(child.type, child.record.id));
  selectLayerKeys(childKeys, childKeys[childKeys.length - 1]);
  syncElementSelectionStyles();
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

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTool(button.getAttribute("data-tool") || "select");
  });
});

vectorImportButton?.addEventListener("click", () => {
  if (vectorFileInput instanceof HTMLInputElement) vectorFileInput.click();
});

function getDroppedSvgFile(dataTransfer) {
  return Array.from(dataTransfer?.files ?? []).find((file) => (
    file.type === "image/svg+xml" || /\.svg$/i.test(file.name)
  )) ?? null;
}

function hasFileTransfer(dataTransfer) {
  return Array.from(dataTransfer?.types ?? []).includes("Files")
    || (dataTransfer?.files?.length ?? 0) > 0;
}

async function importSvgFile(file, clientX = null, clientY = null) {
  if (!(file instanceof File) || !(canvas instanceof HTMLElement)) return false;
  try {
    const sanitized = sanitizeSvgText(await file.text());
    const canvasBounds = canvas.getBoundingClientRect();
    const x = Number.isFinite(clientX)
      ? Math.max(0, Math.round(clientX - canvasBounds.left))
      : Math.max(0, Math.round((canvasBounds.width - sanitized.width) / 2));
    const y = Number.isFinite(clientY)
      ? Math.max(0, Math.round(clientY - canvasBounds.top))
      : Math.max(0, Math.round((canvasBounds.height - sanitized.height) / 2));
    const name = file.name.replace(/\.svg$/i, "").trim() || `Vector ${nextVectorId}`;
    createCanvasVector({ ...sanitized, name }, x, y);
    selectTool("select");
    return true;
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to import the selected SVG.");
    return false;
  }
}

vectorFileInput?.addEventListener("change", async () => {
  if (!(vectorFileInput instanceof HTMLInputElement)) return;
  const file = vectorFileInput.files?.[0];
  vectorFileInput.value = "";
  if (file) await importSvgFile(file);
});

canvas?.addEventListener("dragover", (event) => {
  if (!hasFileTransfer(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
}, true);

canvas?.addEventListener("drop", (event) => {
  const file = getDroppedSvgFile(event.dataTransfer);
  if (!file) return;
  event.preventDefault();
  event.stopPropagation();
  importSvgFile(file, event.clientX, event.clientY);
}, true);

canvas?.addEventListener("dragover", (event) => {
  if (hasFileTransfer(event.dataTransfer)) return;
  const draggedLayer = canvasDragSession?.draggedLayer ?? getLayerDragData(event);
  if (!draggedLayer) return;
  const session = canvasDragSession ?? startCanvasDragSession(draggedLayer);
  const intent = session ? getCanvasDropIntent(event, draggedLayer) : null;
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
  const intent = getCanvasDropIntent(event, draggedLayer) ?? canvasDragSession?.intent;
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

function getPointerCanvasDropIntent(event, draggedLayer) {
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
  }, draggedLayer);
}

function createCanvasPointerDragPreview(pointerDrag, event) {
  if (!canvasDragSession || canvasDragSession.preview) return;
  const bounds = canvasDragSession.element.getBoundingClientRect();
  const preview = canvasDragSession.element.cloneNode(true);
  preview.classList.remove("is-canvas-dragging");
  preview.classList.add("canvas-drag-preview");
  preview.setAttribute("aria-hidden", "true");
  preview.removeAttribute("draggable");
  preview.style.width = `${bounds.width}px`;
  preview.style.height = `${bounds.height}px`;
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

function updateCanvasPointerDrag(event) {
  if (!canvasPointerDrag || event.pointerId !== canvasPointerDrag.pointerId) return false;
  const distance = Math.hypot(
    event.clientX - canvasPointerDrag.startX,
    event.clientY - canvasPointerDrag.startY,
  );
  if (!canvasPointerDrag.hasStarted && distance < CANVAS_DRAG_THRESHOLD) return false;

  if (!canvasPointerDrag.hasStarted) {
    canvasPointerDrag.hasStarted = true;
    selectDraggedCanvasLayer(canvasPointerDrag.draggedLayer);
    startCanvasDragSession(canvasPointerDrag.draggedLayer);
    createCanvasPointerDragPreview(canvasPointerDrag, event);
  }

  event.preventDefault();
  event.stopPropagation();
  positionCanvasPointerDragPreview(canvasPointerDrag, event);
  const intent = getPointerCanvasDropIntent(event, canvasPointerDrag.draggedLayer);
  if (intent) previewCanvasDropIntent(intent);
  else restoreCanvasDragPreview();
  return true;
}

function finishCanvasPointerDrag(event, shouldCommit) {
  if (!canvasPointerDrag || event.pointerId !== canvasPointerDrag.pointerId) return;
  const pointerDrag = canvasPointerDrag;
  if (pointerDrag.hasStarted) updateCanvasPointerDrag(event);
  const intent = shouldCommit ? canvasDragSession?.intent ?? null : null;
  canvasPointerDrag = null;

  pointerDrag.element.draggable = pointerDrag.wasDraggable;
  if (pointerDrag.element.hasPointerCapture(event.pointerId)) {
    pointerDrag.element.releasePointerCapture(event.pointerId);
  }
  if (!pointerDrag.hasStarted) return;

  event.preventDefault();
  event.stopPropagation();
  if (intent) commitCanvasLayerDrop(pointerDrag.draggedLayer, intent);
  else clearCanvasDragSession();
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
  const element = getCanvasLayerElementFromTarget(event.target);
  const draggedLayer = getCanvasLayerDescriptor(element);
  if (!(element instanceof HTMLElement) || !draggedLayer || element.isContentEditable) return;
  if (!event.shiftKey && !event.ctrlKey && !event.metaKey) selectDraggedCanvasLayer(draggedLayer);
  element.focus({ preventScroll: true });
  const bounds = element.getBoundingClientRect();

  canvasPointerDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    grabOffsetX: event.clientX - bounds.left,
    grabOffsetY: event.clientY - bounds.top,
    draggedLayer,
    element,
    wasDraggable: element.draggable,
    hasStarted: false,
  };
  element.draggable = false;
  element.setPointerCapture(event.pointerId);
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

function applyMarqueeSelection(selectionBounds) {
  if (!selectionDrag || !currentComponent) return;
  if (variantInstances.length > 0) {
    const matches = [];
    variantInstances.forEach((instance) => {
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(instance.id))}"]`);
      const root = preview?.querySelector(".canvas-root-stack");
      if (!(root instanceof HTMLElement)) return;
      if (isRectEnclosed(root.getBoundingClientRect(), selectionBounds)) {
        matches.push({ instanceId: instance.id, target: null });
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
        if (isMatch) matches.push({ instanceId: instance.id, target: `${type}:${id}` });
      });
    });
    const match = matches[matches.length - 1];
    if (match) {
      selectVariantState(match.instanceId, match.target);
      clearMasterSelectionForVariant();
    } else if (!selectionDrag.additive) {
      selectCanvasState();
      clearElementSelection();
    }
    renderTree();
    return;
  }
  const nextKeys = new Set(selectionDrag.additive ? selectionDrag.initialKeys : []);
  const componentIsEnclosed = isRectEnclosed(canvasRootStack.getBoundingClientRect(), selectionBounds);

  if (componentIsEnclosed) {
    selectComponentState(currentComponent.id);
  } else {
    frameRecords.forEach((record) => {
      if (isRectEnclosed(record.element.getBoundingClientRect(), selectionBounds)) {
        nextKeys.add(getLayerKey("frame", record.id));
      }
    });
    textRecords.forEach((record) => {
      if (doRectsIntersect(record.element.getBoundingClientRect(), selectionBounds)) {
        nextKeys.add(getLayerKey("text", record.id));
      }
    });
    vectorRecords.forEach((record) => {
      if (doRectsIntersect(record.element.getBoundingClientRect(), selectionBounds)) {
        nextKeys.add(getLayerKey("vector", record.id));
      }
    });
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
  const target = event.target;
  const startsOnCanvasBackground = target === canvas
    || target === componentSet;
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
  if (wasDragged && event.type === "pointerup") suppressCanvasClickForGesture(event);
}

canvas?.addEventListener("pointerup", finishMarqueeSelection);
canvas?.addEventListener("pointercancel", finishMarqueeSelection);

canvas?.addEventListener("pointerdown", (event) => {
  if (!(canvas instanceof HTMLElement)) return;
  const activeText = document.activeElement instanceof HTMLElement
    && document.activeElement.classList.contains("canvas-text")
    && document.activeElement.isContentEditable
      ? document.activeElement
      : null;
  const target = event.target;
  const isCanvasSurface = target === canvas
    || target === canvasRootStack
    || (target instanceof HTMLElement && target.classList.contains("canvas-frame"));
  if (!activeText || !isCanvasSurface) return;

  suppressCanvasClickForGesture(event);
  if ((activeText.textContent ?? "").length > 0) selectCanvasText(activeText);
  selectTool("select");
}, true);

canvasRootStack?.addEventListener("click", (event) => {
  if (!(canvasRootStack instanceof HTMLElement) || event.target !== canvasRootStack || !currentComponent) return;
  event.stopPropagation();

  if (consumeSuppressedCanvasClick(event)) return;

  const bounds = canvasRootStack.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (activeTool === "text") {
    createCanvasText(currentComponent.frameRecord, x, y);
    return;
  }
  if (activeTool === "frame") {
    createCanvasFrame(0, 0, currentComponent.frameRecord);
    selectTool("select");
    return;
  }
  selectComponentTreeNode(currentComponent.id);
});

componentSet?.addEventListener("pointerdown", (event) => {
  const target = event.target;
  const isComponentSetSurface = target === componentSet;
  const isVisibleBaseComponentSurface = variantInstances.length === 0
    && target instanceof Element
    && canvasRootStack.contains(target)
    && !target.closest(".canvas-frame, .canvas-text, .canvas-vector");
  if (
    event.button !== 0
    || activeTool !== "select"
    || !currentComponent
    || !(target instanceof Element)
    || (!isComponentSetSurface && !isVisibleBaseComponentSurface)
  ) return;
  selectComponentTreeNode(currentComponent.id);
});

canvas?.addEventListener("click", (event) => {
  if (!(canvas instanceof HTMLElement) || event.target !== canvas) return;

  if (consumeSuppressedCanvasClick(event)) return;

  clearLayerSelection();
  if (variantInstances.length > 0) return;

  const canvasBounds = canvas.getBoundingClientRect();
  const x = event.clientX - canvasBounds.left;
  const y = event.clientY - canvasBounds.top;

  if (activeTool === "text") {
    createCanvasText(null, x, y);
    return;
  }

  if (activeTool !== "frame") return;
  createCanvasFrame(x, y);
  selectTool("select");
});

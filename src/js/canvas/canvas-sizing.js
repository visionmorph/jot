/* Canvas sizing calculations, resize overlay, and pointer resize interactions. */

resizeOverlay.className = "resize-overlay";
resizeOverlay.hidden = true;
resizeOverlay.setAttribute("aria-hidden", "true");
let gapInteraction = null;

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

["left", "top", "right", "bottom"].forEach((side) => {
  const handle = document.createElement("button");
  handle.className = `padding-handle padding-handle--${side}`;
  handle.type = "button";
  handle.tabIndex = -1;
  handle.dataset.paddingHandle = side;
  handle.setAttribute("aria-label", `Adjust ${side} padding`);
  const tooltip = document.createElement("span");
  tooltip.className = "canvas-spacing-tooltip";
  tooltip.setAttribute("role", "tooltip");
  handle.append(tooltip);
  resizeOverlay.append(handle);
});

function getGapHandleLayout(element) {
  const children = Array.from(element.children).filter((child) => (
    child instanceof HTMLElement
    && child.matches(".canvas-frame, .canvas-text, .canvas-vector")
    && getComputedStyle(child).display !== "none"
  ));
  const overlayBounds = element.getBoundingClientRect();
  const vertical = getComputedStyle(element).flexDirection === "column";
  const gapValue = Number.parseFloat(getComputedStyle(element).gap) || 0;
  return { children, overlayBounds, vertical, gapValue };
}

function positionGapHandles(element) {
  const handles = resizeOverlay.querySelectorAll("[data-gap-handle]");
  const { children, overlayBounds, vertical, gapValue } = getGapHandleLayout(element);
  handles.forEach((handle, index) => {
    const first = children[index]?.getBoundingClientRect();
    const second = children[index + 1]?.getBoundingClientRect();
    if (!(handle instanceof HTMLElement) || !first || !second) return;
    handle.style.left = `${vertical ? overlayBounds.width / 2 : (first.right + second.left) / 2 - overlayBounds.left}px`;
    handle.style.top = `${vertical ? (first.bottom + second.top) / 2 - overlayBounds.top : overlayBounds.height / 2}px`;
    const tooltip = handle.querySelector(".canvas-spacing-tooltip");
    if (tooltip instanceof HTMLElement) tooltip.textContent = String(Math.round(gapValue));
  });
}

function syncGapHandles(element, layer) {
  const isFrameTarget = layer?.type === "frame"
    || (layer?.type === "variant" && ["component", "frame"].includes(layer.targetType));
  if (!isFrameTarget) {
    resizeOverlay.querySelectorAll("[data-gap-handle]").forEach((handle) => handle.remove());
    return;
  }
  // Preserve pointer capture during a drag while still following the live layout.
  if (gapInteraction) {
    positionGapHandles(element);
    return;
  }
  resizeOverlay.querySelectorAll("[data-gap-handle]").forEach((handle) => handle.remove());
  const { children, overlayBounds, vertical, gapValue } = getGapHandleLayout(element);
  if (children.length < 2) return;
  children.slice(0, -1).forEach((child, index) => {
    const first = child.getBoundingClientRect();
    const second = children[index + 1].getBoundingClientRect();
    const handle = document.createElement("button");
    handle.className = `gap-handle gap-handle--${vertical ? "vertical" : "horizontal"}`;
    handle.type = "button";
    handle.tabIndex = -1;
    handle.dataset.gapHandle = vertical ? "vertical" : "horizontal";
    handle.setAttribute("aria-label", `Adjust gap ${index + 1}`);
    handle.style.left = `${vertical ? overlayBounds.width / 2 : (first.right + second.left) / 2 - overlayBounds.left}px`;
    handle.style.top = `${vertical ? (first.bottom + second.top) / 2 - overlayBounds.top : overlayBounds.height / 2}px`;
    const tooltip = document.createElement("span");
    tooltip.className = "canvas-spacing-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = String(Math.round(gapValue));
    handle.append(tooltip);
    resizeOverlay.append(handle);
  });
}

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

function isActiveResizeSelection(element) {
  if (!(element instanceof HTMLElement) || !element.classList.contains("is-selected")) return false;
  const preview = element.closest(".variant-preview[data-variant-instance-id]");
  if (!(preview instanceof HTMLElement)) return true;
  const instanceId = Number(preview.dataset.variantInstanceId);
  if (!Number.isFinite(instanceId) || !isVariantInstanceSelected(instanceId)) return false;
  const layer = getCanvasLayerDescriptor(element);
  const target = element.classList.contains("canvas-root-stack")
    ? "component:0"
    : layer ? `${layer.type}:${layer.id}` : null;
  return target === "component:0"
    ? isVariantRootSelected(instanceId)
    : Boolean(target && isVariantLayerTargetSelected(instanceId, target));
}

function syncResizeTargetHover(isHovered) {
  const selectedElement = getSelectedResizeElement();
  if (selectedElement instanceof HTMLElement) {
    selectedElement.classList.toggle("is-selection-hovered", isHovered);
  }
}

function positionSpacingTooltip(event) {
  const handle = event.target instanceof Element
    ? event.target.closest("[data-padding-handle], [data-gap-handle]")
    : null;
  const tooltip = handle?.querySelector(".canvas-spacing-tooltip");
  if (!(handle instanceof HTMLElement) || !(tooltip instanceof HTMLElement)) return;
  const bounds = handle.getBoundingClientRect();
  tooltip.style.left = `${event.clientX - bounds.left}px`;
  tooltip.style.top = `${event.clientY - bounds.top}px`;
}

resizeOverlay.addEventListener("pointerover", (event) => {
  syncResizeTargetHover(true);
  positionSpacingTooltip(event);
});
resizeOverlay.addEventListener("pointermove", positionSpacingTooltip);
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

function getPaddingHandleLimits(element) {
  const bounds = element.getBoundingClientRect();
  const children = Array.from(element.children).filter((child) => (
    child instanceof HTMLElement
    && child.matches(".canvas-frame, .canvas-text, .canvas-vector")
    && getComputedStyle(child).display !== "none"
  ));
  if (children.length === 0) {
    return { left: bounds.width / 2, top: bounds.height / 2, right: bounds.width / 2, bottom: bounds.height / 2 };
  }
  const childBounds = children.map((child) => child.getBoundingClientRect());
  return {
    left: Math.max(0, (Math.min(...childBounds.map((child) => child.left)) - bounds.left) / 2),
    top: Math.max(0, (Math.min(...childBounds.map((child) => child.top)) - bounds.top) / 2),
    right: Math.max(0, (bounds.right - Math.max(...childBounds.map((child) => child.right))) / 2),
    bottom: Math.max(0, (bounds.bottom - Math.max(...childBounds.map((child) => child.bottom))) / 2),
  };
}

function positionPaddingHandles(element, style) {
  const bounds = element.getBoundingClientRect();
  const limits = getPaddingHandleLimits(element);
  ["left", "top", "right", "bottom"].forEach((side) => {
    const property = `padding${side[0].toUpperCase()}${side.slice(1)}`;
    const value = Number.parseFloat(style[property]) || 0;
    const inset = value === 0 ? -1 : Math.min(value / 2, limits[side]);
    const handle = resizeOverlay.querySelector(`[data-padding-handle="${side}"]`);
    if (!(handle instanceof HTMLElement)) return;
    if (side === "left") handle.style.left = `${inset}px`;
    else if (side === "right") handle.style.left = `${bounds.width - inset}px`;
    else if (side === "top") handle.style.top = `${inset}px`;
    else handle.style.top = `${bounds.height - inset}px`;
  });
}

function positionResizeOverlay() {
  if (!(canvas instanceof HTMLElement)) return;
  if (canvasReflowAnimations.has(resizeOverlay)) return;
  if (activeTool !== "select" || canvasDragSession || canvasPointerDrag?.hasStarted) {
    resizeOverlay.hidden = true;
    resizeOverlay.classList.remove("is-active-selection");
    return;
  }

  const element = getSelectedResizeElement();
  if (
    !isActiveResizeSelection(element)
    || !element.isConnected
    || getComputedStyle(element).visibility === "hidden"
    || getComputedStyle(element).display === "none"
  ) {
    resizeOverlay.hidden = true;
    resizeOverlay.classList.remove("is-active-selection");
    resizeOverlay.classList.remove("shows-padding-handles");
    resizeOverlay.querySelectorAll("[data-gap-handle]").forEach((handle) => handle.remove());
    return;
  }

  const canvasBounds = canvas.getBoundingClientRect();
  const bounds = element.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    resizeOverlay.hidden = true;
    resizeOverlay.classList.remove("is-active-selection", "shows-padding-handles");
    resizeOverlay.querySelectorAll("[data-gap-handle]").forEach((handle) => handle.remove());
    return;
  }
  resizeOverlay.classList.add("is-active-selection");
  resizeOverlay.hidden = false;
  resizeOverlay.style.left = `${bounds.left - canvasBounds.left}px`;
  resizeOverlay.style.top = `${bounds.top - canvasBounds.top}px`;
  resizeOverlay.style.width = `${bounds.width}px`;
  resizeOverlay.style.height = `${bounds.height}px`;
  const layer = getSelectedResizeRecord();
  const showsPaddingHandles = layer?.type === "frame"
    || (layer?.type === "variant" && ["component", "frame"].includes(layer.targetType));
  resizeOverlay.classList.toggle("shows-padding-handles", showsPaddingHandles);
  if (showsPaddingHandles) {
    const style = getComputedStyle(element);
    positionPaddingHandles(element, style);
    ["left", "top", "right", "bottom"].forEach((side) => {
      const property = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      resizeOverlay.style.setProperty(`--padding-${side}`, style[property]);
      const tooltip = resizeOverlay.querySelector(`[data-padding-handle="${side}"] .canvas-spacing-tooltip`);
      if (tooltip instanceof HTMLElement) tooltip.textContent = String(Math.round(Number.parseFloat(style[property]) || 0));
    });
  }
  syncGapHandles(element, layer);
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

let paddingInteraction = null;

function selectSpacingInteractionVariant(interaction) {
  if (interaction?.layer.type !== "variant" || interaction.hasRecordedHistory) return false;
  const instanceId = selectedVariantInstanceId;
  if (!Number.isFinite(instanceId)) return false;
  selectVariantInstance(instanceId, { render: false, layerTarget: null });
  return true;
}

resizeOverlay.addEventListener("pointerdown", (event) => {
  const handle = event.target instanceof HTMLElement ? event.target.closest("[data-padding-handle]") : null;
  const layer = getSelectedResizeRecord();
  const element = getSelectedResizeElement();
  const side = handle?.dataset.paddingHandle;
  const isPaddingTarget = layer?.type === "frame"
    || (layer?.type === "variant" && ["component", "frame"].includes(layer.targetType));
  if (!(handle instanceof HTMLButtonElement)
    || !isActiveResizeSelection(element)
    || !isPaddingTarget
    || !["left", "top", "right", "bottom"].includes(side)
    || event.button !== 0) return;

  event.preventDefault();
  event.stopPropagation();
  const property = `padding${side[0].toUpperCase()}${side.slice(1)}`;
  paddingInteraction = {
    element,
    layer,
    side,
    property,
    handle,
    pointerX: event.clientX,
    pointerY: event.clientY,
    value: Number.parseFloat(getComputedStyle(element)[property]) || 0,
    hasRecordedHistory: false,
  };
  handle.setPointerCapture(event.pointerId);
});

function applyPaddingPointerPosition(clientX, clientY, coarse = false) {
  if (!paddingInteraction) return;
  const { element, layer, side, property } = paddingInteraction;
  const rawDelta = side === "left" || side === "right"
    ? clientX - paddingInteraction.pointerX
    : clientY - paddingInteraction.pointerY;
  const signedDelta = side === "right" || side === "bottom" ? -rawDelta : rawDelta;
  const delta = coarse ? Math.round(signedDelta / 10) * 10 : signedDelta;
  const value = Math.max(0, Math.round(paddingInteraction.value + delta));
  if (value === Number.parseFloat(getComputedStyle(element)[property])) return;
  if (!paddingInteraction.hasRecordedHistory) {
    recordHistory();
    paddingInteraction.hasRecordedHistory = true;
  }
  if (layer.type === "variant") {
    const setOverride = layer.target === "component:0"
      ? (name, nextValue) => setSelectedVariantStyleOverride(name, nextValue, { render: false, record: false })
      : (name, nextValue) => setSelectedVariantLayerOverride(name, nextValue, { render: false });
    setOverride(property, `${value}px`);
  } else {
    element.dataset[property] = String(value);
  }
  element.style[property] = `${value}px`;
  if (layer.type === "frame") {
    applyLayerSizing("frame", layer.record);
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  }
  syncInspectorToSelectedFrame();
  positionResizeOverlay();
  syncVariantActionOverlay();
}

resizeOverlay.addEventListener("pointermove", (event) => {
  if (!(event.target instanceof HTMLButtonElement)
    || !event.target.matches("[data-padding-handle]")
    || !event.target.hasPointerCapture(event.pointerId)) return;
  applyPaddingPointerPosition(event.clientX, event.clientY, event.altKey);
});

function finishPaddingInteraction(event) {
  if (!(event.target instanceof HTMLButtonElement)
    || !event.target.matches("[data-padding-handle]")
    || !event.target.hasPointerCapture(event.pointerId)) return;
  applyPaddingPointerPosition(event.clientX, event.clientY, event.altKey);
  const interaction = paddingInteraction;
  event.target.releasePointerCapture(event.pointerId);
  if (interaction?.layer.type === "variant" && interaction.hasRecordedHistory) renderVariantInstances();
  event.target.style.removeProperty(interaction?.side === "left" || interaction?.side === "right" ? "left" : "top");
  paddingInteraction = null;
  if (!selectSpacingInteractionVariant(interaction)) syncResizeOverlay();
}

resizeOverlay.addEventListener("pointerup", finishPaddingInteraction);
resizeOverlay.addEventListener("pointercancel", (event) => {
  if (event.target instanceof HTMLButtonElement
    && event.target.matches("[data-padding-handle]")
    && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  if (paddingInteraction?.layer.type === "variant") renderVariantInstances();
  if (paddingInteraction?.handle instanceof HTMLElement) {
    paddingInteraction.handle.style.removeProperty(
      paddingInteraction.side === "left" || paddingInteraction.side === "right" ? "left" : "top",
    );
  }
  paddingInteraction = null;
  syncResizeOverlay();
});

resizeOverlay.addEventListener("pointerdown", (event) => {
  const handle = event.target instanceof HTMLElement ? event.target.closest("[data-gap-handle]") : null;
  const layer = getSelectedResizeRecord();
  const element = getSelectedResizeElement();
  const direction = handle?.dataset.gapHandle;
  const isGapTarget = layer?.type === "frame"
    || (layer?.type === "variant" && ["component", "frame"].includes(layer.targetType));
  if (!(handle instanceof HTMLButtonElement)
    || !isActiveResizeSelection(element)
    || !isGapTarget
    || !["horizontal", "vertical"].includes(direction)
    || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  gapInteraction = {
    element,
    layer,
    direction,
    handle,
    pointerX: event.clientX,
    pointerY: event.clientY,
    value: Number.parseFloat(getComputedStyle(element).gap) || 0,
    hasRecordedHistory: false,
  };
  handle.setPointerCapture(event.pointerId);
});

function applyGapPointerPosition(clientX, clientY, coarse = false) {
  if (!gapInteraction) return;
  const { element, layer, direction } = gapInteraction;
  const rawDelta = direction === "vertical"
    ? clientY - gapInteraction.pointerY
    : clientX - gapInteraction.pointerX;
  const delta = coarse ? Math.round(rawDelta / 10) * 10 : rawDelta;
  const value = Math.max(0, Math.round(gapInteraction.value + delta));
  if (value === Number.parseFloat(getComputedStyle(element).gap)) return;
  if (!gapInteraction.hasRecordedHistory) {
    recordHistory();
    gapInteraction.hasRecordedHistory = true;
  }
  if (layer.type === "variant") {
    const setOverride = layer.target === "component:0"
      ? (name, nextValue) => setSelectedVariantStyleOverride(name, nextValue, { render: false, record: false })
      : (name, nextValue) => setSelectedVariantLayerOverride(name, nextValue, { render: false });
    setOverride("gap", `${value}px`);
  } else {
    element.dataset.gap = String(value);
    element.dataset.gapMode = "fixed";
  }
  element.style.gap = `${value}px`;
  syncInspectorToSelectedFrame();
  positionResizeOverlay();
  syncVariantActionOverlay();
}

resizeOverlay.addEventListener("pointermove", (event) => {
  if (!(event.target instanceof HTMLButtonElement)
    || !event.target.matches("[data-gap-handle]")
    || !event.target.hasPointerCapture(event.pointerId)) return;
  applyGapPointerPosition(event.clientX, event.clientY, event.altKey);
});

resizeOverlay.addEventListener("pointerup", (event) => {
  if (!(event.target instanceof HTMLButtonElement)
    || !event.target.matches("[data-gap-handle]")
    || !event.target.hasPointerCapture(event.pointerId)) return;
  applyGapPointerPosition(event.clientX, event.clientY, event.altKey);
  const interaction = gapInteraction;
  event.target.releasePointerCapture(event.pointerId);
  if (interaction?.layer.type === "variant") {
    if (interaction.hasRecordedHistory) renderVariantInstances();
  } else if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  gapInteraction = null;
  if (!selectSpacingInteractionVariant(interaction)) syncResizeOverlay();
});

resizeOverlay.addEventListener("pointercancel", (event) => {
  if (event.target instanceof HTMLButtonElement
    && event.target.matches("[data-gap-handle]")
    && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  if (gapInteraction?.layer.type === "variant") renderVariantInstances();
  gapInteraction = null;
  syncResizeOverlay();
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
  if (!(handle instanceof HTMLButtonElement) || !isActiveResizeSelection(element) || !layer || event.button !== 0) return;

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

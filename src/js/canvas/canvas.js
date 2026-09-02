/* Shared canvas tools, mutation coordination, and surface interactions. */

let canvasMutationDepth = 0;

let pendingCanvasMutationEffects = {
  sizing: false,
  selection: false,
  tree: false,
};

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
    toolButton.setAttribute("aria-pressed", String(isSelected));
  });
  requestAnimationFrame(syncResizeOverlay);
}

function queueCanvasMutationEffects(effects = {}) {
  pendingCanvasMutationEffects.sizing ||= effects.sizing === true;
  pendingCanvasMutationEffects.selection ||= effects.selection === true;
  pendingCanvasMutationEffects.tree ||= effects.tree === true;
  if (canvasMutationDepth === 0) flushCanvasMutationEffects();
}

function flushCanvasMutationEffects() {
  const effects = pendingCanvasMutationEffects;
  pendingCanvasMutationEffects = {
    sizing: false,
    selection: false,
    tree: false,
  };
  if (effects.sizing) applyAllLayerSizing();
  if (effects.selection) syncElementSelectionStyles();
  if (effects.tree) renderTree();
}

function runCanvasMutation(callback, options = {}) {
  const isOuterMutation = canvasMutationDepth === 0;
  const previousBatchingHistory = isBatchingHistory;
  if (isOuterMutation && options.history !== false) recordHistory();
  if (isOuterMutation) isBatchingHistory = true;
  canvasMutationDepth += 1;
  try {
    return callback();
  } finally {
    canvasMutationDepth -= 1;
    if (isOuterMutation) {
      isBatchingHistory = previousBatchingHistory;
      flushCanvasMutationEffects();
    }
  }
}


function removeCanvasText(textElement) {
  const textRecord = textRecords.find((record) => record.element === textElement);
  textElement.remove();
  if (textRecord) {
    removeLayerKeyFromSelection(getLayerKey("text", textRecord.id));
    textRecords = textRecords.filter((record) => record.id !== textRecord.id);
  }
  if (selectedCanvasText === textElement) setPrimarySelectionToLatest();
  queueCanvasMutationEffects({ sizing: true, selection: true, tree: true });
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


toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTool(button.getAttribute("data-tool") || "select");
  });
});



canvas?.addEventListener("pointerdown", (event) => {
  if (!(canvas instanceof HTMLElement)) return;
  const activeText = document.activeElement instanceof HTMLElement
    && document.activeElement.classList.contains("canvas-text")
    && document.activeElement.isContentEditable
      ? document.activeElement
      : null;
  const hit = resolveCanvasHit(event.target);
  const isCanvasSurface = hit.kind === "canvas"
    || (hit.kind === "component-root" && hit.direct)
    || ((hit.kind === "layer" || hit.kind === "variant-layer") && hit.layer.type === "frame" && hit.direct);
  if (!activeText || !isCanvasSurface) return;

  suppressCanvasClickForGesture(event);
  if ((activeText.textContent ?? "").length > 0) selectCanvasText(activeText);
  selectTool("select");
}, true);

canvasRootStack?.addEventListener("click", (event) => {
  const hit = resolveCanvasHit(event.target);
  if (!(canvasRootStack instanceof HTMLElement) || hit.kind !== "component-root" || !hit.direct || !currentComponent) return;
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
  const hit = resolveCanvasHit(event.target);
  const isComponentSetSurface = hit.kind === "component-set";
  const isVisibleBaseComponentSurface = variantModel.getInstances().length === 0
    && hit.kind === "component-root";
  if (
    event.button !== 0
    || activeTool !== "select"
    || !currentComponent
    || (!isComponentSetSurface && !isVisibleBaseComponentSurface)
  ) return;
  selectComponentTreeNode(currentComponent.id);
});

canvas?.addEventListener("click", (event) => {
  const hit = resolveCanvasHit(event.target);
  if (!(canvas instanceof HTMLElement) || hit.kind !== "canvas") return;

  if (consumeSuppressedCanvasClick(event)) return;

  clearLayerSelection();
  if (variantModel.getInstances().length > 0) return;

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

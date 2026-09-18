/* Application initialization, global shortcuts, and startup rendering. */

let copiedVariantSelection = null;
let copiedLayerSelection = null;

function isClipboardTextEditing(target) {
  return target instanceof HTMLElement && (target.isContentEditable
    || Boolean(target.closest("input, textarea, select, .props-panel")));
}

document.addEventListener("copy", (event) => {
  if (isClipboardTextEditing(event.target) || !event.clipboardData) return;
  const layerCopy = captureSelectedLayerCopies();
  if (layerCopy.layers.length > 0) {
    const token = `Jot layers ${crypto.randomUUID()}`;
    copiedLayerSelection = { token, component: currentComponent, copy: layerCopy };
    event.clipboardData.setData("text/plain", token);
    event.preventDefault();
    return;
  }
  const variants = captureSelectedVariantCopies();
  if (variants.length === 0) return;
  const token = `Jot variants ${crypto.randomUUID()}`;
  copiedVariantSelection = {
    token,
    component: currentComponent,
    variants,
  };
  event.clipboardData.setData("text/plain", token);
  event.preventDefault();
});

document.addEventListener("paste", (event) => {
  if (!isClipboardTextEditing(event.target) && copiedLayerSelection
    && copiedLayerSelection.component === currentComponent
    && event.clipboardData?.getData("text/plain") === copiedLayerSelection.token) {
    event.preventDefault();
    insertLayerCopies(copiedLayerSelection.copy);
    return;
  }
  if (isClipboardTextEditing(event.target) || !copiedVariantSelection
    || copiedVariantSelection.component !== currentComponent
    || event.clipboardData?.getData("text/plain") !== copiedVariantSelection.token) return;
  event.preventDefault();
  insertVariantCopies(copiedVariantSelection.variants);
});

document.addEventListener("keydown", (event) => {
  const shortcutTarget = event.target;
  const isContentEditing = shortcutTarget instanceof HTMLElement && shortcutTarget.isContentEditable;
  const isFormEditing =
    shortcutTarget instanceof HTMLInputElement ||
    shortcutTarget instanceof HTMLTextAreaElement ||
    shortcutTarget instanceof HTMLSelectElement ||
    (shortcutTarget instanceof HTMLElement && Boolean(shortcutTarget.closest(".props-panel")));
  const isCommandShortcut = event.ctrlKey || event.metaKey;

  if (isCommandShortcut && event.key.toLowerCase() === "z" && !isContentEditing) {
    event.preventDefault();
    if (event.shiftKey) redoWorkspaceChange();
    else undoWorkspaceChange();
    return;
  }

  if (isCommandShortcut && event.key.toLowerCase() === "d" && !isContentEditing && !isFormEditing) {
    event.preventDefault();
    duplicateSelectedLayer();
    return;
  }

  if (event.key === "Escape") {
    const activeText = document.activeElement instanceof HTMLElement && document.activeElement.classList.contains("canvas-text")
      ? document.activeElement
      : null;
    selectTool("select");
    if (activeText) {
      if ((activeText.textContent ?? "").length > 0) selectCanvasText(activeText);
      activeText.blur();
    } else if (selectedCanvasText) {
      clearLayerSelection();
    } else if (selectedVariantId !== null) {
      clearLayerSelection();
    }
    return;
  }

  const isTyping =
    shortcutTarget instanceof HTMLInputElement ||
    shortcutTarget instanceof HTMLTextAreaElement ||
    shortcutTarget instanceof HTMLSelectElement ||
    (shortcutTarget instanceof HTMLElement && (shortcutTarget.isContentEditable || Boolean(shortcutTarget.closest(".props-panel"))));
  const lowerKey = event.key.toLowerCase();

  if (!isTyping && event.ctrlKey && event.altKey && !event.metaKey && !event.shiftKey && lowerKey === "a") {
    event.preventDefault();
    selectMatchingLayers();
    return;
  }

  if (!isTyping && event.shiftKey && !isCommandShortcut && !event.altKey && lowerKey === "a") {
    event.preventDefault();
    wrapSelectedLayersInFrame();
    return;
  }

  if (!isTyping && event.key === "Tab" && !isCommandShortcut && !event.altKey) {
    if (getSelectedVariantIds().length > 0 && getSelectedVariantLayerTargets().length === 0) {
      event.preventDefault();
      cycleSelectedVariant(event.shiftKey ? -1 : 1);
      return;
    }
    if (getPrimaryLayerDescriptor() || (!event.shiftKey && getSelectedVariantIds().length > 1)) {
      event.preventDefault();
      selectSiblingLayer(event.shiftKey ? -1 : 1);
      return;
    }
  }

  if (!isTyping && event.key === "Enter" && !isCommandShortcut && !event.altKey) {
    const selectedLayer = getPrimaryLayerDescriptor();
    if (!event.shiftKey && selectedLayer?.type === "text"
      && getSelectedVariantIds().length <= 1
      && getSelectedVariantLayerTargets().length <= 1 && selectedLayerKeys.size <= 1) {
      event.preventDefault();
      startEditingText(selectedLayer.record.element);
      return;
    }
    const didSelect = event.shiftKey ? selectHierarchyParent() : selectHierarchyChild();
    if (didSelect) event.preventDefault();
    return;
  }

  if (!isTyping && event.key === "\\" && !isCommandShortcut && !event.altKey) {
    if (selectHierarchyParent()) event.preventDefault();
    return;
  }

  if (!isTyping && /^[0-9]$/.test(event.key) && !isCommandShortcut && !event.shiftKey && !event.altKey) {
    if (selectedComponentId !== null || selectedLayerKeys.size > 0) {
      event.preventDefault();
      setSelectedLayersOpacity(event.key === "0" ? 100 : Number(event.key) * 10);
      return;
    }
  }

  if (!isTyping && (event.key === "]" || event.key === "[") && !event.altKey) {
    const hasVariantSelection = getSelectedVariantIds().length > 0
      && getSelectedVariantLayerTargets().length === 0;
    const hasLayerSelection = Boolean(getPrimaryLayerDescriptor() && selectedComponentId === null);
    if (hasVariantSelection || hasLayerSelection) {
      event.preventDefault();
      if (isCommandShortcut) reorderPrimaryLayer(event.key === "]" ? 1 : -1);
      else if (!event.shiftKey) reorderPrimaryLayer(0, event.key === "]" ? "front" : "back");
      return;
    }
  }

  if (!isTyping && ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)
    && !isCommandShortcut && !event.shiftKey && !event.altKey) {
    if (getSelectedNestedInstanceLayer()) {
      event.preventDefault();
      return;
    }
    const layer = getPrimaryLayerDescriptor();
    if (layer && layer.type !== "component") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      reorderPrimaryLayer(step);
    }
    return;
  }

  const toolShortcut = {
    v: "select",
    t: "text",
    f: "frame",
    a: "frame",
  }[lowerKey];

  if (!isTyping && toolShortcut && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    event.preventDefault();
    selectTool(toolShortcut);
    return;
  }

  if (event.key !== "Delete" && event.key !== "Backspace") return;

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest(".props-panel"))))
  ) return;

  const nestedInstanceLayer = getSelectedNestedInstanceLayer();
  if (nestedInstanceLayer) {
    event.preventDefault();
    setNestedInstanceLayerOverride(nestedInstanceLayer, "visibility", "hidden");
    renderTree();
    return;
  }

  let activeVariantLayerTarget = selectedVariantLayerTarget;
  let activeVariantId = selectedVariantId;
  let activeVariantLayerTargets = [...selectedVariantLayerTargets];
  const eventVariantLayer = target instanceof HTMLElement && !target.closest(".canvas-component-instance")
    ? target.closest(".variant-preview .canvas-frame, .variant-preview .canvas-text, .variant-preview .canvas-vector")
    : null;
  if (eventVariantLayer instanceof HTMLElement) {
    const type = eventVariantLayer.classList.contains("canvas-frame")
      ? "frame"
      : eventVariantLayer.classList.contains("canvas-text") ? "text" : "vector";
    const id = Number(eventVariantLayer.dataset[`${type}Id`]);
    if (Number.isFinite(id)) activeVariantLayerTarget = `${type}:${id}`;
    const previewId = Number(eventVariantLayer.closest(".variant-preview")?.dataset.variantId);
    if (Number.isFinite(previewId)) activeVariantId = previewId;
    if (activeVariantId !== null
      && !isVariantLayerTargetSelected(activeVariantId, activeVariantLayerTarget)) {
      activeVariantLayerTargets = activeVariantLayerTarget === null ? [] : [activeVariantLayerTarget];
      selectVariantState(activeVariantId, activeVariantLayerTarget);
    }
  }
  if (activeVariantId !== null && activeVariantLayerTarget === null) {
    const selectedLayer = componentSet?.querySelector(
      ".canvas-frame.is-selected, .canvas-text.is-selected, .canvas-vector.is-selected",
    );
    if (selectedLayer instanceof HTMLElement) {
      const type = selectedLayer.classList.contains("canvas-frame")
        ? "frame"
        : selectedLayer.classList.contains("canvas-text") ? "text" : "vector";
      const id = Number(selectedLayer.dataset[`${type}Id`]);
      if (Number.isFinite(id)) activeVariantLayerTarget = `${type}:${id}`;
    }
  }

  if (activeVariantId !== null && activeVariantLayerTarget === null) {
    event.preventDefault();
    removeSelectedVariants();
    return;
  }

  if (activeVariantId !== null && activeVariantLayerTarget !== null) {
    const targets = activeVariantLayerTargets.length > 0
      ? activeVariantLayerTargets
      : [activeVariantLayerTarget];
    if (targets.some((entry) => {
      const [type, rawId] = entry.split(":");
      return !LAYER_TYPES.includes(type) || !Number.isFinite(Number(rawId));
    })) return;
    selectLayerKeys(targets, activeVariantLayerTarget);
  }

  if (selectedComponentId !== null) {
    event.preventDefault();
    deleteSelectedComponent();
    return;
  }

  if (selectedLayerKeys.size === 0) return;

  event.preventDefault();
  deleteLayers([...selectedLayerKeys].map((key) => {
    const [type, id] = key.split(":");
    return { type, id: Number(id) };
  }));
});

initializeComponents();
observeCanvasComponentData();

loadGoogleFont(DEFAULT_FONT_FAMILY, DEFAULT_FONT_WEIGHT);

loadGoogleFont(DEFAULT_FONT_FAMILY, 600);

loadGoogleFont("JetBrains Mono", 400);

loadFontCatalog();

renderTree();

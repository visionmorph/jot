/* Canvas tools, layer rendering, editing, resizing, vector import, and direct manipulation. */

resizeOverlay.className = "resize-overlay";

resizeOverlay.hidden = true;

resizeOverlay.setAttribute("aria-hidden", "true");

RESIZE_HANDLE_DIRECTIONS.forEach((direction) => {
  const handle = document.createElement("button");
  handle.className = `resize-handle resize-handle--${direction}`;
  handle.type = "button";
  handle.tabIndex = -1;
  handle.dataset.resizeHandle = direction;
  handle.setAttribute("aria-label", `Resize ${direction}`);
  resizeOverlay.append(handle);
});

if (canvas instanceof HTMLElement) {
  canvas.insertBefore(resizeOverlay, toolbar instanceof Node ? toolbar : null);
}

function getSelectedResizeElement() {
  return selectedCanvasFrame || selectedCanvasText || selectedCanvasVector;
}

function getSelectedResizeRecord() {
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
  const element = getSelectedResizeElement();
  if (!(element instanceof HTMLElement) || !element.isConnected) {
    resizeOverlay.hidden = true;
    return;
  }

  const canvasBounds = canvas.getBoundingClientRect();
  const bounds = element.getBoundingClientRect();
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
}

function applyResizePointerPosition(clientX, clientY) {
  if (!resizeInteraction) return;
  const { element, layer, direction } = resizeInteraction;
  if (!element.isConnected) return;

  const deltaX = clientX - resizeInteraction.pointerX;
  const deltaY = clientY - resizeInteraction.pointerY;
  const changesWidth = direction.includes("e") || direction.includes("w");
  const changesHeight = direction.includes("n") || direction.includes("s");
  const nextWidth = changesWidth
    ? Math.max(0, Math.round(resizeInteraction.width + (direction.includes("w") ? -deltaX : deltaX)))
    : resizeInteraction.width;
  const nextHeight = changesHeight
    ? Math.max(0, Math.round(resizeInteraction.height + (direction.includes("n") ? -deltaY : deltaY)))
    : resizeInteraction.height;
  const widthChanged = changesWidth && nextWidth !== Number(element.dataset.width || resizeInteraction.width);
  const heightChanged = changesHeight && nextHeight !== Number(element.dataset.height || resizeInteraction.height);

  if (!widthChanged && !heightChanged) return;
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
  if (layer.type === "frame") syncInspectorToSelectedFrame();
  else if (layer.type === "text") syncSelectedTextSizeInputs();
  else syncInspectorToSelectedVector();
  positionResizeOverlay();
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
  applyResizePointerPosition(event.clientX, event.clientY);
});

resizeOverlay.addEventListener("pointerup", (event) => {
  if (!(event.target instanceof HTMLButtonElement) || !event.target.hasPointerCapture(event.pointerId)) return;
  applyResizePointerPosition(event.clientX, event.clientY);
  event.target.releasePointerCapture(event.pointerId);
  if (resizeInteraction?.layer.type === "text") resizeInteraction.element.draggable = true;
  resizeInteraction = null;
  syncResizeOverlay();
});

resizeOverlay.addEventListener("pointercancel", (event) => {
  if (event.target instanceof HTMLButtonElement && event.target.hasPointerCapture(event.pointerId)) {
    event.target.releasePointerCapture(event.pointerId);
  }
  if (resizeInteraction?.layer.type === "text") resizeInteraction.element.draggable = true;
  resizeInteraction = null;
  syncResizeOverlay();
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
}

function applyLayerSizing(type, record) {
  const element = record.element;
  const { parentId, parentDirection } = getLayerSizingContext(type, record);
  const widthMode = getLayerDimensionMode(element, "width", type === "text" ? "hug" : "fixed");
  const heightMode = getLayerDimensionMode(element, "height", type === "text" ? "hug" : "fixed");
  const isRoot = parentId === null;
  const mainDimension = parentDirection === "vertical" ? "height" : "width";
  const mainMode = mainDimension === "width" ? widthMode : heightMode;
  const crossMode = mainDimension === "width" ? heightMode : widthMode;

  const applyDimension = (dimension, mode, fallbackValue) => {
    if (mode === "fixed") {
      element.style[dimension] = `${element.dataset[dimension] || fallbackValue}px`;
    } else if (mode === "hug") {
      element.style[dimension] = "max-content";
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
  frameRecords.forEach((record) => applyLayerSizing("frame", record));
  textRecords.forEach((record) => applyLayerSizing("text", record));
  vectorRecords.forEach((record) => applyLayerSizing("vector", record));
  requestAnimationFrame(syncResizeOverlay);
}

function syncElementSelectionStyles() {
  clearElementSelection();
  selectedLayerKeys.forEach((key) => {
    const element = getElementForLayerKey(key);
    if (!(element instanceof HTMLElement)) return;
    element.classList.add("is-selected");
    element.setAttribute("aria-selected", "true");
  });
}

function clearElementSelection() {
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
  const selectionKeys = additive ? getFrameSelectionKeys(record.id) : [frameKey];

  if (!additive) selectedLayerKeys.clear();
  if (additive && selectedLayerKeys.has(frameKey)) {
    selectionKeys.forEach((key) => selectedLayerKeys.delete(key));
    setPrimarySelectionToLatest();
  } else {
    selectionKeys.forEach((key) => selectedLayerKeys.add(key));
    setPrimarySelectionFromKey(frameKey);
  }
  syncElementSelectionStyles();
  renderTree();
}

function selectCanvasText(textElement, additive = false) {
  const record = textRecords.find((textRecord) => textRecord.element === textElement);
  if (record) expandFramePath(record.parentFrameId);
  if (!record) return;
  const textKey = getLayerKey("text", record.id);
  if (!additive) selectedLayerKeys.clear();
  if (additive && selectedLayerKeys.has(textKey)) {
    selectedLayerKeys.delete(textKey);
    setPrimarySelectionToLatest();
  } else {
    selectedLayerKeys.add(textKey);
    setPrimarySelectionFromKey(textKey);
  }
  syncElementSelectionStyles();
  renderTree();
}

function selectCanvasVector(vectorElement, additive = false) {
  const record = vectorRecords.find((vectorRecord) => vectorRecord.element === vectorElement);
  if (record) expandFramePath(record.parentFrameId);
  if (!record) return;
  const vectorKey = getLayerKey("vector", record.id);
  if (!additive) selectedLayerKeys.clear();
  if (additive && selectedLayerKeys.has(vectorKey)) {
    selectedLayerKeys.delete(vectorKey);
    setPrimarySelectionToLatest();
  } else {
    selectedLayerKeys.add(vectorKey);
    setPrimarySelectionFromKey(vectorKey);
  }
  syncElementSelectionStyles();
  renderTree();
}

function clearLayerSelection() {
  if (selectedLayerKeys.size === 0) return;
  selectedLayerKeys.clear();
  clearElementSelection();
  selectedCanvasFrame = null;
  selectedCanvasText = null;
  selectedCanvasVector = null;
  renderTree();
}

function removeCanvasText(textElement, suppressCreationForCurrentClick = false) {
  const textRecord = textRecords.find((record) => record.element === textElement);
  textElement.remove();
  if (textRecord) {
    selectedLayerKeys.delete(getLayerKey("text", textRecord.id));
    textRecords = textRecords.filter((record) => record.id !== textRecord.id);
  }
  if (selectedCanvasText === textElement) setPrimarySelectionToLatest();
  syncElementSelectionStyles();

  if (suppressCreationForCurrentClick) {
    suppressNextTextCreation = true;
    setTimeout(() => {
      suppressNextTextCreation = false;
    }, 0);
  }

  renderTree();
}

function startEditingText(textElement, selectText = true) {
  if (selectText) selectCanvasText(textElement);
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

function createCanvasVector(svgDefinition, x, y, parentRecord = null, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (options.recordHistory !== false) recordHistory();

  const vectorId = nextVectorId;
  nextVectorId += 1;
  const vector = document.createElement("div");
  const width = Math.max(0, Number(svgDefinition.width) || 24);
  const height = Math.max(0, Number(svgDefinition.height) || 24);
  const record = {
    id: vectorId,
    parentFrameId: parentRecord?.id ?? null,
    element: vector,
    order: nextLayerOrder,
    name: svgDefinition.name || `Vector ${vectorId}`,
    svgSource: svgDefinition.source,
    originalSvgSource: svgDefinition.source,
  };
  nextLayerOrder += 1;

  vector.className = "canvas-vector";
  vector.draggable = true;
  vector.dataset.vectorId = String(vectorId);
  vector.dataset.width = String(width);
  vector.dataset.height = String(height);
  vector.dataset.widthMode = "fixed";
  vector.dataset.heightMode = "fixed";
  vector.setAttribute("aria-label", record.name);
  vector.setAttribute("aria-selected", "false");
  vector.append(createCanvasSvg(record.svgSource));

  if (parentRecord) {
    parentRecord.element.append(vector);
    expandedFrameIds.add(parentRecord.id);
  } else {
    vector.style.left = `${x}px`;
    vector.style.top = `${y}px`;
    canvas.insertBefore(vector, toolbar);
  }

  vector.addEventListener("click", (event) => {
    event.stopPropagation();
    selectCanvasVector(vector, event.ctrlKey);
  });
  vector.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "vector", vectorId);
  });

  vectorRecords.push(record);
  vector.dataset.vectorColor = getVectorRenderedColor(record);
  vector.dataset.vectorColorOpacity = "100";
  applyLayerSizing("vector", record);
  renderTree();
  if (options.select !== false) selectCanvasVector(vector);
  return record;
}

function createCanvasText(parentRecord, x, y, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
  if (suppressNextTextCreation) {
    suppressNextTextCreation = false;
    return;
  }
  if (options.recordHistory !== false) recordHistory();
  clearLayerSelection();

  const textId = nextTextId;
  nextTextId += 1;
  const text = document.createElement("div");
  const record = {
    id: textId,
    parentFrameId: parentRecord?.id ?? null,
    element: text,
    order: nextLayerOrder,
    isNew: true,
  };
  nextLayerOrder += 1;

  text.className = "canvas-text is-new-empty";
  text.draggable = true;
  text.dataset.textId = String(textId);
  text.contentEditable = "false";
  text.spellcheck = false;
  text.setAttribute("aria-label", `Text ${textId}`);
  text.setAttribute("aria-selected", "false");
  text.dataset.fontFamily = DEFAULT_FONT_FAMILY;
  text.dataset.fontWeight = String(DEFAULT_FONT_WEIGHT);
  text.dataset.fontSize = "14";
  text.dataset.lineHeight = "Auto";
  text.dataset.letterSpacing = "0%";
  text.dataset.textColor = "#ffffff";
  text.dataset.textColorOpacity = "100";
  text.dataset.alignment = "top-left";
  text.dataset.widthMode = "hug";
  text.dataset.heightMode = "hug";
  text.style.fontFamily = `${JSON.stringify(DEFAULT_FONT_FAMILY)}, sans-serif`;
  text.style.fontWeight = String(DEFAULT_FONT_WEIGHT);
  text.style.fontSize = "14px";
  text.style.lineHeight = "normal";
  text.style.letterSpacing = "0em";
  text.style.color = "#ffffff";
  applyTextAlignment(text);

  if (parentRecord) {
    parentRecord.element.append(text);
  } else {
    text.style.left = `${x}px`;
    text.style.top = `${y}px`;
    canvas.insertBefore(text, toolbar);
  }

  text.addEventListener("click", (event) => {
    event.stopPropagation();
    if (activeTool === "text") startEditingText(text);
    else selectCanvasText(text, event.ctrlKey);
  });
  text.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    startEditingText(text);
  });
  text.addEventListener("input", () => {
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
      selectedLayerKeys.delete(textKey);
      setPrimarySelectionToLatest();
      syncElementSelectionStyles();
    }
    redoHistory.length = 0;
    renderTree();
  });
  text.addEventListener("blur", () => {
    if (isRestoringHistory) return;
    if (record.isNew && (text.textContent ?? "").length === 0) {
      selectTool("select");
      removeCanvasText(text, true);
      return;
    }

    const wasNewText = record.isNew;
    record.isNew = false;
    text.classList.remove("is-new-empty");
    text.contentEditable = "false";
    text.draggable = true;
    if (wasNewText) {
      selectTool("select");
      suppressNextTextCreation = true;
      setTimeout(() => {
        suppressNextTextCreation = false;
      }, 0);
    }
  });
  text.addEventListener("dragstart", (event) => {
    if (text.isContentEditable) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    setLayerDragData(event, "text", textId);
  });

  textRecords.push(record);
  applyLayerSizing("text", record);
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
    parentId: parentRecord?.id ?? null,
    element: frame,
    order: nextLayerOrder,
  };
  nextLayerOrder += 1;

  frame.className = "canvas-frame";
  frame.draggable = true;
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
  frame.style.width = "100px";
  frame.style.height = "100px";
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

    if (suppressNextCanvasSurfaceClick) {
      suppressNextCanvasSurfaceClick = false;
      return;
    }

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

    selectCanvasFrame(frame, event.ctrlKey);
  });
  frame.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    setLayerDragData(event, "frame", frameId);
  });
  frame.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  });
  frame.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedLayer = getLayerDragData(event);
    if (draggedLayer) nestLayer(draggedLayer, frameId);
  });

  frameRecords.push(record);
  if (parentRecord) {
    parentRecord.element.append(frame);
    expandedFrameIds.add(parentRecord.id);
  } else {
    if (canvasRootStack instanceof HTMLElement) canvasRootStack.append(frame);
    else canvas.insertBefore(frame, toolbar);
  }
  applyLayerSizing("frame", record);
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

function duplicateTextRecord(sourceRecord, parentRecord, offsetRoot = false) {
  const source = sourceRecord.element;
  const x = Number.parseFloat(source.style.left || "0") + (offsetRoot ? 16 : 0);
  const y = Number.parseFloat(source.style.top || "0") + (offsetRoot ? 16 : 0);
  const duplicateRecord = createCanvasText(parentRecord, x, y, {
    beginEditing: false,
    recordHistory: false,
  });
  if (!duplicateRecord) return;

  const duplicate = duplicateRecord.element;
  copyElementDataset(source, duplicate, ["textId"]);
  duplicate.setAttribute("style", source.getAttribute("style") || "");
  duplicate.style.left = parentRecord ? "" : `${x}px`;
  duplicate.style.top = parentRecord ? "" : `${y}px`;
  duplicate.textContent = source.textContent ?? "";
  duplicate.contentEditable = "false";
  duplicateRecord.isNew = false;
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
  const selectedFrameRecord = getSelectedFrameRecord();
  const selectedTextRecord = getSelectedTextRecord();
  const selectedVectorRecord = getSelectedVectorRecord();
  if (!selectedFrameRecord && !selectedTextRecord && !selectedVectorRecord) return;

  recordHistory();
  isBatchingHistory = true;
  suppressNextTextCreation = false;
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
      selectCanvasFrame(duplicateRecord.element);
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
      );
      if (!duplicateRecord) return;
      moveLayerRelative(
        { type: "text", id: duplicateRecord.id },
        { type: "text", id: selectedTextRecord.id },
        "after",
      );
      selectCanvasText(duplicateRecord.element);
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
    selectCanvasVector(duplicateRecord.element);
  } finally {
    isBatchingHistory = false;
  }
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTool(button.getAttribute("data-tool") || "select");
  });
});

vectorImportButton?.addEventListener("click", () => {
  if (vectorFileInput instanceof HTMLInputElement) vectorFileInput.click();
});

vectorFileInput?.addEventListener("change", async () => {
  if (!(vectorFileInput instanceof HTMLInputElement) || !(canvas instanceof HTMLElement)) return;
  const file = vectorFileInput.files?.[0];
  vectorFileInput.value = "";
  if (!file) return;

  try {
    const sanitized = sanitizeSvgText(await file.text());
    const canvasBounds = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.round((canvasBounds.width - sanitized.width) / 2));
    const y = Math.max(0, Math.round((canvasBounds.height - sanitized.height) / 2));
    const name = file.name.replace(/\.svg$/i, "").trim() || `Vector ${nextVectorId}`;
    createCanvasVector({ ...sanitized, name }, x, y);
    selectTool("select");
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "Unable to import the selected SVG.");
  }
});

canvas?.addEventListener("dragover", (event) => {
  if (event.target !== canvas && event.target !== canvasRootStack) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
});

canvas?.addEventListener("drop", (event) => {
  if (!(canvas instanceof HTMLElement) || (event.target !== canvas && event.target !== canvasRootStack)) return;
  event.preventDefault();
  const draggedLayer = getLayerDragData(event);
  if (!draggedLayer) return;
  const bounds = canvas.getBoundingClientRect();
  moveLayer(
    draggedLayer,
    null,
    getLayerChildren(null).length,
    { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
  );
});

canvas?.addEventListener("pointerdown", (event) => {
  if (!(canvas instanceof HTMLElement)) return;
  const activeText = document.activeElement instanceof HTMLElement
    && document.activeElement.classList.contains("canvas-text")
    && document.activeElement.isContentEditable
      ? document.activeElement
      : null;
  const target = event.target;
  const isCanvasSurface = target === canvas
    || (target instanceof HTMLElement && target.classList.contains("canvas-frame"));
  if (!activeText || !isCanvasSurface) return;

  suppressNextCanvasSurfaceClick = true;
  if ((activeText.textContent ?? "").length > 0) selectCanvasText(activeText);
  selectTool("select");
}, true);

canvas?.addEventListener("click", (event) => {
  if (!(canvas instanceof HTMLElement) || event.target !== canvas) return;

  if (suppressNextCanvasSurfaceClick) {
    suppressNextCanvasSurfaceClick = false;
    return;
  }

  clearLayerSelection();
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

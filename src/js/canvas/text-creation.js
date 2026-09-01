/* Canvas text creation, editing lifecycle, and text interaction wiring. */

function createCanvasText(parentRecord, x, y, options = {}) {
  const record = runCanvasMutation(
    () => createCanvasTextRecord(parentRecord, x, y, options),
    { history: options.recordHistory !== false },
  );
  if (record && options.beginEditing !== false) startEditingText(record.element, false);
  return record;
}

function createCanvasTextRecord(parentRecord, x, y, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;
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
    const hit = resolveCanvasHit(event.target);
    if (hit.kind !== "layer" || hit.element !== text) return;
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
    const currentText = syncTextRecordContent(record, text.textContent ?? "", { writeElement: false });
    const hasContent = currentText.length > 0;
    text.classList.toggle("is-new-empty", record.isNew && !hasContent);
    const textKey = getLayerKey("text", record.id);
    if (record.isNew && hasContent && !selectedLayerKeys.has(textKey)) {
      selectCanvasText(text);
    } else if (record.isNew && !hasContent && selectedLayerKeys.has(textKey)) {
      removeLayerKeyFromSelection(textKey);
      syncElementSelectionStyles();
    }
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
    redoHistory.length = 0;
    renderTree();
    renderComponentProps();
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
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return record;
}

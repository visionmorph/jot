/* Frame, text, vector, and selected-layer duplication. */

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
      selectVariantInstance(variantSelection.instanceId, {
        render: false,
        layerTarget: getLayerKey(type, record.id),
      });
      queueCanvasMutationEffects({ selection: true, tree: true });
      return;
    }
    if (type === "frame") selectCanvasFrame(record.element);
    else if (type === "text") selectCanvasText(record.element);
    else selectCanvasVector(record.element);
  };

  return runCanvasMutation(() => {
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
  });
}

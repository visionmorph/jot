/* Selected-layer color state, inspector synchronization, and paint application. */

const textColorControlRanges = new WeakMap();

function captureTextColorControlRange(control) {
  if (!(control instanceof HTMLElement) || control.dataset.colorControl !== "text") return;
  const record = getSelectedTextRecord();
  const rangeSelection = getActiveTextRangeSelection(record);
  if (record && rangeSelection) {
    textColorControlRanges.set(control, { record, rangeSelection: { ...rangeSelection } });
  } else textColorControlRanges.delete(control);
}

function releaseTextColorControlRange(control) {
  if (!(control instanceof HTMLElement)) return;
  const hadRange = textColorControlRanges.delete(control);
  if (hadRange) scheduleTextRangeInspectorSync();
}

function getLayerTreeOrder() {
  const order = new Map();
  let nextIndex = 0;
  const visit = (parentFrameId) => {
    getLayerChildren(parentFrameId).forEach((layer) => {
      order.set(`${layer.type}:${layer.record.id}`, nextIndex);
      nextIndex += 1;
      if (layer.type === "frame") visit(layer.record.id);
    });
  };
  visit(null);
  return order;
}

function getSelectedFramesInLayerTreeOrder(records = getSelectedFrameRecords()) {
  if (records.some((record) => record.isVariantInstance)) {
    const instanceOrder = new Map(variantModel.getInstances().map((instance, index) => [instance.id, index]));
    return [...records].sort((left, right) => (
      (instanceOrder.get(left.variantInstanceId) ?? Number.MAX_SAFE_INTEGER)
      - (instanceOrder.get(right.variantInstanceId) ?? Number.MAX_SAFE_INTEGER)
    ));
  }
  const order = getLayerTreeOrder();
  return [...records].sort((left, right) => (
    (order.get(`frame:${left.id}`) ?? Number.MAX_SAFE_INTEGER)
    - (order.get(`frame:${right.id}`) ?? Number.MAX_SAFE_INTEGER)
  ));
}

function getSelectedTextsInLayerTreeOrder(records = getSelectedTextRecords()) {
  const order = getLayerTreeOrder();
  return [...records].sort((left, right) => (
    (order.get(`text:${left.id}`) ?? Number.MAX_SAFE_INTEGER)
    - (order.get(`text:${right.id}`) ?? Number.MAX_SAFE_INTEGER)
  ));
}

function getMixedFramePaintState(property) {
  const selectedRecords = typeof getSelectedFrameLayoutRecords === "function"
    ? getSelectedFrameLayoutRecords()
    : getSelectedFrameRecords();
  const records = getSelectedFramesInLayerTreeOrder(selectedRecords);
  if (records.length < 2 || !["frame-background", "frame-outline"].includes(property)) return null;
  const isOutline = property === "frame-outline";
  const values = records.map((record) => {
    const inspectorValues = getFrameInspectorValues(record);
    return {
      color: isOutline ? inspectorValues.outlineColor : inspectorValues.fillColor,
      opacity: Number(isOutline ? inspectorValues.outlineOpacity : inspectorValues.fillOpacity),
    };
  });
  const keys = values.map((value) => value.color
    ? `${value.color}:${normalizeColorOpacity(value.opacity)}`
    : "none");
  return {
    mixed: keys.some((key) => key !== keys[0]),
    firstPaint: values.find((value) => value.color) ?? null,
    allEmpty: values.every((value) => !value.color),
  };
}

function getPartialTextFillState() {
  const records = getSelectedTextsInLayerTreeOrder();
  if (records.length < 2) return null;
  const values = records.map((record) => {
    const member = getTextColorMembers(record.element, `text:${record.id}`)[0];
    return member
      ? { color: member.color, opacity: member.opacity }
      : { color: "", opacity: 100 };
  });
  const paintedCount = values.filter((value) => value.color).length;
  return {
    partial: paintedCount > 0 && paintedCount < values.length,
    firstPaint: values.find((value) => value.color) ?? null,
    allEmpty: paintedCount === 0,
  };
}

function getMixedSelectionPaintState(property) {
  if (property === "text") {
    const state = getPartialTextFillState();
    return state ? { active: state.partial, firstPaint: state.firstPaint, allEmpty: state.allEmpty } : null;
  }
  const state = getMixedFramePaintState(property);
  return state ? { active: state.mixed, firstPaint: state.firstPaint, allEmpty: state.allEmpty } : null;
}

function syncCustomColorControl(picker, color, opacity = 100) {
  if (!(picker instanceof HTMLInputElement)) return;
  const control = picker.closest("[data-color-control]");
  if (!(control instanceof HTMLElement)) return;
  const capturedTextRange = textColorControlRanges.get(control);
  if (capturedTextRange
    && control.contains(document.activeElement)
    && !getActiveTextRangeSelection(capturedTextRange.record)) return;
  const normalizedColor = normalizeHexColor(color);
  const normalizedOpacity = normalizeColorOpacity(opacity);
  const hexInput = control.querySelector("[data-color-hex]");
  const opacityInput = control.querySelector("[data-color-opacity]");
  const swatch = control.querySelector("[data-color-swatch]");
  const section = control.closest("[data-paint-section]");
  const actionButton = section?.querySelector("[data-color-action]");
  const actionWrapper = actionButton?.closest(".tooltip");
  const removeButton = control.querySelector("[data-color-remove-action]");
  const removeWrapper = removeButton?.closest(".tooltip");
  const actionTooltip = actionButton?.closest(".tooltip")?.querySelector("[data-tooltip-content]");
  const mixedColorMessage = section?.querySelector("[data-mixed-color-message]");
  const propertyLabels = {
    canvas: "page fill",
    "frame-background": "frame fill",
    "frame-outline": "frame border",
    text: "text fill",
    vector: "vector fill",
  };
  const isEmpty = !normalizedColor;
  const mixedSelectionPaint = getMixedSelectionPaintState(control.dataset.colorControl);
  const isMixedSelectionPaint = Boolean(mixedSelectionPaint?.active);

  picker.value = normalizedColor || "#000000";
  if (hexInput instanceof HTMLInputElement) hexInput.value = normalizedColor.slice(1);
  if (opacityInput instanceof HTMLInputElement) opacityInput.value = String(normalizedOpacity);
  if (swatch instanceof HTMLElement) {
    swatch.style.backgroundColor = normalizedColor || "transparent";
  }
  control.classList.toggle("is-empty", isEmpty);
  control.hidden = isEmpty || isMixedSelectionPaint;
  if (control.dataset.colorControl === "frame-outline" && frameOutlineControls instanceof HTMLElement) {
    const hasPartialOrMixedBorder = isMixedSelectionPaint && !mixedSelectionPaint?.allEmpty;
    frameOutlineControls.hidden = isEmpty && !hasPartialOrMixedBorder;
  }
  if (actionButton instanceof HTMLButtonElement) {
    const propertyLabel = propertyLabels[control.dataset.colorControl] || "color";
    actionButton.setAttribute("aria-label", `Add ${propertyLabel}`);
  }
  if (actionTooltip instanceof HTMLElement) {
    actionTooltip.textContent = control.dataset.colorControl === "frame-background"
      ? "Add fill"
      : control.dataset.colorControl === "frame-outline"
        ? "Add border"
        : control.dataset.colorControl === "text" ? "Add fill" : "Add";
  }
  if (actionWrapper instanceof HTMLElement) actionWrapper.hidden = !isEmpty && !isMixedSelectionPaint;
  if (removeWrapper instanceof HTMLElement) removeWrapper.hidden = isEmpty;
  if (mixedColorMessage instanceof HTMLElement) mixedColorMessage.hidden = !isMixedSelectionPaint;
  syncOpenColorPicker(control, normalizedColor, normalizedOpacity);
}

function getCustomColorState(control) {
  const property = control.dataset.colorControl;
  if (property === "selection") return getSelectionColorState(control);
  if (property === "canvas") {
    return { property, color: canvasColorValue, opacity: canvasColorOpacity, picker: colorPicker };
  }
  if (property === "text") {
    const capturedRange = textColorControlRanges.get(control);
    const record = capturedRange?.record ?? getSelectedTextRecord();
    if (!record) return null;
    const records = getSelectedTextRecords();
    const rangeSelection = capturedRange?.rangeSelection
      ?? (records.length === 1 ? getActiveTextRangeSelection(record) : null);
    const rangeValues = rangeSelection
      ? getTextRangeSegments(record, rangeSelection).map(({ color, opacity, key }) => ({ color, opacity, key }))
      : [];
    const rangeValue = rangeValues[0];
    const uniformRunColor = getUniformTextRunColor(record);
    const renderedColor = record.isVariantInstance ? getComputedStyle(record.element).color : "";
    const rgbaAlpha = renderedColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const isTransparent = renderedColor === "transparent" || (rgbaAlpha && Number(rgbaAlpha[1]) === 0);
    const layerColor = record.isVariantInstance
      ? isTransparent ? "" : cssColorToHex(renderedColor) || "#000000"
      : Object.prototype.hasOwnProperty.call(record.element.dataset, "textColor") ? record.element.dataset.textColor : "#000000";
    return {
      property,
      record,
      records,
      rangeSelection,
      color: rangeValue?.color ?? uniformRunColor?.color ?? layerColor,
      opacity: rangeValue?.opacity ?? uniformRunColor?.opacity ?? normalizeColorOpacity(record.isVariantInstance && rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : record.element.dataset.textColorOpacity || "100"),
      picker: textColorPicker,
    };
  }
  if (property === "vector") {
    const record = getSelectedVectorRecord();
    if (!record) return null;
    const records = getSelectedVectorRecords();
    const variantPaintProperties = record.isVariantInstance ? getVectorPaintProperties(record) : [];
    const color = record.isVariantInstance
      ? variantPaintProperties.length > 0 ? getVectorRenderedColor(record) : ""
      : Object.prototype.hasOwnProperty.call(record.element.dataset, "vectorColor")
        ? record.element.dataset.vectorColor
        : getVectorRenderedColor(record);
    return {
      property,
      record,
      records,
      color,
      opacity: record.isVariantInstance
        ? getVectorRenderedOpacity(record)
        : normalizeColorOpacity(record.element.dataset.vectorColorOpacity || "100"),
      picker: vectorColorPicker,
    };
  }
  const record = getSelectedFrameRecord();
  const records = typeof getSelectedFrameLayoutRecords === "function"
    ? getSelectedFrameLayoutRecords()
    : getSelectedFrameRecords();
  if (!record) return null;
  const inspectorValues = getFrameInspectorValues(record);
  if (property === "frame-background") {
    return {
      property,
      record,
      records,
      color: inspectorValues.fillColor,
      opacity: normalizeColorOpacity(inspectorValues.fillOpacity),
      picker: frameColorPicker,
    };
  }
  if (property === "frame-outline") {
    return {
      property,
      record,
      records,
      color: inspectorValues.outlineColor,
      opacity: normalizeColorOpacity(inspectorValues.outlineOpacity),
      picker: frameOutlineColorPicker,
    };
  }
  return null;
}

function selectedTextRecordsMatchColor(records, color, opacity) {
  return records.every((record) => {
    if (record.isVariantInstance) {
      const renderedColor = getComputedStyle(record.element).color;
      const alpha = renderedColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
      const currentColor = renderedColor === "transparent" ? "" : normalizeHexColor(cssColorToHex(renderedColor));
      const currentOpacity = renderedColor === "transparent"
        ? 0
        : normalizeColorOpacity(alpha ? Number(alpha[1]) * 100 : 100);
      return currentColor === color && currentOpacity === opacity;
    }
    return normalizeHexColor(record.element.dataset.textColor) === color
      && normalizeColorOpacity(record.element.dataset.textColorOpacity || 100) === opacity;
  });
}

function selectedFrameRecordsMatchColor(records, property, color, opacity) {
  return records.every((record) => {
    const isOutline = property === "frame-outline";
    const values = getFrameInspectorValues(record);
    const currentColor = normalizeHexColor(isOutline ? values.outlineColor : values.fillColor);
    const currentOpacity = normalizeColorOpacity(isOutline ? values.outlineOpacity : values.fillOpacity);
    return currentColor === color && currentOpacity === opacity;
  });
}

function selectedVectorRecordsMatchColor(records, color, opacity) {
  return records.every((record) => (
    normalizeHexColor(getVectorRenderedColor(record)) === color
    && getVectorRenderedOpacity(record) === opacity
  ));
}

function applyCustomColorValue(control, color, opacity) {
  const state = getCustomColorState(control);
  if (!state || !(state.picker instanceof HTMLInputElement)) return false;
  const normalizedColor = normalizeHexColor(color);
  const normalizedOpacity = normalizeColorOpacity(opacity);
  if (state.property === "selection") {
    return applySelectionColorValue(control, state, normalizedColor, normalizedOpacity);
  }
  if (state.property === "text" && state.rangeSelection) {
    const values = getTextRangeSegments(state.record, state.rangeSelection);
    if (values.length > 0 && values.every((value) => (
      value.color === normalizedColor && value.opacity === normalizedOpacity
    ))) {
      syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
      return true;
    }
    recordHistoryForGesture(control);
    applyTextRangeColor(state.record, state.rangeSelection, normalizedColor, normalizedOpacity);
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    syncSelectionColorControls(false, true);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "frame-background") {
    const records = state.records.length > 0 ? state.records : [state.record];
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (!selectedFrameRecordsMatchColor(records, state.property, normalizedColor, normalizedOpacity)) {
      recordHistoryForGesture(control);
    }
    const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
    records.forEach((record) => {
      record.element.dataset.frameColor = normalizedColor;
      record.element.dataset.frameColorOpacity = String(normalizedOpacity);
      record.element.style.backgroundColor = renderedColor;
    });
    setVariantFrameRecordsProperty(records, "backgroundColor", renderedColor);
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    syncSelectionColorControls(true, false);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "frame-outline") {
    const records = state.records.length > 0 ? state.records : [state.record];
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (!selectedFrameRecordsMatchColor(records, state.property, normalizedColor, normalizedOpacity)) {
      recordHistoryForGesture(control);
    }
    const recordsNeedingWeight = normalizedColor
      ? records.filter((record) => Number(record.element.dataset.outlineWeight || "0") <= 0)
      : [];
    records.forEach((record) => {
      record.element.dataset.outlineColor = normalizedColor;
      record.element.dataset.outlineColorOpacity = String(normalizedOpacity);
    });
    setVariantFrameRecordsProperty(records, "outlineColor", normalizedColor);
    setVariantFrameRecordsProperty(records, "outlineColorOpacity", String(normalizedOpacity));
    if (recordsNeedingWeight.length > 0) {
      setVariantFrameRecordsProperty(recordsNeedingWeight, "outlineWeight", "1");
    }
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    syncInspectorToSelectedFrame();
    syncSelectionColorControls(true, false);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "text" && state.record.isVariantInstance) {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    const isTransparent = !normalizedColor;
    const renderedColor = isTransparent ? "transparent" : getColorWithOpacity(normalizedColor, normalizedOpacity);
    const nextOpacity = isTransparent ? 0 : normalizedOpacity;
    const records = state.records.length > 0 ? state.records : [state.record];
    if (!selectedTextRecordsMatchColor(records, normalizedColor, nextOpacity)) recordHistoryForGesture(control);
    records.forEach((record) => {
      const target = `text:${record.id}`;
      const runData = getCurrentTextRunData(record);
      if (normalizedColor && runData.hasRuns) {
        applyTextColorToOffsets(record.element, 0, runData.textContent.length, normalizedColor, nextOpacity);
        persistTextRangeColor(record);
      }
      record.element.dataset.textColor = normalizedColor;
      record.element.dataset.textColorOpacity = String(nextOpacity);
      record.element.style.color = renderedColor;
      const instance = getVariantInstance();
      if (instance) upsertLocalVariantOverride(instance, target, "color", renderedColor);
      syncVariantLayerStylePreviews(target, "color", record.element);
    });
    syncCustomColorControl(state.picker, normalizedColor, nextOpacity);
    syncSelectionColorControls(false, true);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "vector" && state.record.isVariantInstance) {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    const records = state.records.length > 0 ? state.records : [state.record];
    if (selectedVectorRecordsMatchColor(records, normalizedColor, normalizedOpacity)) {
      syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
      return true;
    }
    recordHistoryForGesture(control);
    const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
    records.forEach((record) => {
      const paintProperties = getVectorPaintProperties(record);
      record.element.dataset.vectorColor = normalizedColor;
      record.element.dataset.vectorColorOpacity = String(normalizedOpacity);
      if (normalizedColor) applyVectorColor(record, renderedColor);
      else removeVectorColor(record);
      const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
      const target = `vector:${record.id}`;
      const overrideProperties = paintProperties.length > 0 ? paintProperties : ["fill"];
      overrideProperties.forEach((property) => {
        if (instance) upsertLocalVariantOverride(
          instance, target, property, normalizedColor ? renderedColor : "none",
        );
        syncVariantLayerStylePreviews(target, property, record.element);
      });
    });
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    syncSelectionColorControls(false, false, true);
    return true;
  }
  if (normalizedColor) control.dataset.lastColor = normalizedColor;
  const selectedValuesMatch = state.property === "text"
    ? selectedTextRecordsMatchColor(
        state.records.length > 0 ? state.records : [state.record],
        normalizedColor,
        normalizedColor ? normalizedOpacity : 0,
      )
    : state.property === "frame-background" || state.property === "frame-outline"
      ? selectedFrameRecordsMatchColor(
          state.records.length > 0 ? state.records : [state.record],
          state.property,
          normalizedColor,
          normalizedOpacity,
        )
      : state.property === "vector"
        ? selectedVectorRecordsMatchColor(
            state.records.length > 0 ? state.records : [state.record],
            normalizedColor,
            normalizedOpacity,
          )
      : state.color === normalizedColor && state.opacity === normalizedOpacity;
  if (selectedValuesMatch) {
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }

  recordHistoryForGesture(control);
  const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
  if (state.property === "canvas") {
    canvasColorValue = normalizedColor;
    canvasColorOpacity = normalizedOpacity;
    if (canvas instanceof HTMLElement) canvas.style.backgroundColor = renderedColor || "transparent";
  } else if (state.property === "text") {
    const isTransparent = !normalizedColor;
    (state.records.length > 0 ? state.records : [state.record]).forEach((record) => {
      const runData = getCurrentTextRunData(record);
      if (normalizedColor && runData.hasRuns) {
        applyTextColorToOffsets(record.element, 0, runData.textContent.length, normalizedColor, normalizedOpacity);
        persistTextRangeColor(record);
      }
      record.element.dataset.textColor = normalizedColor;
      record.element.dataset.textColorOpacity = String(isTransparent ? 0 : normalizedOpacity);
      record.element.style.color = isTransparent ? "transparent" : renderedColor;
    });
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  } else if (state.property === "frame-background") {
    const records = state.records.length > 0 ? state.records : [state.record];
    records.forEach((record) => {
      record.element.dataset.frameColor = normalizedColor;
      record.element.dataset.frameColorOpacity = String(normalizedOpacity);
      record.element.style.backgroundColor = renderedColor;
    });
    scheduleSelectedFramePreviewRender(records);
  } else if (state.property === "frame-outline") {
    const records = state.records.length > 0 ? state.records : [state.record];
    records.forEach((record) => {
      const shouldEnableOutline = Boolean(normalizedColor)
        && !normalizeHexColor(record.element.dataset.outlineColor)
        && Number(record.element.dataset.outlineWeight || "0") <= 0;
      record.element.dataset.outlineColor = normalizedColor;
      record.element.dataset.outlineColorOpacity = String(normalizedOpacity);
      if (shouldEnableOutline) record.element.dataset.outlineWeight = "1";
      applyFrameOutline(record.element);
    });
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
  } else if (state.property === "vector") {
    (state.records.length > 0 ? state.records : [state.record]).forEach((record) => {
      record.element.dataset.vectorColorOpacity = String(normalizedOpacity);
      if (normalizedColor) {
        const source = record.originalSvgSource || record.svgSource;
        record.svgSource = source;
        record.element.replaceChildren(createCanvasSvg(source));
        applyVectorColor(record, renderedColor);
        record.element.dataset.vectorColor = normalizedColor;
      } else removeVectorColor(record);
    });
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  }

  syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
  if (state.property === "text") syncSelectionColorControls(false, true);
  if (state.property === "frame-background" || state.property === "frame-outline") {
    syncSelectionColorControls(true, false);
  }
  if (state.property === "vector") syncSelectionColorControls(false, false, true);
  return true;
}

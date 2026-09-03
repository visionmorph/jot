/* Selected-layer color state, inspector synchronization, and paint application. */

function syncCustomColorControl(picker, color, opacity = 100) {
  if (!(picker instanceof HTMLInputElement)) return;
  const control = picker.closest("[data-color-control]");
  if (!(control instanceof HTMLElement)) return;
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
  const propertyLabels = {
    canvas: "page fill",
    "frame-background": "frame fill",
    "frame-outline": "frame border",
    text: "text fill",
    vector: "vector fill",
  };
  const isEmpty = !normalizedColor;

  picker.value = normalizedColor || "#000000";
  if (hexInput instanceof HTMLInputElement) hexInput.value = normalizedColor.slice(1);
  if (opacityInput instanceof HTMLInputElement) opacityInput.value = String(normalizedOpacity);
  if (swatch instanceof HTMLElement) {
    swatch.style.backgroundColor = normalizedColor || "transparent";
  }
  control.classList.toggle("is-empty", isEmpty);
  control.hidden = isEmpty;
  if (control.dataset.colorControl === "frame-outline" && frameOutlineControls instanceof HTMLElement) {
    frameOutlineControls.hidden = isEmpty;
  }
  if (actionButton instanceof HTMLButtonElement) {
    const propertyLabel = propertyLabels[control.dataset.colorControl] || "color";
    actionButton.setAttribute("aria-label", `Add ${propertyLabel}`);
  }
  if (actionTooltip instanceof HTMLElement) {
    actionTooltip.textContent = "Add";
  }
  if (actionWrapper instanceof HTMLElement) actionWrapper.hidden = !isEmpty;
  if (removeWrapper instanceof HTMLElement) removeWrapper.hidden = isEmpty;
  syncOpenColorPicker(control, normalizedColor, normalizedOpacity);
}

function getCustomColorState(control) {
  const property = control.dataset.colorControl;
  if (property === "canvas") {
    return { property, color: canvasColorValue, opacity: canvasColorOpacity, picker: colorPicker };
  }
  if (property === "text") {
    const record = getSelectedTextRecord();
    if (!record) return null;
    const renderedColor = record.isVariantInstance ? getComputedStyle(record.element).color : "";
    const rgbaAlpha = renderedColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const isTransparent = renderedColor === "transparent" || (rgbaAlpha && Number(rgbaAlpha[1]) === 0);
    const color = record.isVariantInstance
      ? isTransparent ? "" : cssColorToHex(renderedColor) || "#000000"
      : Object.prototype.hasOwnProperty.call(record.element.dataset, "textColor") ? record.element.dataset.textColor : "#000000";
    return {
      property,
      record,
      color,
      opacity: normalizeColorOpacity(record.isVariantInstance && rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : record.element.dataset.textColorOpacity || "100"),
      picker: textColorPicker,
    };
  }
  if (property === "vector") {
    const record = getSelectedVectorRecord();
    if (!record) return null;
    const variantPaintProperties = record.isVariantInstance ? getVectorPaintProperties(record) : [];
    const color = record.isVariantInstance
      ? variantPaintProperties.length > 0 ? getVectorRenderedColor(record) : ""
      : Object.prototype.hasOwnProperty.call(record.element.dataset, "vectorColor")
        ? record.element.dataset.vectorColor
        : getVectorRenderedColor(record);
    return {
      property,
      record,
      color,
      opacity: record.isVariantInstance
        ? getVectorRenderedOpacity(record)
        : normalizeColorOpacity(record.element.dataset.vectorColorOpacity || "100"),
      picker: vectorColorPicker,
    };
  }
  const record = getSelectedFrameRecord();
  if (!record) return null;
  if (property === "frame-background") {
    return {
      property,
      record,
      color: record.element.dataset.frameColor || "",
      opacity: normalizeColorOpacity(record.element.dataset.frameColorOpacity || "100"),
      picker: frameColorPicker,
    };
  }
  if (property === "frame-outline") {
    return {
      property,
      record,
      color: record.element.dataset.outlineColor || "",
      opacity: normalizeColorOpacity(record.element.dataset.outlineColorOpacity || "100"),
      picker: frameOutlineColorPicker,
    };
  }
  return null;
}

function applyCustomColorValue(control, color, opacity) {
  const state = getCustomColorState(control);
  if (!state || !(state.picker instanceof HTMLInputElement)) return false;
  const normalizedColor = normalizeHexColor(color);
  const normalizedOpacity = normalizeColorOpacity(opacity);
  if (selectedVariantInstanceId !== null && state.property === "frame-background") {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (state.color !== normalizedColor || state.opacity !== normalizedOpacity) recordHistoryForGesture(control);
    setSelectedVariantFrameStyleOverride("backgroundColor", getColorWithOpacity(normalizedColor, normalizedOpacity), { record: false });
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "frame-outline") {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (state.color !== normalizedColor || state.opacity !== normalizedOpacity) recordHistoryForGesture(control);
    const shouldEnableOutline = Boolean(normalizedColor)
      && !normalizeHexColor(state.color)
      && Number(state.record.element.dataset.outlineWeight || "0") <= 0;
    setSelectedVariantFrameStyleOverride("outlineColor", normalizedColor, { record: false, render: false });
    setSelectedVariantFrameStyleOverride("outlineColorOpacity", String(normalizedOpacity), { record: false, render: false });
    if (shouldEnableOutline) {
      setSelectedVariantFrameStyleOverride("outlineWeight", "1", { record: false, render: false });
      if (frameOutlineWeightInput instanceof HTMLInputElement) frameOutlineWeightInput.value = "1";
    }
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "text" && state.record.isVariantInstance) {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    const isTransparent = !normalizedColor;
    const renderedColor = isTransparent ? "transparent" : getColorWithOpacity(normalizedColor, normalizedOpacity);
    const nextOpacity = isTransparent ? 0 : normalizedOpacity;
    if (state.color !== normalizedColor || state.opacity !== nextOpacity) recordHistoryForGesture(control);
    state.record.element.dataset.textColor = normalizedColor;
    state.record.element.dataset.textColorOpacity = String(nextOpacity);
    state.record.element.style.color = renderedColor;
    setSelectedVariantLayerOverride("color", renderedColor);
    syncVariantLayerStylePreviews(selectedVariantLayerTarget, "color", state.record.element);
    syncCustomColorControl(state.picker, normalizedColor, nextOpacity);
    return true;
  }
  if (selectedVariantInstanceId !== null && state.property === "vector" && state.record.isVariantInstance) {
    if (normalizedColor) control.dataset.lastColor = normalizedColor;
    if (normalizeHexColor(state.color) === normalizedColor && state.opacity === normalizedOpacity) {
      syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
      return true;
    }
    recordHistoryForGesture(control);
    const paintProperties = getVectorPaintProperties(state.record);
    const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
    state.record.element.dataset.vectorColor = normalizedColor;
    state.record.element.dataset.vectorColorOpacity = String(normalizedOpacity);
    if (normalizedColor) applyVectorColor(state.record, renderedColor);
    else removeVectorColor(state.record);
    const overrideProperties = paintProperties.length > 0 ? paintProperties : ["fill"];
    overrideProperties.forEach((property) => {
      setSelectedVariantLayerOverride(property, normalizedColor ? renderedColor : "none");
    });
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }
  if (normalizedColor) control.dataset.lastColor = normalizedColor;
  if (state.color === normalizedColor && state.opacity === normalizedOpacity) {
    syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
    return true;
  }

  recordHistoryForGesture(control);
  const renderedColor = getColorWithOpacity(normalizedColor, normalizedOpacity);
  const shouldEnableFrameOutline = state.property === "frame-outline"
    && Boolean(normalizedColor)
    && !normalizeHexColor(state.color)
    && Number(state.record?.element.dataset.outlineWeight || "0") <= 0;
  if (state.property === "canvas") {
    canvasColorValue = normalizedColor;
    canvasColorOpacity = normalizedOpacity;
    if (canvas instanceof HTMLElement) canvas.style.backgroundColor = renderedColor || "transparent";
  } else if (state.property === "text") {
    const isTransparent = !normalizedColor;
    state.record.element.dataset.textColor = normalizedColor;
    state.record.element.dataset.textColorOpacity = String(isTransparent ? 0 : normalizedOpacity);
    state.record.element.style.color = isTransparent ? "transparent" : renderedColor;
    if (variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  } else if (state.property === "frame-background") {
    state.record.element.dataset.frameColor = normalizedColor;
    state.record.element.dataset.frameColorOpacity = String(normalizedOpacity);
    state.record.element.style.backgroundColor = renderedColor;
  } else if (state.property === "frame-outline") {
    state.record.element.dataset.outlineColor = normalizedColor;
    state.record.element.dataset.outlineColorOpacity = String(normalizedOpacity);
    if (shouldEnableFrameOutline) {
      state.record.element.dataset.outlineWeight = "1";
      if (frameOutlineWeightInput instanceof HTMLInputElement) frameOutlineWeightInput.value = "1";
    }
    applyFrameOutline(state.record.element);
  } else if (state.property === "vector") {
    state.record.element.dataset.vectorColorOpacity = String(normalizedOpacity);
    if (normalizedColor) {
      const source = state.record.originalSvgSource || state.record.svgSource;
      state.record.svgSource = source;
      state.record.element.replaceChildren(createCanvasSvg(source));
      applyVectorColor(state.record, renderedColor);
      state.record.element.dataset.vectorColor = normalizedColor;
    } else {
      removeVectorColor(state.record);
    }
  }

  syncCustomColorControl(state.picker, normalizedColor, normalizedOpacity);
  return true;
}

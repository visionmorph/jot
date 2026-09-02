/* Shared inspector color utilities, picker UI, opacity controls, and paint interactions. */

function normalizeHexColor(value) {
  const match = String(value || "").trim().replace(/^#/, "").match(/^([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return "";
  const hex = match[1].length === 3
    ? [...match[1]].map((character) => character.repeat(2)).join("")
    : match[1];
  return `#${hex.toUpperCase()}`;
}

function normalizeColorOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(100, opacity)) : 100;
}

function getColorWithOpacity(color, opacity = 100) {
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) return "";
  const normalizedOpacity = normalizeColorOpacity(opacity);
  if (normalizedOpacity === 100) return normalizedColor;
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16);
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16);
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16);
  const alpha = Number((normalizedOpacity / 100).toFixed(3));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

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

function colorPickerKnobMarkup() {
  return '<span class="color-picker-knob" aria-hidden="true"><span class="color-picker-knob-middle"><span class="color-picker-knob-color"></span></span></span>';
}

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] = sector < 1 ? [chroma, secondary, 0]
    : sector < 2 ? [secondary, chroma, 0]
      : sector < 3 ? [0, chroma, secondary]
        : sector < 4 ? [0, secondary, chroma]
          : sector < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const channel = (number) => Math.round((number + match) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

function hexToHsv(color) {
  const normalizedColor = normalizeHexColor(color) || "#000000";
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta && maximum === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (delta && maximum === green) hue = 60 * (((blue - red) / delta) + 2);
  else if (delta) hue = 60 * (((red - green) / delta) + 4);
  return {
    hue: (hue + 360) % 360,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  };
}

function bindNumberSuffixScrubber(suffix, input, root, getGestureTarget) {
  if (!(suffix instanceof HTMLElement) || !(input instanceof HTMLInputElement) || !(root instanceof HTMLElement)) return;
  suffix.tabIndex = 0;
  let drag = null;

  const finishDrag = (event, shouldFocus) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const didDrag = drag.didDrag;
    const gestureTarget = drag.gestureTarget;
    drag = null;
    suffix.classList.remove("is-dragging");
    root.classList.remove("is-scrubbing");
    if (suffix.hasPointerCapture(event.pointerId)) suffix.releasePointerCapture(event.pointerId);
    if (gestureTarget) endHistoryGesture(gestureTarget);
    if (!didDrag && shouldFocus) input.focus();
    event.preventDefault();
  };

  suffix.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const startValue = Number(input.value);
    if (!Number.isFinite(startValue)) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const gestureTarget = getGestureTarget?.() ?? null;
    if (gestureTarget) beginHistoryGesture(gestureTarget);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue,
      didDrag: false,
      gestureTarget,
    };
    root.classList.add("is-scrubbing");
    suffix.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  suffix.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dragUnits = Math.trunc(event.clientX - drag.startX);
    if (!drag.didDrag && Math.abs(dragUnits) < 2) return;
    drag.didDrag = true;
    suffix.classList.add("is-dragging");
    const multiplier = event.shiftKey ? 10 : 1;
    const minimum = Number(suffix.dataset.suffixMin ?? 0);
    const maximum = Number(suffix.dataset.suffixMax ?? 100);
    const nextValue = Math.min(maximum, Math.max(minimum, drag.startValue + dragUnits * multiplier));
    if (input.value === String(nextValue)) return;
    input.value = String(nextValue);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    event.preventDefault();
  });

  suffix.addEventListener("pointerup", (event) => finishDrag(event, true));
  suffix.addEventListener("pointercancel", (event) => finishDrag(event, false));
  suffix.addEventListener("lostpointercapture", (event) => finishDrag(event, false));
  suffix.addEventListener("click", (event) => event.preventDefault());
  suffix.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    input.focus();
  });
}

function createColorPicker() {
  const colorPicker = document.createElement("div");
  colorPicker.className = "color-picker";
  colorPicker.hidden = true;
  colorPicker.setAttribute("role", "dialog");
  colorPicker.setAttribute("aria-label", "Color picker");
  colorPicker.dataset.colorPicker = "";
  colorPicker.innerHTML = `
    <div class="color-picker-sv" data-picker-sv role="slider" aria-label="Saturation and value">${colorPickerKnobMarkup()}</div>
    <div class="color-picker-sliders">
      <div class="color-picker-slider color-picker-hue" data-picker-hue role="slider" aria-label="Hue">${colorPickerKnobMarkup()}</div>
      <div class="color-picker-slider color-picker-opacity" data-picker-opacity role="slider" aria-label="Opacity">${colorPickerKnobMarkup()}</div>
    </div>
    <div class="color-picker-fields">
      <div class="custom-color-value"><input class="custom-color-hex" type="text" inputmode="text" maxlength="6" aria-label="Hex color value" autocomplete="off" autocapitalize="characters" spellcheck="false" data-picker-hex></div>
      <div class="custom-color-divider" aria-hidden="true"></div>
      <div class="custom-color-opacity"><input type="text" inputmode="decimal" maxlength="3" aria-label="Color opacity" data-picker-opacity-input><span class="text-input__suffix" role="button" aria-label="Adjust color opacity" data-number-suffix data-suffix-min="0" data-suffix-max="100"><span class="text-input__suffix-value" aria-hidden="true">%</span></span></div>
    </div>`;
  return colorPicker;
}

const colorPickerPopup = createColorPicker();
document.body.append(colorPickerPopup);

const colorPickerSv = colorPickerPopup.querySelector("[data-picker-sv]");
const colorPickerHue = colorPickerPopup.querySelector("[data-picker-hue]");
const colorPickerOpacity = colorPickerPopup.querySelector("[data-picker-opacity]");
const colorPickerHex = colorPickerPopup.querySelector("[data-picker-hex]");
const colorPickerOpacityInput = colorPickerPopup.querySelector("[data-picker-opacity-input]");
const colorPickerOpacitySuffix = colorPickerPopup.querySelector("[data-number-suffix]");
let activeColorControl = null;
let pickerHue = 0;
let pickerSaturation = 0;
let pickerValue = 1;
let pickerOpacity = 100;
let isApplyingPickerColor = false;
let colorPickerDrag = null;
let hasCustomColorPickerPosition = false;

function renderColorPicker() {
  const currentColor = hsvToHex(pickerHue, pickerSaturation, pickerValue);
  const hueColor = hsvToHex(pickerHue, 1, 1);
  colorPickerPopup.style.setProperty("--picker-color", currentColor);
  colorPickerPopup.style.setProperty("--picker-hue", hueColor);
  colorPickerPopup.style.setProperty("--picker-opacity", `${pickerOpacity}%`);
  const svKnob = colorPickerSv?.querySelector(".color-picker-knob");
  const hueKnob = colorPickerHue?.querySelector(".color-picker-knob");
  const opacityKnob = colorPickerOpacity?.querySelector(".color-picker-knob");
  if (svKnob instanceof HTMLElement) {
    svKnob.style.left = `${pickerSaturation * 100}%`;
    svKnob.style.top = `${(1 - pickerValue) * 100}%`;
  }
  if (hueKnob instanceof HTMLElement) hueKnob.style.left = `${8 + (pickerHue / 360) * 192}px`;
  if (opacityKnob instanceof HTMLElement) opacityKnob.style.left = `${8 + ((100 - pickerOpacity) / 100) * 192}px`;
  if (colorPickerHex instanceof HTMLInputElement) colorPickerHex.value = currentColor.slice(1);
  if (colorPickerOpacityInput instanceof HTMLInputElement) colorPickerOpacityInput.value = String(pickerOpacity);
  colorPickerSv?.setAttribute("aria-valuetext", `${Math.round(pickerSaturation * 100)}% saturation, ${Math.round(pickerValue * 100)}% value`);
  colorPickerHue?.setAttribute("aria-valuenow", String(Math.round(pickerHue)));
  colorPickerOpacity?.setAttribute("aria-valuenow", String(pickerOpacity));
}

function syncOpenColorPicker(control, color, opacity) {
  if (activeColorControl !== control || colorPickerPopup.hidden) return;
  pickerOpacity = normalizeColorOpacity(opacity);
  if (!isApplyingPickerColor) {
    const hsv = hexToHsv(color);
    pickerHue = hsv.hue;
    pickerSaturation = hsv.saturation;
    pickerValue = hsv.value;
  }
  renderColorPicker();
}

function positionColorPicker() {
  if (!(activeColorControl instanceof HTMLElement) || colorPickerPopup.hidden || hasCustomColorPickerPosition) return;
  const rect = activeColorControl.getBoundingClientRect();
  colorPickerPopup.style.left = `${rect.left - colorPickerPopup.offsetWidth - 4}px`;
  colorPickerPopup.style.top = `${rect.top}px`;
}

function openColorPicker(control) {
  const state = getCustomColorState(control);
  if (!state || !normalizeHexColor(state.color)) return;
  activeColorControl = control;
  const hsv = hexToHsv(state.color);
  pickerHue = hsv.hue;
  pickerSaturation = hsv.saturation;
  pickerValue = hsv.value;
  pickerOpacity = state.opacity;
  hasCustomColorPickerPosition = false;
  colorPickerPopup.hidden = false;
  syncOpenColorPicker(control, state.color, state.opacity);
  positionColorPicker();
}

function closeColorPicker() {
  if (activeColorControl) endHistoryGesture(activeColorControl);
  colorPickerPopup.hidden = true;
  colorPickerPopup.style.removeProperty("left");
  colorPickerPopup.style.removeProperty("top");
  hasCustomColorPickerPosition = false;
  colorPickerDrag = null;
  activeColorControl = null;
}

function isColorPickerContent(target) {
  return target instanceof Element && Boolean(target.closest(".color-picker-sv, .color-picker-sliders, .color-picker-fields"));
}

colorPickerPopup.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || colorPickerPopup.hidden || isColorPickerContent(event.target)) return;
  const bounds = colorPickerPopup.getBoundingClientRect();
  colorPickerDrag = {
    pointerId: event.pointerId,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
  };
  colorPickerPopup.setPointerCapture(event.pointerId);
  event.preventDefault();
});

colorPickerPopup.addEventListener("pointermove", (event) => {
  if (!colorPickerDrag || event.pointerId !== colorPickerDrag.pointerId) return;
  const maxLeft = Math.max(4, window.innerWidth - colorPickerPopup.offsetWidth - 4);
  const maxTop = Math.max(4, window.innerHeight - colorPickerPopup.offsetHeight - 4);
  const left = Math.max(4, Math.min(event.clientX - colorPickerDrag.offsetX, maxLeft));
  const top = Math.max(4, Math.min(event.clientY - colorPickerDrag.offsetY, maxTop));
  colorPickerPopup.style.left = `${left}px`;
  colorPickerPopup.style.top = `${top}px`;
  hasCustomColorPickerPosition = true;
});

function finishColorPickerDrag(event) {
  if (!colorPickerDrag || event.pointerId !== colorPickerDrag.pointerId) return;
  if (colorPickerPopup.hasPointerCapture(event.pointerId)) {
    colorPickerPopup.releasePointerCapture(event.pointerId);
  }
  colorPickerDrag = null;
}

colorPickerPopup.addEventListener("pointerup", finishColorPickerDrag);
colorPickerPopup.addEventListener("pointercancel", finishColorPickerDrag);

function applyPickerColor() {
  if (!(activeColorControl instanceof HTMLElement)) return;
  isApplyingPickerColor = true;
  applyCustomColorValue(activeColorControl, hsvToHex(pickerHue, pickerSaturation, pickerValue), pickerOpacity);
  isApplyingPickerColor = false;
  renderColorPicker();
}

function bindColorPickerPointer(surface, update) {
  if (!(surface instanceof HTMLElement)) return;
  const move = (event) => {
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    update(x / rect.width, y / rect.height);
    applyPickerColor();
  };
  surface.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (activeColorControl) beginHistoryGesture(activeColorControl);
    surface.setPointerCapture(event.pointerId);
    move(event);
  });
  surface.addEventListener("pointermove", (event) => {
    if (surface.hasPointerCapture(event.pointerId)) move(event);
  });
  const endPointerGesture = () => {
    if (activeColorControl) endHistoryGesture(activeColorControl);
  };
  surface.addEventListener("pointerup", endPointerGesture);
  surface.addEventListener("pointercancel", endPointerGesture);
  surface.addEventListener("lostpointercapture", endPointerGesture);
}

bindColorPickerPointer(colorPickerSv, (x, y) => {
  pickerSaturation = x;
  pickerValue = 1 - y;
});
bindColorPickerPointer(colorPickerHue, (x) => {
  pickerHue = x * 360;
});
bindColorPickerPointer(colorPickerOpacity, (x) => {
  pickerOpacity = Math.round((1 - x) * 100);
});

colorPickerHex?.addEventListener("input", () => {
  if (!(colorPickerHex instanceof HTMLInputElement) || !/^[\da-f]{6}$/i.test(colorPickerHex.value.trim())) return;
  const hsv = hexToHsv(colorPickerHex.value);
  pickerHue = hsv.hue;
  pickerSaturation = hsv.saturation;
  pickerValue = hsv.value;
  applyPickerColor();
});
colorPickerHex?.addEventListener("focus", () => {
  if (activeColorControl) beginHistoryGesture(activeColorControl);
});
colorPickerHex?.addEventListener("blur", () => {
  if (activeColorControl) endHistoryGesture(activeColorControl);
});

colorPickerOpacityInput?.addEventListener("input", () => {
  if (!(colorPickerOpacityInput instanceof HTMLInputElement) || colorPickerOpacityInput.value.trim() === "" || !Number.isFinite(Number(colorPickerOpacityInput.value))) return;
  pickerOpacity = normalizeColorOpacity(colorPickerOpacityInput.value);
  applyPickerColor();
});
colorPickerOpacityInput?.addEventListener("focus", () => {
  if (activeColorControl) beginHistoryGesture(activeColorControl);
});
colorPickerOpacityInput?.addEventListener("blur", () => {
  if (activeColorControl) endHistoryGesture(activeColorControl);
});
bindNumberSuffixScrubber(
  colorPickerOpacitySuffix,
  colorPickerOpacityInput,
  colorPickerOpacityInput?.closest(".custom-color-opacity"),
  () => activeColorControl,
);

document.addEventListener("pointerdown", (event) => {
  if (colorPickerPopup.hidden || colorPickerPopup.contains(event.target)) return;
  if (activeColorControl?.contains(event.target)) return;
  closeColorPicker();
}, true);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || colorPickerPopup.hidden) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  closeColorPicker();
}, true);

window.addEventListener("resize", positionColorPicker);
document.addEventListener("scroll", positionColorPicker, true);

colorControls.forEach((control) => {
  if (!(control instanceof HTMLElement)) return;
  const picker = control.querySelector("input[type='color']");
  const hexInput = control.querySelector("[data-color-hex]");
  const opacityInput = control.querySelector("[data-color-opacity]");
  const opacitySuffix = control.querySelector("[data-number-suffix]");
  const section = control.closest("[data-paint-section]");
  const actionButton = section?.querySelector("[data-color-action]");
  const removeButton = control.querySelector("[data-color-remove-action]");
  const swatch = control.querySelector(".custom-color-swatch");

  if (swatch instanceof HTMLElement) {
    swatch.tabIndex = 0;
    swatch.setAttribute("role", "button");
    swatch.addEventListener("click", (event) => {
      event.preventDefault();
      if (activeColorControl === control && !colorPickerPopup.hidden) closeColorPicker();
      else openColorPicker(control);
    });
    swatch.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openColorPicker(control);
    });
  }

  picker?.addEventListener("input", () => {
    if (!(picker instanceof HTMLInputElement)) return;
    const state = getCustomColorState(control);
    if (!state) return;
    applyCustomColorValue(control, picker.value, state.opacity);
  });
  picker?.addEventListener("focus", () => beginHistoryGesture(control));
  picker?.addEventListener("change", () => endHistoryGesture(control));
  picker?.addEventListener("blur", () => endHistoryGesture(control));

  hexInput?.addEventListener("focus", () => {
    beginHistoryGesture(control);
    if (hexInput instanceof HTMLInputElement) hexInput.select();
  });
  const commitHexInput = () => {
    if (!(hexInput instanceof HTMLInputElement)) return;
    const state = getCustomColorState(control);
    if (!state || !(state.picker instanceof HTMLInputElement)) return;
    const color = normalizeHexColor(hexInput.value);
    if (color) {
      applyCustomColorValue(control, color, state.opacity);
      return;
    }
    syncCustomColorControl(state.picker, state.color, state.opacity);
  };
  hexInput?.addEventListener("input", () => {
    if (!(hexInput instanceof HTMLInputElement)) return;
    if (!/^[\da-f]{6}$/i.test(hexInput.value.trim())) return;
    const color = normalizeHexColor(hexInput.value);
    const state = getCustomColorState(control);
    if (color && state) applyCustomColorValue(control, color, state.opacity);
  });
  hexInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitHexInput();
    if (hexInput instanceof HTMLInputElement) hexInput.select();
  });
  hexInput?.addEventListener("blur", () => {
    commitHexInput();
    endHistoryGesture(control);
  });

  opacityInput?.addEventListener("focus", () => {
    beginHistoryGesture(control);
    if (opacityInput instanceof HTMLInputElement) opacityInput.select();
  });
  opacityInput?.addEventListener("input", () => {
    if (!(opacityInput instanceof HTMLInputElement) || opacityInput.value.trim() === "") return;
    const state = getCustomColorState(control);
    if (!state || !Number.isFinite(Number(opacityInput.value))) return;
    applyCustomColorValue(control, state.color, opacityInput.value);
  });
  opacityInput?.addEventListener("keydown", (event) => {
    if (!(opacityInput instanceof HTMLInputElement) || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const state = getCustomColorState(control);
    if (!state) return;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    applyCustomColorValue(control, state.color, state.opacity + direction);
  });
  opacityInput?.addEventListener("blur", () => {
    const state = getCustomColorState(control);
    if (state && state.picker instanceof HTMLInputElement) {
      syncCustomColorControl(state.picker, state.color, state.opacity);
    }
    endHistoryGesture(control);
  });
  bindNumberSuffixScrubber(
    opacitySuffix,
    opacityInput,
    control,
    () => control,
  );

  actionButton?.addEventListener("click", () => {
    const state = getCustomColorState(control);
    if (!state) return;
    const fallbackColors = {
      canvas: "#121619",
      "frame-background": "#FFFFFF",
      "frame-outline": "#000000",
      text: "#000000",
      vector: "#000000",
    };
    const nextColor = normalizeHexColor(control.dataset.lastColor)
      || fallbackColors[control.dataset.colorControl]
      || "#000000";
    const nextOpacity = control.dataset.colorControl === "text" && !normalizeHexColor(state.color)
      ? 100
      : state.opacity;
    beginHistoryGesture(control);
    applyCustomColorValue(control, nextColor, nextOpacity);
    endHistoryGesture(control);
  });

  removeButton?.addEventListener("click", () => {
    const state = getCustomColorState(control);
    if (state?.color) {
      beginHistoryGesture(control);
      applyCustomColorValue(control, "", state.opacity);
      endHistoryGesture(control);
      if (activeColorControl === control) closeColorPicker();
    }
  });
});

if (colorPicker instanceof HTMLInputElement) {
  syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
}

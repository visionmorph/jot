/* Page and layer inspector coordination, typography, layout, and property editing. */

function normalizeFrameHtmlTag(value) {
  return value.trim().toLowerCase() === "button" ? "button" : "div";
}

function normalizeFrameAlignment(value) {
  const alignments = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return alignments.includes(value) ? value : "top-left";
}


function getFrameAlignmentValues(element) {
  const alignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  const toFlexValue = (value) => value === "center" ? "center" : value === "right" || value === "bottom" ? "flex-end" : "flex-start";
  const direction = element.dataset.direction === "vertical" ? "vertical" : "horizontal";
  return direction === "vertical"
    ? { alignItems: toFlexValue(horizontal), justifyContent: toFlexValue(vertical) }
    : { alignItems: toFlexValue(vertical), justifyContent: toFlexValue(horizontal) };
}

function syncFrameAlignmentDistribution(element) {
  if (!(frameAlignmentGrid instanceof HTMLElement)) return;
  const isVariantSelected = selectedVariantInstanceId !== null;
  const direction = (isVariantSelected
    ? getSelectedVariantTargetStyleOverride("flexDirection", element.dataset.direction === "vertical" ? "column" : "row")
    : element.dataset.direction === "vertical" ? "column" : "row") === "column"
      ? "vertical"
      : "horizontal";
  const fallbackValues = getFrameAlignmentValues({
    dataset: {
      alignment: element.dataset.alignment,
      direction,
    },
  });
  const alignItems = isVariantSelected
    ? getSelectedVariantTargetStyleOverride("alignItems", element.style.alignItems || fallbackValues.alignItems)
    : element.style.alignItems || fallbackValues.alignItems;
  const justifyContent = isVariantSelected
    ? getSelectedVariantTargetStyleOverride("justifyContent", element.style.justifyContent || fallbackValues.justifyContent)
    : element.style.justifyContent || fallbackValues.justifyContent;
  const isSpaceBetween = isVariantSelected
    ? justifyContent === "space-between"
    : element.dataset.gapMode === "auto";

  frameAlignmentGrid.dataset.direction = direction;
  frameAlignmentGrid.dataset.spaceBetween = String(isSpaceBetween);
  frameAlignmentOptions.forEach((option) => {
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    const values = getFrameAlignmentValues({ dataset: { alignment, direction } });
    const isSelected = values.alignItems === alignItems
      && (isSpaceBetween || values.justifyContent === justifyContent);
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
}

function isFrameAlignmentOptionSelected(element, alignment) {
  const selectedAlignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  if (element.dataset.gapMode !== "auto") return selectedAlignment === alignment;
  const selectedAxes = selectedAlignment === "center" ? ["center", "center"] : selectedAlignment.split("-");
  const optionAxes = alignment === "center" ? ["center", "center"] : alignment.split("-");
  return element.dataset.direction === "vertical"
    ? selectedAxes[1] === optionAxes[1]
    : selectedAxes[0] === optionAxes[0];
}


function getFrameOutlineBoxShadow(element) {
  const color = getColorWithOpacity(
    element.dataset.outlineColor || "",
    element.dataset.outlineColorOpacity || "100",
  );
  const weight = Math.max(0, Number(element.dataset.outlineWeight || "1"));
  if (!color || !Number.isFinite(weight) || weight === 0) return "";
  const position = ["inside", "outside", "center"].includes(element.dataset.outlinePosition)
    ? element.dataset.outlinePosition
    : "inside";
  if (position === "outside") return `0 0 0 ${weight}px ${color}`;
  if (position === "center") {
    const halfWeight = weight / 2;
    return `0 0 0 ${halfWeight}px ${color}, inset 0 0 0 ${halfWeight}px ${color}`;
  }
  return `inset 0 0 0 ${weight}px ${color}`;
}


function syncFramePaddingAxisInputs(element) {
  framePaddingAxisInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const sides = input.dataset.framePaddingAxis === "y" ? ["top", "bottom"] : ["left", "right"];
    const values = sides.map((side) => {
      const property = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      const fallback = `${element.dataset[property] || "10"}px`;
      const value = selectedVariantInstanceId !== null
        ? getSelectedVariantTargetStyleOverride(property, fallback)
        : fallback;
      return Number(String(value).replace(/px$/i, ""));
    });
    input.value = values[0] === values[1] ? String(values[0]) : `${values[0]}, ${values[1]}`;
  });
}

function parseFramePaddingAxisValue(value) {
  const parts = String(value).split(",").map((part) => part.trim());
  if (parts.length < 1 || parts.length > 2 || parts.some((part) => part === "")) return null;
  const values = parts.map(Number);
  if (values.some((number) => !Number.isFinite(number) || number < 0)) return null;
  return values.length === 1 ? [values[0], values[0]] : values;
}

function setFramePaddingControlMode(isIndividual) {
  if (framePaddingModeToggle instanceof HTMLButtonElement) {
    framePaddingModeToggle.setAttribute("aria-pressed", String(isIndividual));
  }
  if (framePaddingSides instanceof HTMLElement) framePaddingSides.hidden = !isIndividual;
  if (framePaddingAxes instanceof HTMLElement) framePaddingAxes.hidden = isIndividual;
}

function syncInspectorToSelectedFrame() {
  const record = getSelectedFrameRecord();
  if (!record) return;
  const { element } = record;
  const bounds = element.getBoundingClientRect();
  const isVariantSelected = selectedVariantInstanceId !== null;
  const getValue = (property, fallback) => isVariantSelected
    ? getSelectedVariantTargetStyleOverride(property, fallback)
    : fallback;

  if (frameInspectorHeading instanceof HTMLElement) {
    frameInspectorHeading.textContent = record.isComponent
      ? currentComponent?.name || "Component"
      : "Frame";
  }
  if (addVariantAction instanceof HTMLElement) addVariantAction.hidden = !record.isComponent;

  frameDirectionOptions.forEach((option) => {
    const direction = getValue("flexDirection", element.dataset.direction === "vertical" ? "column" : "row") === "column"
      ? "vertical"
      : "horizontal";
    const isSelected = option.getAttribute("data-frame-direction") === direction;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  syncFrameAlignmentDistribution(element);
  if (frameGapInput instanceof HTMLInputElement) {
    const fixedGap = element.dataset.gap || "10";
    syncFrameGapOptions(fixedGap);
    const gap = getValue("gap", element.dataset.gapMode === "auto" ? "0px" : `${element.dataset.gap || "10"}px`);
    const displayedGap = element.dataset.gapMode === "auto" && !isVariantSelected
      ? "auto"
      : String(gap).replace(/px$/i, "");
    setDropdownValue(frameGapInput, displayedGap);
  }

  frameSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.frameSize;
    if (dimension !== "width" && dimension !== "height") return;
    const override = getValue(dimension, "");
    const mode = isVariantSelected && override
      ? override === "100%" ? "fill" : override === "auto" ? "hug" : "fixed"
      : getLayerDimensionMode(element, dimension);
    const overriddenNumber = Number.parseFloat(override);
    input.value = mode === "fixed"
      ? String(Number.isFinite(overriddenNumber) ? overriddenNumber : element.dataset[dimension] || Math.round(bounds[dimension]))
      : String(Math.round(bounds[dimension]));
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, mode);
  });

  framePaddingInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const side = input.dataset.framePadding;
    if (!side) return;
    input.value = String(getValue(
      `padding${side[0].toUpperCase()}${side.slice(1)}`,
      `${element.dataset[`padding${side[0].toUpperCase()}${side.slice(1)}`] || "10"}px`,
    )).replace(/px$/, "");
  });
  syncFramePaddingAxisInputs(element);

  if (frameRadiusInput instanceof HTMLInputElement) {
    frameRadiusInput.value = String(getValue("borderRadius", `${element.dataset.radius || "0"}px`)).replace(/px$/, "");
  }
  if (frameColorPicker instanceof HTMLInputElement) {
    const colorValue = getValue("backgroundColor", element.dataset.frameColor || "");
    const rgbaAlpha = String(colorValue).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const color = normalizeHexColor(colorValue) || cssColorToHex(colorValue) || "";
    const opacity = rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : element.dataset.frameColorOpacity || "100";
    syncCustomColorControl(frameColorPicker, color, opacity);
  }
  if (frameOutlineColorPicker instanceof HTMLInputElement) {
    const color = element.dataset.outlineColor || "";
    syncCustomColorControl(frameOutlineColorPicker, color, element.dataset.outlineColorOpacity || "100");
  }
  if (frameOutlinePositionSelect instanceof HTMLInputElement) {
    setDropdownValue(frameOutlinePositionSelect, ["inside", "outside", "center"].includes(element.dataset.outlinePosition)
      ? element.dataset.outlinePosition
      : "inside");
  }
  if (frameOutlineWeightInput instanceof HTMLInputElement) {
    frameOutlineWeightInput.value = element.dataset.outlineWeight || "1";
  }
  if (frameHtmlTagInput instanceof HTMLInputElement) {
    setDropdownValue(frameHtmlTagInput, normalizeFrameHtmlTag(element.dataset.htmlTag || "div"));
  }
}


function cssColorToHex(value) {
  const normalized = String(value || "").trim();
  const hexMatch = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    return `#${hex.length === 3 ? [...hex].map((character) => character.repeat(2)).join("") : hex}`.toLowerCase();
  }
  const colorValues = normalized.match(/[\d.]+/g);
  if (!colorValues || colorValues.length < 3) return null;
  const [red, green, blue] = colorValues.slice(0, 3).map((channel) => Math.max(0, Math.min(255, Math.round(Number(channel)))));
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}


function updateInspector() {
  const isVariantSelected = selectedVariantInstanceId !== null;
  const variantTargetType = isVariantSelected ? getVariantTargetType(selectedVariantLayerTarget) : null;
  const isVariantTextSelected = variantTargetType === "text";
  const isVariantFrameSelected = variantTargetType === "frame";
  const isVariantVectorSelected = variantTargetType === "vector";
  const isComponentSelected = selectedComponentId === currentComponent?.id
    || (isVariantSelected && selectedVariantLayerTarget === null);
  const isTextSelected = isVariantTextSelected || (!isComponentSelected && selectedCanvasText !== null);
  const isFrameSelected = isComponentSelected || isVariantFrameSelected || selectedCanvasFrame !== null;
  const isVectorSelected = isVariantVectorSelected || (!isComponentSelected && selectedCanvasVector !== null);
  if (pageInspector instanceof HTMLElement) pageInspector.hidden = isTextSelected || isFrameSelected || isVectorSelected;
  if (frameInspector instanceof HTMLElement) frameInspector.hidden = !isFrameSelected;
  if (textInspector instanceof HTMLElement) textInspector.hidden = !isTextSelected;
  if (vectorInspector instanceof HTMLElement) vectorInspector.hidden = !isVectorSelected;
  if (isTextSelected) syncInspectorToSelectedText();
  if (isFrameSelected) syncInspectorToSelectedFrame();
  if (isVectorSelected) syncInspectorToSelectedVector();
  if (!isVariantSelected && !isTextSelected && !isFrameSelected && !isVectorSelected && colorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
  }
  requestAnimationFrame(syncResizeOverlay);
}



function getSizeInputContext(input) {
  const frameDimension = input.dataset.frameSize;
  const textDimension = input.dataset.textLayerSize;
  if (frameDimension === "width" || frameDimension === "height") {
    const record = getSelectedFrameRecord();
    return record ? { type: "frame", record, dimension: frameDimension } : null;
  }
  if (textDimension === "width" || textDimension === "height") {
    const record = getSelectedTextRecord();
    return record ? { type: "text", record, dimension: textDimension } : null;
  }
  return null;
}

function setSizeComboboxOpen(wrapper, isOpen) {
  const input = wrapper.querySelector("input");
  const toggle = wrapper.querySelector("[data-size-toggle]");
  const menu = wrapper.querySelector("[data-size-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;
  sizeModeComboboxes.forEach((combobox) => {
    const otherMenu = combobox.querySelector("[data-size-menu]");
    const otherInput = combobox.querySelector("input");
    const otherToggle = combobox.querySelector("[data-size-toggle]");
    if (otherMenu instanceof HTMLElement) otherMenu.hidden = true;
    combobox.classList.remove("is-open");
    otherInput?.setAttribute("aria-expanded", "false");
    otherToggle?.setAttribute("aria-expanded", "false");
  });
  menu.hidden = !isOpen;
  wrapper.classList.toggle("is-open", isOpen);
  input.setAttribute("aria-expanded", String(isOpen));
  toggle?.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    input.focus();
    input.select();
  }
}

function updateSizeOptionSelection(wrapper, mode) {
  wrapper.querySelectorAll("[data-size-option]").forEach((option) => {
    option.setAttribute("aria-selected", String(option.getAttribute("data-size-option") === mode));
  });
  const toggleLabel = wrapper.querySelector("[data-size-toggle-label]");
  if (toggleLabel instanceof HTMLElement) {
    toggleLabel.textContent = mode === "hug" ? "Hug" : mode === "fill" ? "Fill" : "";
  }
  wrapper.dataset.sizeMode = mode;
}

function getRenderedSizeValue(element, dimension, fallback = 100) {
  const renderedValue = Math.round(element.getBoundingClientRect()[dimension]);
  return String(Number.isFinite(renderedValue) && renderedValue > 0 ? renderedValue : fallback);
}

function applySizeInputValue(input, rawValue = input.value, normalize = true) {
  const context = getSizeInputContext(input);
  if (!context) return false;
  const { type, record, dimension } = context;
  const element = record.element;
  const trimmedValue = rawValue.trim();
  const requestedMode = /^hug$/i.test(trimmedValue)
    ? "hug"
    : /^fill$/i.test(trimmedValue)
      ? "fill"
      : /^fixed$/i.test(trimmedValue)
        ? "fixed"
        : null;
  const numberMatch = trimmedValue.match(/^\d+(?:\.\d+)?$/);
  if (!requestedMode && !numberMatch) return false;
  const fixedNumber = numberMatch
    ? Math.max(MIN_INTERACTIVE_LAYER_SIZE, Number(numberMatch[0]))
    : null;

  if (selectedVariantInstanceId !== null && type === "frame" && record.isVariantInstance) {
    const preservedFixedValue = fixedNumber ?? (
      Number(element.dataset[dimension])
      || Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(element.getBoundingClientRect()[dimension]))
    );
    const value = numberMatch
      ? `${fixedNumber}px`
      : requestedMode === "fill" ? "100%" : requestedMode === "fixed" ? `${preservedFixedValue}px` : "auto";
    recordHistoryForGesture(input);
    setSelectedVariantFrameStyleOverride(dimension, value, { record: false });
    if (normalize) input.value = numberMatch || requestedMode === "fixed"
      ? String(preservedFixedValue)
      : getRenderedSizeValue(element, dimension);
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, numberMatch ? "fixed" : requestedMode);
    return true;
  }
  if (selectedVariantInstanceId !== null && type === "text" && record.isVariantInstance) {
    const preservedFixedValue = fixedNumber ?? (
      Number(element.dataset[dimension])
      || Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(element.getBoundingClientRect()[dimension]))
    );
    const value = numberMatch
      ? `${fixedNumber}px`
      : requestedMode === "fill" ? "100%" : requestedMode === "fixed" ? `${preservedFixedValue}px` : "auto";
    recordHistoryForGesture(input);
    element.style[dimension] = value;
    element.dataset[`${dimension}Mode`] = numberMatch ? "fixed" : requestedMode;
    if (numberMatch || requestedMode === "fixed") element.dataset[dimension] = String(preservedFixedValue);
    setSelectedVariantLayerOverride(dimension, value);
    if (normalize) input.value = numberMatch || requestedMode === "fixed"
      ? String(preservedFixedValue)
      : getRenderedSizeValue(element, dimension);
    const wrapper = input.closest("[data-size-combobox]");
    if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, numberMatch ? "fixed" : requestedMode);
    requestAnimationFrame(syncResizeOverlay);
    return true;
  }

  const currentMode = getLayerDimensionMode(element, dimension, type === "text" ? "hug" : "fixed");
  const mode = numberMatch ? "fixed" : requestedMode;
  let fixedValue = Number(element.dataset[dimension]);
  if (numberMatch) fixedValue = fixedNumber;
  if (mode === "fixed" && !Number.isFinite(fixedValue)) {
    fixedValue = Math.max(MIN_INTERACTIVE_LAYER_SIZE, Math.round(element.getBoundingClientRect()[dimension]));
  }
  const hasChange = currentMode !== mode
    || (mode === "fixed" && Number(element.dataset[dimension]) !== fixedValue);
  if (hasChange) recordHistoryForGesture(input);

  element.dataset[`${dimension}Mode`] = mode;
  if (mode === "fixed") element.dataset[dimension] = String(fixedValue);
  applyLayerSizing(type, record);
  if (normalize) input.value = mode === "fixed"
    ? String(fixedValue)
    : getRenderedSizeValue(element, dimension);
  const wrapper = input.closest("[data-size-combobox]");
  if (wrapper instanceof HTMLElement) updateSizeOptionSelection(wrapper, mode);
  requestAnimationFrame(syncResizeOverlay);
  return true;
}

sizeModeComboboxes.forEach((wrapper) => {
  const input = wrapper.querySelector("input");
  const toggle = wrapper.querySelector("[data-size-toggle]");
  const menu = wrapper.querySelector("[data-size-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;

  input.addEventListener("focus", () => input.select());
  input.addEventListener("input", () => {
    input.dataset.sizeInputDirty = "true";
    applySizeInputValue(input, input.value, false);
  });
  input.addEventListener("blur", (event) => {
    if (event.relatedTarget instanceof Node && wrapper.contains(event.relatedTarget)) return;
    const wasEdited = input.dataset.sizeInputDirty === "true";
    delete input.dataset.sizeInputDirty;
    if (wasEdited && !applySizeInputValue(input)) {
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
    } else if (!wasEdited) {
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
    }
    setSizeComboboxOpen(wrapper, false);
    wrapper.classList.remove("is-selection-focused");
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSizeComboboxOpen(wrapper, true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSizeComboboxOpen(wrapper, false);
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const wasEdited = input.dataset.sizeInputDirty === "true";
    delete input.dataset.sizeInputDirty;
    if (wasEdited && !applySizeInputValue(input)) {
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
    } else if (!wasEdited) {
      if (input.dataset.frameSize) syncInspectorToSelectedFrame();
      else syncInspectorToSelectedText();
    }
    setSizeComboboxOpen(wrapper, false);
  });
  bindHistoryGesture(input);

  toggle?.addEventListener("click", () => {
    setSizeComboboxOpen(wrapper, menu.hidden);
  });

  wrapper.querySelectorAll("[data-size-option]").forEach((option) => {
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      const mode = option.getAttribute("data-size-option");
      if (mode) applySizeInputValue(input, mode);
      setSizeComboboxOpen(wrapper, false);
      input.focus();
      wrapper.classList.add("is-selection-focused");
    });
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Node)) return;
  if (sizeModeComboboxes.some((wrapper) => wrapper.contains(event.target))) return;
  const firstCombobox = sizeModeComboboxes[0];
  if (firstCombobox instanceof HTMLElement) setSizeComboboxOpen(firstCombobox, false);
});

framePaddingInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("input", () => {
    const record = getSelectedFrameRecord();
    const side = input.dataset.framePadding;
    const value = Number(input.value);
    if (!record || !side || !Number.isFinite(value) || value < 0) return;
    const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
    if (selectedVariantInstanceId !== null) {
      if (getSelectedVariantTargetStyleOverride(propertyName, `${record.element.dataset[propertyName] || "10"}px`) === `${value}px`) return;
      recordHistoryForGesture(input);
      setSelectedVariantFrameStyleOverride(propertyName, `${value}px`, { record: false });
      syncFramePaddingAxisInputs(record.element);
      return;
    }
    if (Number(record.element.dataset[propertyName] || "10") !== value) recordHistoryForGesture(input);
    record.element.dataset[propertyName] = String(value);
    record.element.style[propertyName] = `${value}px`;
    syncFramePaddingAxisInputs(record.element);
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", syncInspectorToSelectedFrame);
  bindHistoryGesture(input);
});

framePaddingAxisInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  const wrapper = input.closest(".text-input-shell");
  input.addEventListener("focus", () => {
    wrapper?.classList.add("is-selection-focused");
  });
  input.addEventListener("input", () => {
    const record = getSelectedFrameRecord();
    const axis = input.dataset.framePaddingAxis;
    const values = parseFramePaddingAxisValue(input.value);
    if (!record || (axis !== "x" && axis !== "y") || !values) return;
    const sides = axis === "x" ? ["left", "right"] : ["top", "bottom"];
    if (selectedVariantInstanceId !== null) {
      const hasVariantChange = sides.some((side, index) => {
        const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
        return getSelectedVariantTargetStyleOverride(propertyName, `${record.element.dataset[propertyName] || "10"}px`) !== `${values[index]}px`;
      });
      if (!hasVariantChange) return;
      recordHistoryForGesture(input);
      sides.forEach((side, index) => setSelectedVariantFrameStyleOverride(`padding${side[0].toUpperCase()}${side.slice(1)}`, `${values[index]}px`, { record: false }));
      syncFramePaddingAxisInputs(record.element);
      return;
    }
    const hasChange = sides.some((side, index) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      return Number(record.element.dataset[propertyName] || "10") !== values[index];
    });
    if (hasChange) recordHistoryForGesture(input);
    sides.forEach((side, index) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      record.element.dataset[propertyName] = String(values[index]);
      record.element.style[propertyName] = `${values[index]}px`;
      const sideInput = framePaddingInputs.find((candidate) => candidate.dataset.framePadding === side);
      if (sideInput instanceof HTMLInputElement) sideInput.value = String(values[index]);
    });
    requestAnimationFrame(syncResizeOverlay);
  });
  input.addEventListener("blur", () => {
    syncInspectorToSelectedFrame();
    wrapper?.classList.remove("is-selection-focused");
  });
  bindHistoryGesture(input);
});

framePaddingModeToggle?.addEventListener("click", () => {
  if (!(framePaddingModeToggle instanceof HTMLButtonElement)) return;
  framePaddingModeToggle.focus();
  const isIndividual = framePaddingModeToggle.getAttribute("aria-pressed") !== "true";
  setFramePaddingControlMode(isIndividual);
  const record = getSelectedFrameRecord();
  if (record) syncFramePaddingAxisInputs(record.element);
});

frameRadiusInput?.addEventListener("input", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameRadiusInput instanceof HTMLInputElement)) return;
  const value = Number(frameRadiusInput.value);
  if (!Number.isFinite(value) || value < 0) return;
  if (selectedVariantInstanceId !== null) {
    if (getSelectedVariantTargetStyleOverride("borderRadius", `${record.element.dataset.radius || "0"}px`) === `${value}px`) return;
    recordHistoryForGesture(frameRadiusInput);
    setSelectedVariantFrameStyleOverride("borderRadius", `${value}px`, { record: false });
    return;
  }
  if (Number(record.element.dataset.radius || "0") !== value) recordHistoryForGesture(frameRadiusInput);
  record.element.dataset.radius = String(value);
  record.element.style.borderRadius = `${value}px`;
});

frameRadiusInput?.addEventListener("blur", syncInspectorToSelectedFrame);
if (frameRadiusInput instanceof HTMLElement) bindHistoryGesture(frameRadiusInput);

frameDirectionOptions.forEach((option) => {
  option.addEventListener("click", () => {
    option.focus();
    const record = getSelectedFrameRecord();
    const direction = option.getAttribute("data-frame-direction") === "vertical" ? "vertical" : "horizontal";
    if (selectedVariantInstanceId !== null) {
      setSelectedVariantFrameStyleOverride("flexDirection", direction === "vertical" ? "column" : "row");
      syncInspectorToSelectedFrame();
      return;
    }
    if (!record || (record.element.dataset.direction || "horizontal") === direction) return;
    recordHistory();
    record.element.dataset.direction = direction;
    record.element.style.flexDirection = direction === "vertical" ? "column" : "row";
    applyFrameAlignment(record.element);
    applyAllLayerSizing();
    syncInspectorToSelectedFrame();
    renderTree();
  });
});

frameAlignmentOptions.forEach((option) => {
  let variantWasSpaceBetweenAtFirstClick = false;
  option.addEventListener("click", (event) => {
    option.focus();
    const record = getSelectedFrameRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    if (selectedVariantInstanceId !== null) {
      const values = getFrameAlignmentValues({ dataset: { alignment, direction: getSelectedVariantTargetStyleOverride("flexDirection", record?.element.dataset.direction === "vertical" ? "column" : "row") === "column" ? "vertical" : "horizontal" } });
      const isSpaceBetween = getSelectedVariantTargetStyleOverride("justifyContent", record?.element.style.justifyContent || "flex-start") === "space-between";
      if (event.detail === 1) variantWasSpaceBetweenAtFirstClick = isSpaceBetween;
      if (event.detail === 2 && variantWasSpaceBetweenAtFirstClick) return;
      if (
        getSelectedVariantTargetStyleOverride("alignItems", record?.element.style.alignItems || "flex-start") === values.alignItems
        && getSelectedVariantTargetStyleOverride("justifyContent", record?.element.style.justifyContent || "flex-start") === values.justifyContent
      ) return;
      recordHistory();
      setSelectedVariantFrameStyleOverride("alignItems", values.alignItems, { record: false });
      setSelectedVariantFrameStyleOverride("justifyContent", values.justifyContent, { record: false });
      syncInspectorToSelectedFrame();
      return;
    }
    if (!record || isFrameAlignmentOptionSelected(record.element, alignment)) return;
    recordHistory();
    record.element.dataset.alignment = alignment;
    applyFrameAlignment(record.element);
    syncInspectorToSelectedFrame();
    renderTree();
  });
  option.addEventListener("dblclick", (event) => {
    const record = getSelectedFrameRecord();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    event.preventDefault();
    if (!record) return;
    if (selectedVariantInstanceId !== null) {
      const values = getFrameAlignmentValues({ dataset: { alignment, direction: getSelectedVariantTargetStyleOverride("flexDirection", record.element.dataset.direction === "vertical" ? "column" : "row") === "column" ? "vertical" : "horizontal" } });
      if (variantWasSpaceBetweenAtFirstClick) {
        setSelectedVariantFrameStyleOverride("justifyContent", values.justifyContent, { record: false });
      } else if (getSelectedVariantTargetStyleOverride("justifyContent", record.element.style.justifyContent || "flex-start") !== "space-between") {
        recordHistory();
        setSelectedVariantFrameStyleOverride("justifyContent", "space-between", { record: false });
      }
      variantWasSpaceBetweenAtFirstClick = false;
      syncInspectorToSelectedFrame();
      return;
    }
    recordHistory();
    const enableSpaceBetween = record.element.dataset.gapMode !== "auto";
    record.element.dataset.gapMode = enableSpaceBetween ? "auto" : "fixed";
    record.element.style.gap = enableSpaceBetween ? "0px" : `${record.element.dataset.gap || "10"}px`;
    applyFrameAlignment(record.element);
    syncInspectorToSelectedFrame();
  });
});

frameOutlinePositionSelect?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameOutlinePositionSelect instanceof HTMLInputElement)) return;
  const selectedPosition = getDropdownValue(frameOutlinePositionSelect);
  const position = ["outside", "center"].includes(selectedPosition)
    ? selectedPosition
    : "inside";
  if ((record.element.dataset.outlinePosition || "inside") === position) return;
  if (selectedVariantInstanceId !== null && record.isVariantInstance) {
    setSelectedVariantFrameStyleOverride("outlinePosition", position);
    return;
  }
  recordHistory();
  record.element.dataset.outlinePosition = position;
  applyFrameOutline(record.element);
});

frameOutlineWeightInput?.addEventListener("input", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameOutlineWeightInput instanceof HTMLInputElement)) return;
  const weight = Number(frameOutlineWeightInput.value);
  if (!Number.isFinite(weight) || weight < 0) return;
  if (Number(record.element.dataset.outlineWeight || "1") !== weight) recordHistoryForGesture(frameOutlineWeightInput);
  if (selectedVariantInstanceId !== null && record.isVariantInstance) {
    setSelectedVariantFrameStyleOverride("outlineWeight", String(weight), { record: false, render: false });
    return;
  }
  record.element.dataset.outlineWeight = String(weight);
  applyFrameOutline(record.element);
});

frameOutlineWeightInput?.addEventListener("blur", syncInspectorToSelectedFrame);
if (frameOutlineWeightInput instanceof HTMLElement) bindHistoryGesture(frameOutlineWeightInput);

function setFrameGapMenuOpen(isOpen) {
  setDropdownOpen(frameGapCombobox, isOpen);
}

function syncFrameGapOptions(fixedValue = "10") {
  if (!(frameGapCombobox instanceof HTMLElement)) return;
  const fixedOption = frameGapCombobox.querySelector("[data-gap-option='fixed']");
  if (!(fixedOption instanceof HTMLButtonElement)) return;
  const normalizedValue = String(Math.max(0, Number(fixedValue) || 0));
  fixedOption.dataset.dropdownValue = normalizedValue;
  fixedOption.textContent = normalizedValue;
}

function applyFrameGapValue(normalize = true) {
  const record = getSelectedFrameRecord();
  if (!record || !(frameGapInput instanceof HTMLInputElement)) return false;
  const value = frameGapInput.value.trim();

  if (selectedVariantInstanceId !== null) {
    if (/^auto$/i.test(value)) {
      recordHistoryForGesture(frameGapInput);
      return setSelectedVariantFrameStyleOverride("gap", "0px", { record: false });
    }
    const variantMatch = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
    if (!variantMatch) return false;
    const gap = `${Math.max(0, Number(variantMatch[1]))}px`;
    recordHistoryForGesture(frameGapInput);
    setSelectedVariantFrameStyleOverride("gap", gap, { record: false });
    const normalizedGap = String(Math.max(0, Number(variantMatch[1])));
    syncFrameGapOptions(normalizedGap);
    if (normalize) setDropdownValue(frameGapInput, normalizedGap);
    return true;
  }

  if (/^auto$/i.test(value)) {
    if (record.element.dataset.gapMode !== "auto") recordHistoryForGesture(frameGapInput);
    record.element.dataset.gapMode = "auto";
    record.element.style.gap = "0px";
    applyFrameAlignment(record.element);
    syncFrameAlignmentDistribution(record.element);
    if (normalize) frameGapInput.value = "Auto";
    return true;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  if (!match) return false;
  const gap = Math.max(0, Number(match[1]));
  if (record.element.dataset.gapMode !== "fixed" || Number(record.element.dataset.gap || "10") !== gap) {
    recordHistoryForGesture(frameGapInput);
  }
  record.element.dataset.gapMode = "fixed";
  record.element.dataset.gap = String(gap);
  record.element.style.gap = `${gap}px`;
  syncFrameGapOptions(gap);
  applyFrameAlignment(record.element);
  syncFrameAlignmentDistribution(record.element);
  if (normalize) setDropdownValue(frameGapInput, gap);
  return true;
}

frameGapInput?.addEventListener("focus", () => {
  if (frameGapInput instanceof HTMLInputElement) frameGapInput.select();
  frameGapCombobox?.classList.add("is-selection-focused");
});

frameGapInput?.addEventListener("input", () => applyFrameGapValue(false));

frameGapInput?.addEventListener("blur", (event) => {
  if (frameGapCombobox instanceof HTMLElement && event.relatedTarget instanceof Node && frameGapCombobox.contains(event.relatedTarget)) return;
  if (!applyFrameGapValue()) syncInspectorToSelectedFrame();
  setFrameGapMenuOpen(false);
  frameGapCombobox?.classList.remove("is-selection-focused");
});

frameGapInput?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setFrameGapMenuOpen(true);
    return;
  }
  if (event.key === "Escape") {
    setFrameGapMenuOpen(false);
    syncInspectorToSelectedFrame();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!applyFrameGapValue()) syncInspectorToSelectedFrame();
  setFrameGapMenuOpen(false);
});
if (frameGapInput instanceof HTMLElement) bindHistoryGesture(frameGapInput);
frameGapInput?.addEventListener("change", () => applyFrameGapValue());

frameHtmlTagInput?.addEventListener("change", () => {
  const record = getSelectedFrameRecord();
  if (!record || !(frameHtmlTagInput instanceof HTMLInputElement)) return;
  const htmlTag = normalizeFrameHtmlTag(getDropdownValue(frameHtmlTagInput));
  const sourceRecord = record.isVariantInstance
    ? selectedVariantLayerTarget?.startsWith("frame:")
      ? getFrameRecord(record.id)
      : currentComponent?.frameRecord
    : record;
  if (!sourceRecord) return;
  if ((sourceRecord.element.dataset.htmlTag || "div") !== htmlTag) recordHistory();
  sourceRecord.element.dataset.htmlTag = htmlTag;
  if (record.isVariantInstance) renderVariantInstances();
  renderComponentProps();
});

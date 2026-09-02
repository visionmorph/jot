/* Page and layer inspector coordination, typography, layout, and property editing. */


function normalizeFrameAlignment(value) {
  const alignments = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return alignments.includes(value) ? value : "top-left";
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

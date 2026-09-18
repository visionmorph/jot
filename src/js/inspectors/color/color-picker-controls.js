/* Inline color-control binding, actions, and refresh scheduling. */

function bindCustomColorControl(control) {
  if (!(control instanceof HTMLElement)) return;
  if (control.dataset.colorControlBound === "true") return;
  control.dataset.colorControlBound = "true";
  const picker = control.querySelector("input[type='color']");
  const hexInput = control.querySelector("[data-color-hex]");
  const opacityInput = control.querySelector("[data-color-opacity]");
  const opacitySuffix = control.querySelector("[data-number-suffix]");
  const section = control.closest("[data-paint-section]");
  const actionButton = section?.querySelector("[data-color-action]");
  const removeButton = control.querySelector("[data-color-remove-action]");
  const swatch = control.querySelector(".custom-color-swatch");
  let directSelectionColorRange = null;
  let isDirectSelectionColorEditing = false;

  const captureDirectSelectionColorRange = () => {
    if (control.dataset.colorControl !== "selection" || !colorPickerPopup.hidden) return;
    const record = getSelectedTextRecord();
    const rangeSelection = getActiveTextRangeSelection(record);
    directSelectionColorRange = rangeSelection ? { ...rangeSelection } : null;
    if (!isDirectSelectionColorEditing) showTextColorPickerRangeHighlight(directSelectionColorRange);
  };
  const beginDirectSelectionColorEdit = (state, color, opacity) => {
    if (!directSelectionColorRange || !state) return;
    if (normalizeHexColor(state.color) === normalizeHexColor(color)
      && normalizeColorOpacity(state.opacity) === normalizeColorOpacity(opacity)) return;
    isDirectSelectionColorEditing = true;
    clearTextColorPickerRangeHighlight();
  };
  const finishDirectSelectionColorEdit = () => {
    if (!directSelectionColorRange) return;
    isDirectSelectionColorEditing = false;
    showTextColorPickerRangeHighlight(directSelectionColorRange);
  };

  if (swatch instanceof HTMLElement) {
    swatch.tabIndex = 0;
    swatch.setAttribute("role", "button");
    swatch.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || (activeColorControl === control && !colorPickerPopup.hidden)) return;
      captureColorPickerTextRange(control);
      showTextColorPickerRangeHighlight(colorPickerTextRangeSelection);
    });
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
  picker?.addEventListener("change", () => {
    endHistoryGesture(control);
    scheduleSelectionColorControlsRefresh(control, { refreshWhileFocused: true });
  });
  picker?.addEventListener("blur", () => endHistoryGesture(control));

  hexInput?.addEventListener("focus", () => {
    captureTextColorControlRange(control);
    captureDirectSelectionColorRange();
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
    if (color && state) {
      beginDirectSelectionColorEdit(state, color, state.opacity);
      applyCustomColorValue(control, color, state.opacity);
    }
  });
  hexInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    commitHexInput();
    finishDirectSelectionColorEdit();
    if (hexInput instanceof HTMLInputElement) hexInput.select();
    endHistoryGesture(control);
    scheduleSelectionColorControlsRefresh(control, { refreshWhileFocused: true });
  });
  hexInput?.addEventListener("blur", () => {
    commitHexInput();
    endHistoryGesture(control);
    finishDirectSelectionColorEdit();
    releaseTextColorControlRange(control);
    scheduleSelectionColorControlsRefresh(control);
  });

  opacityInput?.addEventListener("focus", () => {
    captureTextColorControlRange(control);
    captureDirectSelectionColorRange();
    beginHistoryGesture(control);
    if (opacityInput instanceof HTMLInputElement) opacityInput.select();
  });
  opacityInput?.addEventListener("input", () => {
    if (!(opacityInput instanceof HTMLInputElement) || opacityInput.value.trim() === "") return;
    const state = getCustomColorState(control);
    if (!state || !Number.isFinite(Number(opacityInput.value))) return;
    beginDirectSelectionColorEdit(state, state.color, opacityInput.value);
    applyCustomColorValue(control, state.color, opacityInput.value);
  });
  opacityInput?.addEventListener("keydown", (event) => {
    if (!(opacityInput instanceof HTMLInputElement) || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const state = getCustomColorState(control);
    if (!state) return;
    const direction = (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1);
    beginDirectSelectionColorEdit(state, state.color, state.opacity + direction);
    applyCustomColorValue(control, state.color, state.opacity + direction);
  });
  opacityInput?.addEventListener("blur", () => {
    const state = getCustomColorState(control);
    if (state && state.picker instanceof HTMLInputElement) {
      syncCustomColorControl(state.picker, state.color, state.opacity);
    }
    endHistoryGesture(control);
    finishDirectSelectionColorEdit();
    releaseTextColorControlRange(control);
    scheduleSelectionColorControlsRefresh(control);
  });
  bindNumberSuffixScrubber(
    opacitySuffix,
    opacityInput,
    control,
    () => control,
  );

  const captureTextRangeBeforePointerFocus = () => {
    captureTextColorControlRange(control);
    captureDirectSelectionColorRange();
  };
  hexInput?.addEventListener("pointerdown", captureTextRangeBeforePointerFocus);
  opacityInput?.addEventListener("pointerdown", captureTextRangeBeforePointerFocus);
  opacitySuffix?.addEventListener("pointerdown", captureTextRangeBeforePointerFocus, true);
  const releaseScrubbedTextRange = () => releaseTextColorControlRange(control);
  opacitySuffix?.addEventListener("pointerup", releaseScrubbedTextRange);
  opacitySuffix?.addEventListener("pointercancel", releaseScrubbedTextRange);
  opacitySuffix?.addEventListener("lostpointercapture", releaseScrubbedTextRange);
  control.addEventListener("focusout", () => {
    requestAnimationFrame(() => {
      if (selectionColorSection?.contains(document.activeElement)) return;
      if (activeColorControl === control && !colorPickerPopup.hidden) return;
      scheduleSelectionColorControlsRefresh(control);
    });
  });

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
    const mixedSelectionPaint = getMixedSelectionPaintState(control.dataset.colorControl);
    const firstPaint = mixedSelectionPaint?.firstPaint ?? null;
    const nextColor = normalizeHexColor(firstPaint?.color)
      || (mixedSelectionPaint?.allEmpty ? fallbackColors[control.dataset.colorControl] : null)
      || normalizeHexColor(control.dataset.lastColor)
      || fallbackColors[control.dataset.colorControl]
      || "#000000";
    const nextOpacity = firstPaint?.color
      ? normalizeColorOpacity(firstPaint.opacity)
      : control.dataset.colorControl === "text" && !normalizeHexColor(state.color) ? 100 : state.opacity;
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
}

let selectionColorRefreshFrame = null;
let selectionColorRefreshWhileFocused = false;

function scheduleSelectionColorControlsRefresh(control, { refreshWhileFocused = false } = {}) {
  if (!(control instanceof HTMLElement)
    || control.dataset.colorControl !== "selection") return;
  selectionColorRefreshWhileFocused ||= refreshWhileFocused;
  if (selectionColorRefreshFrame !== null) return;
  selectionColorRefreshFrame = requestAnimationFrame(() => {
    selectionColorRefreshFrame = null;
    const shouldRefreshWhileFocused = selectionColorRefreshWhileFocused;
    selectionColorRefreshWhileFocused = false;
    const focusIsInsideSelectionColors = selectionColorSection?.contains(document.activeElement);
    const selectionColorPickerIsOpen = activeColorControl?.dataset.colorControl === "selection"
      && !colorPickerPopup.hidden;
    if (!shouldRefreshWhileFocused && (focusIsInsideSelectionColors || selectionColorPickerIsOpen)) return;
    updateInspector();
  });
}

colorControls.forEach(bindCustomColorControl);

if (colorPicker instanceof HTMLInputElement) {
  syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
}

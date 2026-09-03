/* Color picker popup, pointer gestures, positioning, and input wiring. */

function colorPickerKnobMarkup() {
  return '<span class="color-picker-knob" aria-hidden="true"><span class="color-picker-knob-middle"><span class="color-picker-knob-color"></span></span></span>';
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
    <div class="section-wrapper" data-picker-sliders>
      <div class="color-picker-slider color-picker-hue" data-picker-hue role="slider" aria-label="Hue">${colorPickerKnobMarkup()}</div>
      <div class="color-picker-slider color-picker-opacity" data-picker-opacity role="slider" aria-label="Opacity">${colorPickerKnobMarkup()}</div>
    </div>
    <div class="color-picker-fields">
      <div class="custom-color-value"><input class="custom-color-hex" type="text" inputmode="text" maxlength="6" aria-label="Hex color value" autocomplete="off" autocapitalize="characters" spellcheck="false" data-picker-hex></div>
      <div class="divider-vertical divider-vertical--subtle-02" aria-hidden="true"></div>
      <div class="custom-color-opacity"><input type="text" inputmode="decimal" maxlength="3" aria-label="Color opacity" data-picker-opacity-input><span class="text-input__suffix" role="button" aria-label="Adjust color opacity" data-number-suffix data-suffix-min="0" data-suffix-max="100"><span class="text-input__suffix-value" aria-hidden="true">%</span></span></div>
    </div>`;
  return colorPicker;
}

const colorPickerPopup = createColorPicker();
document.body.append(colorPickerPopup);

const colorPickerSv = colorPickerPopup.querySelector("[data-picker-sv]");
const colorPickerSliders = colorPickerPopup.querySelector("[data-picker-sliders]");
const colorPickerHue = colorPickerPopup.querySelector("[data-picker-hue]");
const colorPickerOpacity = colorPickerPopup.querySelector("[data-picker-opacity]");
const colorPickerFields = colorPickerPopup.querySelector(".color-picker-fields");
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
  if (hueKnob instanceof HTMLElement && colorPickerHue instanceof HTMLElement) {
    hueKnob.style.left = `${8 + (pickerHue / 360) * (colorPickerHue.clientWidth - 16)}px`;
  }
  if (opacityKnob instanceof HTMLElement && colorPickerOpacity instanceof HTMLElement) {
    opacityKnob.style.left = `${8 + ((100 - pickerOpacity) / 100) * (colorPickerOpacity.clientWidth - 16)}px`;
  }
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
  return target instanceof Node && [colorPickerSv, colorPickerSliders, colorPickerFields].some((content) => content?.contains(target));
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

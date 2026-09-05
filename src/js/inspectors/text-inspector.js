/* Text inspector fonts, typography, alignment, synchronization, and control wiring. */

function getTextAlignmentValues(element) {
  const alignment = normalizeFrameAlignment(element.dataset.alignment || "top-left");
  const [vertical, horizontal] = alignment === "center" ? ["center", "center"] : alignment.split("-");
  return {
    display: "block",
    alignContent: vertical === "center" ? "center" : vertical === "bottom" ? "end" : "start",
    textAlign: horizontal === "center" ? "center" : horizontal === "right" ? "right" : "left",
  };
}
function getFontRecord(family) {
  return fontCatalog.find((font) => font.family === family)
    ?? FALLBACK_FONT_CATALOG.find((font) => font.family === family);
}

function getFontFallback(category) {
  if (/serif/i.test(category) && !/sans/i.test(category)) return "serif";
  if (/mono/i.test(category)) return "monospace";
  if (/handwriting/i.test(category)) return "cursive";
  return "sans-serif";
}

function loadGoogleFont(family, weight) {
  const key = `${family}:${weight}`;
  if (loadedGoogleFonts.has(key)) return;

  const link = document.createElement("link");
  const encodedFamily = encodeURIComponent(family).replace(/%20/g, "+");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${weight}&display=swap`;
  link.dataset.googleFont = key;
  document.head.append(link);
  loadedGoogleFonts.add(key);
}

function replaceDropdownOptions(input, options, selectedValue) {
  if (!(input instanceof HTMLInputElement)) return;
  const menu = input.closest("[data-dropdown]")?.querySelector("[data-dropdown-menu]");
  if (!(menu instanceof HTMLElement)) return;
  menu.replaceChildren(...options.map(({ value, label }) => {
    const option = document.createElement("button");
    option.className = "dropdown__option";
    option.type = "button";
    option.setAttribute("role", "option");
    option.dataset.dropdownValue = String(value);
    option.textContent = label;
    return option;
  }));
  setDropdownValue(input, selectedValue);
}

function populateWeightOptions(family, selectedWeight = DEFAULT_FONT_WEIGHT) {
  if (!(weightSelect instanceof HTMLInputElement)) return;
  const font = getFontRecord(family);
  const weights = font?.weights?.length ? font.weights : [DEFAULT_FONT_WEIGHT];
  const resolvedWeight = weights.includes(Number(selectedWeight))
    ? Number(selectedWeight)
    : weights.includes(DEFAULT_FONT_WEIGHT)
      ? DEFAULT_FONT_WEIGHT
      : weights[0];

  replaceDropdownOptions(weightSelect, weights.map((weight) => ({
    value: weight,
    label: WEIGHT_LABELS[weight] ?? String(weight),
  })), resolvedWeight);
}

function populateFontOptions() {
  if (!(fontSelect instanceof HTMLInputElement)) return;
  const currentFamily = getDropdownValue(fontSelect) || DEFAULT_FONT_FAMILY;
  replaceDropdownOptions(fontSelect, fontCatalog.map((font) => ({
    value: font.family,
    label: font.family,
  })), currentFamily);
}

async function loadFontCatalog() {
  try {
    const response = await fetch("google-fonts.json");
    if (!response.ok) throw new Error("Unable to load the font catalog.");
    const catalog = await response.json();
    if (!Array.isArray(catalog) || catalog.length === 0) throw new Error("The font catalog is empty.");
    fontCatalog = catalog;
  } catch {
    fontCatalog = FALLBACK_FONT_CATALOG;
  }

  populateFontOptions();
  populateWeightOptions(getDropdownValue(fontSelect) || DEFAULT_FONT_FAMILY);
  if (getSelectedTextRecords().length > 0) syncInspectorToSelectedText();
}

function syncSelectedTextSizeInputs() {
  const record = getSelectedTextRecord();
  const records = getSelectedTextRecords();
  if (!record || records.length === 0) return;
  textLayerSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.textLayerSize;
    if (dimension !== "width" && dimension !== "height") return;
    const values = records.map((candidate) => {
      const { element } = candidate;
      const bounds = element.getBoundingClientRect();
      const instance = candidate.isVariantInstance ? getVariantInstance() : null;
      const override = instance
        ? getEffectiveVariantOverride(instance, `text:${candidate.id}`, dimension)
        : null;
      const overrideValue = override ? String(override.value ?? "") : "";
      const mode = overrideValue
        ? overrideValue === "100%" ? "fill" : overrideValue === "auto" ? "hug" : "fixed"
        : getLayerDimensionMode(element, dimension, "hug");
      const fixedValue = Number.parseFloat(overrideValue);
      return {
        mode,
        value: mode === "fixed"
          ? String(Number.isFinite(fixedValue)
            ? fixedValue
            : element.dataset[dimension] || Math.round(bounds[dimension]))
          : String(Math.round(bounds[dimension])),
      };
    });
    const value = values[0].value;
    const mode = values[0].mode;
    const valueIsMixed = values.some((candidate) => candidate.value !== value);
    const modeIsMixed = values.some((candidate) => candidate.mode !== mode);
    input.placeholder = valueIsMixed ? "Mixed" : "";
    input.value = valueIsMixed ? "" : value;
    const wrapper = input.closest("[data-size-combobox]");
    if (!(wrapper instanceof HTMLElement)) return;
    if (!modeIsMixed) {
      updateSizeOptionSelection(wrapper, mode);
      return;
    }
    wrapper.querySelectorAll("[data-size-option]").forEach((option) => {
      option.setAttribute("aria-selected", "false");
    });
    const toggleLabel = wrapper.querySelector("[data-size-toggle-label]");
    if (toggleLabel instanceof HTMLElement) toggleLabel.textContent = "";
    delete wrapper.dataset.sizeMode;
  });
}

function getTextInspectorValues(record) {
  const { element } = record;
  const styles = record.isVariantInstance ? getComputedStyle(element) : null;
  const renderedFamily = styles?.fontFamily.split(",")[0].replace(/^['"]|['"]$/g, "").trim();
  const renderedLineHeight = styles?.lineHeight;
  const renderedLetterSpacing = styles?.letterSpacing;
  const renderedVerticalAlignment = styles?.alignContent === "center"
    ? "center"
    : styles?.alignContent === "end" ? "bottom" : "top";
  const renderedHorizontalAlignment = styles?.textAlign === "center"
    ? "center"
    : styles?.textAlign === "right" ? "right" : "left";
  return {
    styles,
    family: record.isVariantInstance
      ? renderedFamily || DEFAULT_FONT_FAMILY
      : element.dataset.fontFamily || DEFAULT_FONT_FAMILY,
    weight: String(Number(record.isVariantInstance
      ? styles.fontWeight
      : element.dataset.fontWeight || DEFAULT_FONT_WEIGHT)),
    size: record.isVariantInstance
      ? String(Number.parseFloat(styles.fontSize) || 14)
      : element.dataset.fontSize || "14",
    lineHeight: record.isVariantInstance
      ? renderedLineHeight === "normal" ? "Auto" : String(Number.parseFloat(renderedLineHeight))
      : element.dataset.lineHeight || "Auto",
    letterSpacing: record.isVariantInstance
      ? renderedLetterSpacing === "normal" ? "0%" : renderedLetterSpacing
      : element.dataset.letterSpacing || "0%",
    alignment: record.isVariantInstance
      ? renderedVerticalAlignment === "center" && renderedHorizontalAlignment === "center"
        ? "center"
        : `${renderedVerticalAlignment}-${renderedHorizontalAlignment}`
      : normalizeFrameAlignment(element.dataset.alignment || "top-left"),
  };
}

function getSharedTextInspectorValue(values, property) {
  const value = values[0]?.[property] ?? "";
  return {
    value,
    mixed: values.some((candidate) => candidate[property] !== value),
  };
}

function syncTextInspectorInput(input, state, { dropdown = false } = {}) {
  if (!(input instanceof HTMLInputElement)) return;
  input.placeholder = state.mixed ? "Mixed" : "";
  if (!state.mixed) {
    if (dropdown) setDropdownValue(input, state.value);
    else input.value = state.value;
    return;
  }

  input.value = "";
  if (!dropdown) return;
  delete input.dataset.value;
  input.closest("[data-dropdown]")?.querySelectorAll(".dropdown__option").forEach((option) => {
    option.setAttribute("aria-selected", "false");
  });
}

function syncInspectorToSelectedText() {
  const record = getSelectedTextRecord();
  const records = getSelectedTextRecords();
  if (!record || records.length === 0) return;

  const { element } = record;
  const values = records.map(getTextInspectorValues);
  const primaryValues = getTextInspectorValues(record);
  const family = getSharedTextInspectorValue(values, "family");
  const weight = getSharedTextInspectorValue(values, "weight");
  const size = getSharedTextInspectorValue(values, "size");
  const lineHeight = getSharedTextInspectorValue(values, "lineHeight");
  const letterSpacing = getSharedTextInspectorValue(values, "letterSpacing");
  const alignment = getSharedTextInspectorValue(values, "alignment");
  const styles = primaryValues.styles;

  syncTextInspectorInput(fontSelect, family, { dropdown: true });
  populateWeightOptions(primaryValues.family, primaryValues.weight);
  syncTextInspectorInput(weightSelect, weight, { dropdown: true });
  syncTextInspectorInput(sizeSelect, size);
  syncTextSizeCombobox(size.mixed ? "" : size.value);
  syncTextInspectorInput(lineHeightInput, lineHeight);
  syncTextInspectorInput(letterSpacingInput, letterSpacing);
  if (textColorPicker instanceof HTMLInputElement) {
    const rangeSelection = records.length === 1 ? getActiveTextRangeSelection(record) : null;
    const rangeValue = rangeSelection ? getActiveTextRangeColorValues(record)[0] : null;
    const uniformRunColor = getUniformTextRunColor(record);
    const renderedColor = record.isVariantInstance ? styles.color : "";
    const rgbaAlpha = renderedColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
    const isTransparent = renderedColor === "transparent" || (rgbaAlpha && Number(rgbaAlpha[1]) === 0);
    const layerColor = record.isVariantInstance
      ? isTransparent ? "" : cssColorToHex(renderedColor) || "#000000"
      : Object.prototype.hasOwnProperty.call(element.dataset, "textColor") ? element.dataset.textColor : "#000000";
    const layerOpacity = record.isVariantInstance ? rgbaAlpha ? Number(rgbaAlpha[1]) * 100 : 100 : element.dataset.textColorOpacity || "100";
    syncCustomColorControl(
      textColorPicker,
      rangeValue?.color ?? uniformRunColor?.color ?? layerColor,
      rangeValue?.opacity ?? uniformRunColor?.opacity ?? layerOpacity,
    );
  }
  textAlignmentOptions.forEach((option) => {
    const isSelected = !alignment.mixed
      && option.getAttribute("data-text-alignment") === alignment.value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });
  syncSelectedTextSizeInputs();
}
function persistVariantTextStyle(record, property, value) {
  if (!record?.isVariantInstance) return;
  const instance = getVariantInstance();
  const target = `text:${record.id}`;
  if (!instance) return;
  upsertLocalVariantOverride(instance, target, property, value);
  syncVariantLayerStylePreviews(target, property, record.element);
}

function scheduleSelectedTextPreviewRender(records) {
  if (records.some((record) => !record.isVariantInstance) && variantModel.getInstances().length > 0) {
    scheduleVariantInstanceRender();
  }
}

fontSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  const records = getSelectedTextRecords();
  if (!record || records.length === 0 || !(fontSelect instanceof HTMLInputElement)) return;
  const family = getDropdownValue(fontSelect);
  const font = getFontRecord(family);
  const previousWeight = Number(record.element.dataset.fontWeight || DEFAULT_FONT_WEIGHT);
  populateWeightOptions(family, previousWeight);
  const weight = weightSelect instanceof HTMLInputElement
    ? Number(getDropdownValue(weightSelect))
    : DEFAULT_FONT_WEIGHT;
  if (records.some((candidate) => (
    candidate.element.dataset.fontFamily !== family
    || Number(candidate.element.dataset.fontWeight || DEFAULT_FONT_WEIGHT) !== weight
  ))) recordHistory();
  records.forEach((candidate) => {
    candidate.element.dataset.fontFamily = family;
    candidate.element.dataset.fontWeight = String(weight);
    candidate.element.style.fontFamily = `${JSON.stringify(family)}, ${getFontFallback(font?.category || "Sans Serif")}`;
    candidate.element.style.fontWeight = String(weight);
    persistVariantTextStyle(candidate, "fontFamily", candidate.element.style.fontFamily);
    persistVariantTextStyle(candidate, "fontWeight", String(weight));
  });
  loadGoogleFont(family, weight);
  scheduleSelectedTextPreviewRender(records);
  requestAnimationFrame(syncSelectedTextSizeInputs);
});

weightSelect?.addEventListener("change", () => {
  const record = getSelectedTextRecord();
  const records = getSelectedTextRecords();
  if (!record || records.length === 0 || !(weightSelect instanceof HTMLInputElement)) return;
  const weight = Number(getDropdownValue(weightSelect));
  if (records.some((candidate) => Number(candidate.element.dataset.fontWeight || DEFAULT_FONT_WEIGHT) !== weight)) {
    recordHistory();
  }
  records.forEach((candidate) => {
    candidate.element.dataset.fontWeight = String(weight);
    candidate.element.style.fontWeight = String(weight);
    persistVariantTextStyle(candidate, "fontWeight", String(weight));
    loadGoogleFont(candidate.element.dataset.fontFamily || DEFAULT_FONT_FAMILY, weight);
  });
  scheduleSelectedTextPreviewRender(records);
  requestAnimationFrame(syncSelectedTextSizeInputs);
});

function syncTextSizeCombobox(value) {
  textSizeOptions.forEach((option) => {
    option.setAttribute("aria-selected", String(option.getAttribute("data-text-size-option") === String(value)));
  });
}

function setTextSizeComboboxOpen(isOpen) {
  setDropdownOpen(textSizeCombobox, isOpen);
}

function applyTextSizeValue(rawValue = sizeSelect?.value, normalize = true) {
  const records = getSelectedTextRecords();
  if (records.length === 0 || !(sizeSelect instanceof HTMLInputElement)) return false;
  const value = String(rawValue || "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const numberValue = Math.max(0, Number(value));
  const normalizedValue = String(numberValue);
  if (records.some((record) => (record.element.dataset.fontSize || "14") !== normalizedValue)) {
    recordHistoryForGesture(sizeSelect);
  }
  records.forEach((record) => {
    record.element.dataset.fontSize = normalizedValue;
    record.element.style.fontSize = `${normalizedValue}px`;
    persistVariantTextStyle(record, "fontSize", `${normalizedValue}px`);
  });
  scheduleSelectedTextPreviewRender(records);
  if (normalize) sizeSelect.value = normalizedValue;
  syncTextSizeCombobox(normalizedValue);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

sizeSelect?.addEventListener("focus", () => {
  if (sizeSelect instanceof HTMLInputElement) sizeSelect.select();
  textSizeCombobox?.classList.add("is-selection-focused");
});

sizeSelect?.addEventListener("click", () => {
  if (sizeSelect instanceof HTMLInputElement) sizeSelect.select();
});

sizeSelect?.addEventListener("input", () => {
  if (sizeSelect instanceof HTMLInputElement) applyTextSizeValue(sizeSelect.value, false);
});

sizeSelect?.addEventListener("blur", (event) => {
  if (event.relatedTarget instanceof Node && textSizeCombobox?.contains(event.relatedTarget)) return;
  if (!applyTextSizeValue()) syncInspectorToSelectedText();
  setTextSizeComboboxOpen(false);
  textSizeCombobox?.classList.remove("is-selection-focused");
});

sizeSelect?.addEventListener("keydown", (event) => {
  if (!(sizeSelect instanceof HTMLInputElement)) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setTextSizeComboboxOpen(true);
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setTextSizeComboboxOpen(false);
    syncInspectorToSelectedText();
    return;
  }
  if (event.key !== "Enter") return;
  event.preventDefault();
  if (!applyTextSizeValue()) syncInspectorToSelectedText();
  setTextSizeComboboxOpen(false);
  sizeSelect.select();
});
if (sizeSelect instanceof HTMLElement) bindHistoryGesture(sizeSelect);
sizeSelect?.addEventListener("change", () => applyTextSizeValue());

function applyLineHeightValue() {
  const records = getSelectedTextRecords();
  if (records.length === 0 || !(lineHeightInput instanceof HTMLInputElement)) return false;
  const value = lineHeightInput.value.trim();
  if (/^(?:a|auto)$/i.test(value)) {
    if (records.some((record) => (record.element.dataset.lineHeight || "Auto") !== "Auto")) {
      recordHistoryForGesture(lineHeightInput);
    }
    lineHeightInput.value = "Auto";
    records.forEach((record) => {
      record.element.dataset.lineHeight = "Auto";
      record.element.style.lineHeight = "normal";
      persistVariantTextStyle(record, "lineHeight", "normal");
    });
    scheduleSelectedTextPreviewRender(records);
    requestAnimationFrame(syncSelectedTextSizeInputs);
    return true;
  }

  if (!/^\d+(?:\.\d+)?$/.test(value)) return false;
  const numberValue = Math.max(0, Number(value));
  if (records.some((record) => (record.element.dataset.lineHeight || "Auto") !== String(numberValue))) {
    recordHistoryForGesture(lineHeightInput);
  }
  lineHeightInput.value = String(numberValue);
  records.forEach((record) => {
    record.element.dataset.lineHeight = String(numberValue);
    record.element.style.lineHeight = `${numberValue}px`;
    persistVariantTextStyle(record, "lineHeight", `${numberValue}px`);
  });
  scheduleSelectedTextPreviewRender(records);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

lineHeightInput?.addEventListener("click", () => {
  if (lineHeightInput instanceof HTMLInputElement) lineHeightInput.select();
});

lineHeightInput?.addEventListener("input", applyLineHeightValue);

lineHeightInput?.addEventListener("blur", () => {
  if (!applyLineHeightValue()) syncInspectorToSelectedText();
});

lineHeightInput?.addEventListener("keydown", (event) => {
  if (!(lineHeightInput instanceof HTMLInputElement)) return;
  if (event.key === "Enter" && /^a$/i.test(lineHeightInput.value.trim())) {
    event.preventDefault();
    lineHeightInput.value = "Auto";
    applyLineHeightValue();
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const record = getSelectedTextRecord();
  if (!record) return;
  event.preventDefault();
  const direction = event.key === "ArrowUp" ? 1 : -1;
  const value = lineHeightInput.value.trim();
  let base = Number(value);
  if (/^auto$/i.test(value) || !Number.isFinite(base)) {
    const styles = getComputedStyle(record.element);
    base = Number.parseFloat(styles.lineHeight);
    if (!Number.isFinite(base)) base = Number.parseFloat(styles.fontSize) * 1.2;
    base = Math.round(base);
  }
  lineHeightInput.value = String(Math.max(0, base + direction));
  applyLineHeightValue();
});
if (lineHeightInput instanceof HTMLElement) bindHistoryGesture(lineHeightInput);

function applyLetterSpacingValue(normalizeDisplay = true) {
  const records = getSelectedTextRecords();
  if (records.length === 0 || !(letterSpacingInput instanceof HTMLInputElement)) return false;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)?$/i);
  if (!match) return false;
  const unit = match[2]?.toLowerCase() || "%";
  const value = `${Number(match[1])}${unit}`;
  if (records.some((record) => (record.element.dataset.letterSpacing || "0%") !== value)) {
    recordHistoryForGesture(letterSpacingInput);
  }
  if (normalizeDisplay) letterSpacingInput.value = value;
  records.forEach((record) => {
    record.element.dataset.letterSpacing = value;
    record.element.style.letterSpacing = unit === "%"
      ? `${Number(match[1]) / 100}em`
      : value;
    persistVariantTextStyle(record, "letterSpacing", record.element.style.letterSpacing);
  });
  scheduleSelectedTextPreviewRender(records);
  requestAnimationFrame(syncSelectedTextSizeInputs);
  return true;
}

letterSpacingInput?.addEventListener("click", () => {
  if (letterSpacingInput instanceof HTMLInputElement) letterSpacingInput.select();
});

letterSpacingInput?.addEventListener("input", () => applyLetterSpacingValue(false));

letterSpacingInput?.addEventListener("blur", () => {
  if (!applyLetterSpacingValue()) syncInspectorToSelectedText();
});

letterSpacingInput?.addEventListener("keydown", (event) => {
  if (!(letterSpacingInput instanceof HTMLInputElement)) return;
  if (event.key === "Enter") {
    event.preventDefault();
    if (!applyLetterSpacingValue()) syncInspectorToSelectedText();
    letterSpacingInput.select();
    return;
  }
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  const match = letterSpacingInput.value.trim().match(/^(-?\d+(?:\.\d+)?)(%|px)?$/i);
  if (!match) return;
  event.preventDefault();
  const direction = event.key === "ArrowUp" ? 1 : -1;
  letterSpacingInput.value = `${Number(match[1]) + direction}${match[2]?.toLowerCase() || "%"}`;
  applyLetterSpacingValue();
});
if (letterSpacingInput instanceof HTMLElement) bindHistoryGesture(letterSpacingInput);

textAlignmentOptions.forEach((option) => {
  option.addEventListener("click", () => {
    const records = getSelectedTextRecords();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-text-alignment") || "top-left");
    if (records.length === 0
      || records.every((record) => getTextInspectorValues(record).alignment === alignment)) return;
    recordHistory();
    records.forEach((record) => {
      record.element.dataset.alignment = alignment;
      applyTextAlignment(record.element);
      persistVariantTextStyle(record, "display", record.element.style.display);
      persistVariantTextStyle(record, "alignContent", record.element.style.alignContent);
      persistVariantTextStyle(record, "textAlign", record.element.style.textAlign);
    });
    scheduleSelectedTextPreviewRender(records);
    syncInspectorToSelectedText();
    requestAnimationFrame(syncResizeOverlay);
  });
});

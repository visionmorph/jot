/* Frame inspector values, selection state, synchronization, and shared mutations. */

function normalizeFrameHtmlTag(value) {
  const htmlTag = value.trim().toLowerCase();
  return ["a", "button", "input", "label"].includes(htmlTag) ? htmlTag : "div";
}

function normalizeFrameAriaRole(value) {
  const role = String(value ?? "").trim().toLowerCase();
  return ["tablist", "tabpanel"].includes(role) ? role : "";
}

function getFrameSemanticElement(element) {
  return normalizeFrameAriaRole(element?.getAttribute("role"))
    || normalizeFrameHtmlTag(element?.dataset.htmlTag || "div");
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
  const isVariantSelected = selectedVariantId !== null;
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
      const value = selectedVariantId !== null
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

function getSelectedFrameLayoutRecords() {
  const nested = getSelectedNestedInstanceLayer();
  if (["frame", "component-instance"].includes(nested?.target.type)) return [getSelectedFrameRecord()].filter(Boolean);
  const instances = getInstanceInspectorFrameRecords();
  if (instances.length) return instances;
  if (selectionState.kind !== "variants") return getSelectedFrameRecords();
  return getSelectedVariantIds().flatMap((variantId) => {
    const selectedTargets = getSelectedVariantLayerTargets(variantId);
    const targets = selectedTargets.length > 0
      ? selectedTargets.filter((target) => target.startsWith("frame:"))
      : ["component:0"];
    const preview = componentSet?.querySelector(
      `.variant-preview[data-variant-id="${CSS.escape(String(variantId))}"]`,
    );
    const root = preview?.querySelector(".canvas-root-stack");
    return targets.map((target) => {
      const record = target === "component:0"
        ? currentComponent?.frameRecord : getFrameRecord(Number(target.split(":")[1]));
      const element = findVariantTarget(root, target);
      return record && element instanceof HTMLElement
        ? { ...record, element, isVariant: true, variantId: variantId }
        : null;
    }).filter(Boolean);
  });
}

function getFrameAlignmentFromFlexValues(element, direction, alignItems, justifyContent) {
  const alignments = [
    "top-left", "top-center", "top-right",
    "center-left", "center", "center-right",
    "bottom-left", "bottom-center", "bottom-right",
  ];
  return alignments.find((alignment) => {
    const values = getFrameAlignmentValues({ dataset: { alignment, direction } });
    return values.alignItems === alignItems && values.justifyContent === justifyContent;
  }) ?? normalizeFrameAlignment(element.dataset.alignment || "top-left");
}

function getFrameInspectorValues(record) {
  const { element } = record;
  const bounds = element.getBoundingClientRect();
  const variant = record.isVariant
    ? getVariant(record.variantId ?? selectedVariantId)
    : null;
  const target = record.isComponent ? "component:0" : `frame:${record.id}`;
  const getValue = (property, fallback) => {
    const override = variant ? getEffectiveVariantOverride(variant, target, property) : null;
    return override ? String(override.value ?? "") : fallback;
  };
  const direction = getValue(
    "flexDirection",
    element.dataset.direction === "vertical" ? "column" : "row",
  ) === "column" ? "vertical" : "horizontal";
  const padding = Object.fromEntries(["left", "top", "right", "bottom"].map((side) => {
    const property = `padding${side[0].toUpperCase()}${side.slice(1)}`;
    const value = getValue(property, `${element.dataset[property] || "10"}px`);
    return [side, String(value).replace(/px$/i, "")];
  }));
  const backgroundValue = getValue("backgroundColor", element.dataset.frameColor || "");
  const backgroundAlpha = String(backgroundValue).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
  const outlineValue = getValue("outlineColor", element.dataset.outlineColor || "");
  const outlineAlpha = String(outlineValue).match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)$/i);
  const gapValue = getValue(
    "gap",
    element.dataset.gapMode === "auto" ? "auto" : `${element.dataset.gap || "10"}px`,
  );
  const fallbackAlignment = getFrameAlignmentValues({
    dataset: {
      alignment: element.dataset.alignment,
      direction,
    },
  });
  const alignItems = getValue("alignItems", element.style.alignItems || fallbackAlignment.alignItems);
  const justifyContent = getValue(
    "justifyContent",
    element.style.justifyContent || fallbackAlignment.justifyContent,
  );

  const values = {
    direction,
    alignment: getFrameAlignmentFromFlexValues(element, direction, alignItems, justifyContent),
    gap: String(gapValue).toLowerCase() === "auto"
      || (!record.isVariant && element.dataset.gapMode === "auto")
      ? "auto"
      : String(gapValue).replace(/px$/i, ""),
    radius: String(getValue("borderRadius", `${element.dataset.radius || "0"}px`)).replace(/px$/i, ""),
    paddingLeft: padding.left,
    paddingTop: padding.top,
    paddingRight: padding.right,
    paddingBottom: padding.bottom,
    paddingX: padding.left === padding.right ? padding.left : `${padding.left}, ${padding.right}`,
    paddingY: padding.top === padding.bottom ? padding.top : `${padding.top}, ${padding.bottom}`,
    fillColor: isTransparentColorValue(backgroundValue)
      ? ""
      : normalizeHexColor(backgroundValue) || cssColorToHex(backgroundValue) || "",
    fillOpacity: String(normalizeColorOpacity(
      backgroundAlpha ? Number(backgroundAlpha[1]) * 100 : element.dataset.frameColorOpacity || "100",
    )),
    outlineColor: normalizeHexColor(outlineValue) || cssColorToHex(outlineValue) || "",
    outlineOpacity: String(normalizeColorOpacity(
      outlineAlpha ? Number(outlineAlpha[1]) * 100 : element.dataset.outlineColorOpacity || "100",
    )),
    outlinePosition: getValue(
      "outlinePosition",
      ["inside", "outside", "center"].includes(element.dataset.outlinePosition)
        ? element.dataset.outlinePosition
        : "inside",
    ),
    outlineWeight: String(getValue("outlineWeight", element.dataset.outlineWeight || "1")),
    htmlTag: getFrameSemanticElement(element),
  };

  ["width", "height"].forEach((dimension) => {
    const override = getValue(dimension, "");
    const mode = record.isVariant && override
      ? override === "100%" ? "fill" : override === "auto" ? "hug" : "fixed"
      : getLayerDimensionMode(element, dimension);
    const overriddenNumber = Number.parseFloat(override);
    values[`${dimension}Mode`] = mode;
    values[dimension] = mode === "fixed"
      ? String(Number.isFinite(overriddenNumber)
        ? overriddenNumber
        : element.dataset[dimension] || Math.round(bounds[dimension]))
      : String(Math.round(bounds[dimension]));
  });
  return values;
}

function getSharedFrameInspectorValue(values, property) {
  const value = values[0]?.[property] ?? "";
  return {
    value,
    mixed: values.some((candidate) => candidate[property] !== value),
  };
}

function syncFrameInspectorInput(input, state, { dropdown = false } = {}) {
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

function syncFrameSizeMode(wrapper, state) {
  if (!(wrapper instanceof HTMLElement)) return;
  if (!state.mixed) {
    updateSizeOptionSelection(wrapper, state.value);
    return;
  }
  wrapper.querySelectorAll("[data-size-option]").forEach((option) => {
    option.setAttribute("aria-selected", "false");
  });
  const toggleLabel = wrapper.querySelector("[data-size-toggle-label]");
  if (toggleLabel instanceof HTMLElement) toggleLabel.textContent = "";
  delete wrapper.dataset.sizeMode;
}

function syncBulkInspectorToSelectedFrames(records) {
  const values = records.map(getFrameInspectorValues);
  const shared = (property) => getSharedFrameInspectorValue(values, property);
  if (frameInspectorHeading instanceof HTMLElement) frameInspectorHeading.textContent = "Frames";
  if (addVariantAction instanceof HTMLElement) addVariantAction.hidden = true;

  const direction = shared("direction");
  frameDirectionOptions.forEach((option) => {
    const isSelected = !direction.mixed
      && option.getAttribute("data-frame-direction") === direction.value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });

  const alignment = shared("alignment");
  if (frameAlignmentGrid instanceof HTMLElement) {
    frameAlignmentGrid.dataset.direction = direction.mixed ? "horizontal" : direction.value;
    frameAlignmentGrid.dataset.spaceBetween = String(!shared("gap").mixed && shared("gap").value === "auto");
  }
  frameAlignmentOptions.forEach((option) => {
    const isSelected = !alignment.mixed && !direction.mixed
      && normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left") === alignment.value;
    option.classList.toggle("is-selected", isSelected);
    option.setAttribute("aria-pressed", String(isSelected));
  });

  if (frameGapInput instanceof HTMLInputElement) {
    const gap = shared("gap");
    syncFrameInspectorInput(frameGapInput, gap, { dropdown: true });
  }
  if (frameRadiusInput instanceof HTMLInputElement) syncFrameInspectorInput(frameRadiusInput, shared("radius"));

  frameSizeInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const dimension = input.dataset.frameSize;
    if (dimension !== "width" && dimension !== "height") return;
    syncFrameInspectorInput(input, shared(dimension));
    syncFrameSizeMode(input.closest("[data-size-combobox]"), shared(`${dimension}Mode`));
  });
framePaddingInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    const side = input.dataset.framePadding;
    if (!side) return;
    syncFrameInspectorInput(input, shared(`padding${side[0].toUpperCase()}${side.slice(1)}`));
  });
  framePaddingAxisInputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement)) return;
    syncFrameInspectorInput(input, shared(input.dataset.framePaddingAxis === "y" ? "paddingY" : "paddingX"));
  });

  const paintRecords = getVisibleColorRecords(records);
  const selectedRecord = getSelectedFrameRecord();
  const paintRecord = selectedRecord && !isHiddenFromSelectionColors(selectedRecord.element)
    ? selectedRecord : paintRecords[0];
  const paintValues = paintRecord
    ? getFrameInspectorValues(paintRecord)
    : { fillColor: "", fillOpacity: 100, outlineColor: "", outlineOpacity: 100 };
  if (frameColorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(frameColorPicker, paintValues.fillColor, paintValues.fillOpacity);
  }
  if (frameOutlineColorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(frameOutlineColorPicker, paintValues.outlineColor, paintValues.outlineOpacity);
  }
  if (frameOutlinePositionSelect instanceof HTMLInputElement) {
    syncFrameInspectorInput(frameOutlinePositionSelect, shared("outlinePosition"), { dropdown: true });
  }
  if (frameOutlineWeightInput instanceof HTMLInputElement) {
    syncFrameInspectorInput(frameOutlineWeightInput, shared("outlineWeight"));
  }
  if (frameHtmlTagInput instanceof HTMLInputElement) {
    syncFrameInspectorInput(frameHtmlTagInput, shared("htmlTag"), { dropdown: true });
  }
}

function syncInspectorToSelectedFrame() {
  const record = getSelectedFrameRecord();
  const records = getSelectedFrameLayoutRecords();
  if (!record || records.length === 0) return;
  if (records.length > 1) {
    syncBulkInspectorToSelectedFrames(records);
    return;
  }
  const { element } = record;
  const bounds = element.getBoundingClientRect();
  const isVariantSelected = selectedVariantId !== null && !record.isInstance;
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
    const color = isTransparentColorValue(colorValue)
      ? ""
      : normalizeHexColor(colorValue) || cssColorToHex(colorValue) || "";
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
    setDropdownValue(frameHtmlTagInput, getFrameSemanticElement(element));
  }
}

function getFrameRecordTarget(record) {
  if (record.type === "component-instance") return `component-instance:${record.id}`;
  return record.isComponent ? "component:0" : `frame:${record.id}`;
}

function getFrameRecordVariantValue(record, property, fallback = "") {
  if (!record?.isVariant) return fallback;
  const variant = getVariant(record.variantId ?? selectedVariantId);
  const override = variant
    ? getEffectiveVariantOverride(variant, getFrameRecordTarget(record), property)
    : null;
  return override ? String(override.value ?? "") : fallback;
}

function setVariantFrameRecordsProperty(records, property, value) {
  const edits = records.map((record) => ({
    variant: getVariant(record.variantId ?? selectedVariantId),
    target: getFrameRecordTarget(record),
  })).filter(({ variant }) => variant);
  if (edits.length === 0) return false;
  const editedVariantIds = new Set(edits.map(({ variant }) => variant.id));
  edits.forEach(({ variant, target }) => {
    upsertVariantOverrideForEditedVariants(
      variant,
      target,
      property,
      String(value ?? ""),
      editedVariantIds,
    );
  });
  const targets = [...new Set(edits.map(({ target }) => target))];
  targets.forEach((target) => syncVariantLayerStylePreviews(target, property));
  return true;
}

function scheduleSelectedFramePreviewRender(records) {
  if (records.some((record) => !record.isVariant) && variantModel.getVariants().length > 0) {
    scheduleVariantRender();
  }
}

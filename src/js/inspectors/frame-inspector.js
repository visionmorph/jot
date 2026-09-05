/* Frame inspector layout, alignment, padding, paint, gap, HTML tag, and control wiring. */

function normalizeFrameHtmlTag(value) {
  return value.trim().toLowerCase() === "button" ? "button" : "div";
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

function getSelectedFrameLayoutRecords() {
  if (selectionState.kind !== "variants") return getSelectedFrameRecords();
  const selectedTargets = getSelectedVariantLayerTargets();
  const targets = selectedTargets.length > 0
    ? selectedTargets.filter((target) => target.startsWith("frame:"))
    : ["component:0"];
  return getSelectedVariantInstanceIds().flatMap((instanceId) => {
    const preview = componentSet?.querySelector(
      `.variant-preview[data-variant-instance-id="${CSS.escape(String(instanceId))}"]`,
    );
    const root = preview?.querySelector(".canvas-root-stack");
    return targets.map((target) => {
      const record = target === "component:0"
        ? currentComponent?.frameRecord : getFrameRecord(Number(target.split(":")[1]));
      const element = findVariantTarget(root, target);
      return record && element instanceof HTMLElement
        ? { ...record, element, isVariantInstance: true, variantInstanceId: instanceId }
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
  const instance = record.isVariantInstance
    ? getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId)
    : null;
  const target = record.isComponent ? "component:0" : `frame:${record.id}`;
  const getValue = (property, fallback) => {
    const override = instance ? getEffectiveVariantOverride(instance, target, property) : null;
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
      || (!record.isVariantInstance && element.dataset.gapMode === "auto")
      ? "auto"
      : String(gapValue).replace(/px$/i, ""),
    radius: String(getValue("borderRadius", `${element.dataset.radius || "0"}px`)).replace(/px$/i, ""),
    paddingLeft: padding.left,
    paddingTop: padding.top,
    paddingRight: padding.right,
    paddingBottom: padding.bottom,
    paddingX: padding.left === padding.right ? padding.left : `${padding.left}, ${padding.right}`,
    paddingY: padding.top === padding.bottom ? padding.top : `${padding.top}, ${padding.bottom}`,
    fillColor: normalizeHexColor(backgroundValue) || cssColorToHex(backgroundValue) || "",
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
    htmlTag: normalizeFrameHtmlTag(element.dataset.htmlTag || "div"),
  };

  ["width", "height"].forEach((dimension) => {
    const override = getValue(dimension, "");
    const mode = record.isVariantInstance && override
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
  const primaryValues = getFrameInspectorValues(getSelectedFrameRecord() ?? records[0]);
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

  if (frameColorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(frameColorPicker, primaryValues.fillColor, primaryValues.fillOpacity);
  }
  if (frameOutlineColorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(frameOutlineColorPicker, primaryValues.outlineColor, primaryValues.outlineOpacity);
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

function getFrameRecordTarget(record) {
  return record.isComponent ? "component:0" : `frame:${record.id}`;
}

function getFrameRecordVariantValue(record, property, fallback = "") {
  if (!record?.isVariantInstance) return fallback;
  const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
  const override = instance
    ? getEffectiveVariantOverride(instance, getFrameRecordTarget(record), property)
    : null;
  return override ? String(override.value ?? "") : fallback;
}

function setVariantFrameRecordsProperty(records, property, value) {
  const edits = records.map((record) => ({
    instance: getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId),
    target: getFrameRecordTarget(record),
  })).filter(({ instance }) => instance);
  if (edits.length === 0) return false;
  const editedInstanceIds = new Set(edits.map(({ instance }) => instance.id));
  edits.forEach(({ instance, target }) => {
    upsertVariantOverrideForEditedInstances(
      instance,
      target,
      property,
      String(value ?? ""),
      editedInstanceIds,
    );
  });
  const targets = [...new Set(edits.map(({ target }) => target))];
  targets.forEach((target) => syncVariantLayerStylePreviews(target, property));
  return true;
}

function scheduleSelectedFramePreviewRender(records) {
  if (records.some((record) => !record.isVariantInstance) && variantModel.getInstances().length > 0) {
    scheduleVariantInstanceRender();
  }
}

framePaddingInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("input", () => {
    const records = getSelectedFrameLayoutRecords();
    const side = input.dataset.framePadding;
    const value = Number(input.value);
    if (records.length === 0 || !side || !Number.isFinite(value) || value < 0) return;
    const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
    if (selectedVariantInstanceId !== null) {
      const hasChange = records.some((record) => getFrameRecordVariantValue(
        record,
        propertyName,
        `${record.element.dataset[propertyName] || "10"}px`,
      ) !== `${value}px`);
      if (!hasChange) return;
      recordHistoryForGesture(input);
      setVariantFrameRecordsProperty(records, propertyName, `${value}px`);
      syncInspectorToSelectedFrame();
      return;
    }
    if (records.some((record) => Number(record.element.dataset[propertyName] || "10") !== value)) {
      recordHistoryForGesture(input);
    }
    records.forEach((record) => {
      record.element.dataset[propertyName] = String(value);
      record.element.style[propertyName] = `${value}px`;
    });
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
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
    const records = getSelectedFrameLayoutRecords();
    const axis = input.dataset.framePaddingAxis;
    const values = parseFramePaddingAxisValue(input.value);
    if (records.length === 0 || (axis !== "x" && axis !== "y") || !values) return;
    const sides = axis === "x" ? ["left", "right"] : ["top", "bottom"];
    if (selectedVariantInstanceId !== null) {
      const hasVariantChange = records.some((record) => sides.some((side, index) => {
        const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
        return getFrameRecordVariantValue(
          record,
          propertyName,
          `${record.element.dataset[propertyName] || "10"}px`,
        ) !== `${values[index]}px`;
      }));
      if (!hasVariantChange) return;
      recordHistoryForGesture(input);
      sides.forEach((side, index) => setVariantFrameRecordsProperty(
        records,
        `padding${side[0].toUpperCase()}${side.slice(1)}`,
        `${values[index]}px`,
      ));
      syncInspectorToSelectedFrame();
      return;
    }
    const hasChange = records.some((record) => sides.some((side, index) => {
      const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      return Number(record.element.dataset[propertyName] || "10") !== values[index];
    }));
    if (hasChange) recordHistoryForGesture(input);
    records.forEach((record) => {
      sides.forEach((side, index) => {
        const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
        record.element.dataset[propertyName] = String(values[index]);
        record.element.style[propertyName] = `${values[index]}px`;
      });
    });
    sides.forEach((side, index) => {
      const sideInput = framePaddingInputs.find((candidate) => candidate.dataset.framePadding === side);
      if (sideInput instanceof HTMLInputElement) sideInput.value = String(values[index]);
    });
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
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
  const records = getSelectedFrameLayoutRecords();
  if (records.length === 0 || !(frameRadiusInput instanceof HTMLInputElement)) return;
  const value = Number(frameRadiusInput.value);
  if (!Number.isFinite(value) || value < 0) return;
  if (selectedVariantInstanceId !== null) {
    const hasChange = records.some((record) => getFrameRecordVariantValue(
      record,
      "borderRadius",
      `${record.element.dataset.radius || "0"}px`,
    ) !== `${value}px`);
    if (!hasChange) return;
    recordHistoryForGesture(frameRadiusInput);
    setVariantFrameRecordsProperty(records, "borderRadius", `${value}px`);
    return;
  }
  if (records.some((record) => Number(record.element.dataset.radius || "0") !== value)) {
    recordHistoryForGesture(frameRadiusInput);
  }
  records.forEach((record) => {
    record.element.dataset.radius = String(value);
    record.element.style.borderRadius = `${value}px`;
  });
  scheduleSelectedFramePreviewRender(records);
});

frameRadiusInput?.addEventListener("blur", syncInspectorToSelectedFrame);
if (frameRadiusInput instanceof HTMLElement) bindHistoryGesture(frameRadiusInput);

frameDirectionOptions.forEach((option) => {
  option.addEventListener("click", () => {
    option.focus();
    const records = getSelectedFrameLayoutRecords();
    const direction = option.getAttribute("data-frame-direction") === "vertical" ? "vertical" : "horizontal";
    if (selectedVariantInstanceId !== null) {
      const value = direction === "vertical" ? "column" : "row";
      const hasChange = records.some((record) => getFrameRecordVariantValue(
        record,
        "flexDirection",
        record.element.dataset.direction === "vertical" ? "column" : "row",
      ) !== value);
      if (hasChange) {
        recordHistory();
        setVariantFrameRecordsProperty(records, "flexDirection", value);
      }
      syncInspectorToSelectedFrame();
      return;
    }
    if (records.length === 0 || records.every((record) => (
      record.element.dataset.direction || "horizontal"
    ) === direction)) return;
    recordHistory();
    records.forEach((record) => {
      record.element.dataset.direction = direction;
      record.element.style.flexDirection = direction === "vertical" ? "column" : "row";
      applyFrameAlignment(record.element);
    });
    applyAllLayerSizing();
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
    renderTree();
  });
});

frameAlignmentOptions.forEach((option) => {
  let variantWasSpaceBetweenAtFirstClick = false;
  option.addEventListener("click", (event) => {
    option.focus();
    const records = getSelectedFrameLayoutRecords();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    if (selectedVariantInstanceId !== null) {
      const edits = records.map((record) => {
        const direction = getFrameRecordVariantValue(
          record,
          "flexDirection",
          record.element.dataset.direction === "vertical" ? "column" : "row",
        ) === "column" ? "vertical" : "horizontal";
        const values = getFrameAlignmentValues({ dataset: { alignment, direction } });
        return { record, values };
      });
      const allSpaceBetween = edits.every(({ record }) => getFrameRecordVariantValue(
        record,
        "justifyContent",
        record.element.style.justifyContent || "flex-start",
      ) === "space-between");
      if (event.detail === 1) variantWasSpaceBetweenAtFirstClick = allSpaceBetween;
      if (event.detail === 2 && variantWasSpaceBetweenAtFirstClick) return;
      const hasChange = edits.some(({ record, values }) => (
        getFrameRecordVariantValue(record, "alignItems", record.element.style.alignItems || "flex-start") !== values.alignItems
        || getFrameRecordVariantValue(record, "justifyContent", record.element.style.justifyContent || "flex-start") !== values.justifyContent
      ));
      if (!hasChange) return;
      recordHistory();
      const editedInstanceIds = new Set(edits.map(({ record }) => (
        record.variantInstanceId ?? selectedVariantInstanceId
      )));
      edits.forEach(({ record, values }) => {
        const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
        if (!instance) return;
        const target = getFrameRecordTarget(record);
        upsertVariantOverrideForEditedInstances(
          instance, target, "alignItems", values.alignItems, editedInstanceIds,
        );
        upsertVariantOverrideForEditedInstances(
          instance, target, "justifyContent", values.justifyContent, editedInstanceIds,
        );
      });
      [...new Set(edits.map(({ record }) => getFrameRecordTarget(record)))].forEach((target) => {
        syncVariantLayerStylePreviews(target, "alignItems");
        syncVariantLayerStylePreviews(target, "justifyContent");
      });
      syncInspectorToSelectedFrame();
      return;
    }
    if (records.length === 0 || records.every((record) => isFrameAlignmentOptionSelected(record.element, alignment))) return;
    recordHistory();
    records.forEach((record) => {
      record.element.dataset.alignment = alignment;
      applyFrameAlignment(record.element);
    });
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
    renderTree();
  });
  option.addEventListener("dblclick", (event) => {
    const records = getSelectedFrameLayoutRecords();
    const alignment = normalizeFrameAlignment(option.getAttribute("data-frame-alignment") || "top-left");
    event.preventDefault();
    if (records.length === 0) return;
    if (selectedVariantInstanceId !== null) {
      const edits = records.map((record) => {
        const direction = getFrameRecordVariantValue(
          record,
          "flexDirection",
          record.element.dataset.direction === "vertical" ? "column" : "row",
        ) === "column" ? "vertical" : "horizontal";
        return { record, values: getFrameAlignmentValues({ dataset: { alignment, direction } }) };
      });
      const targets = [...new Set(edits.map(({ record }) => getFrameRecordTarget(record)))];
      const editedInstanceIds = new Set(edits.map(({ record }) => (
        record.variantInstanceId ?? selectedVariantInstanceId
      )));
      if (variantWasSpaceBetweenAtFirstClick) {
        recordHistory();
        edits.forEach(({ record, values }) => {
          const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
          if (instance) upsertVariantOverrideForEditedInstances(
            instance,
            getFrameRecordTarget(record),
            "justifyContent",
            values.justifyContent,
            editedInstanceIds,
          );
        });
      } else if (edits.some(({ record }) => getFrameRecordVariantValue(
        record,
        "justifyContent",
        record.element.style.justifyContent || "flex-start",
      ) !== "space-between")) {
        recordHistory();
        edits.forEach(({ record }) => {
          const instance = getVariantInstance(record.variantInstanceId ?? selectedVariantInstanceId);
          if (instance) upsertVariantOverrideForEditedInstances(
            instance,
            getFrameRecordTarget(record),
            "justifyContent",
            "space-between",
            editedInstanceIds,
          );
        });
      }
      targets.forEach((target) => syncVariantLayerStylePreviews(target, "justifyContent"));
      variantWasSpaceBetweenAtFirstClick = false;
      syncInspectorToSelectedFrame();
      return;
    }
    recordHistory();
    const enableSpaceBetween = records.some((record) => record.element.dataset.gapMode !== "auto");
    records.forEach((record) => {
      record.element.dataset.gapMode = enableSpaceBetween ? "auto" : "fixed";
      record.element.style.gap = enableSpaceBetween ? "0px" : `${record.element.dataset.gap || "10"}px`;
      applyFrameAlignment(record.element);
    });
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
  });
});

frameOutlinePositionSelect?.addEventListener("change", () => {
  const records = getSelectedFrameLayoutRecords();
  if (records.length === 0 || !(frameOutlinePositionSelect instanceof HTMLInputElement)) return;
  const selectedPosition = getDropdownValue(frameOutlinePositionSelect);
  const position = ["outside", "center"].includes(selectedPosition)
    ? selectedPosition
    : "inside";
  if (selectedVariantInstanceId !== null) {
    const hasChange = records.some((record) => getFrameRecordVariantValue(
      record,
      "outlinePosition",
      record.element.dataset.outlinePosition || "inside",
    ) !== position);
    if (!hasChange) return;
    recordHistory();
    setVariantFrameRecordsProperty(records, "outlinePosition", position);
    return;
  }
  if (records.every((record) => (record.element.dataset.outlinePosition || "inside") === position)) return;
  recordHistory();
  records.forEach((record) => {
    record.element.dataset.outlinePosition = position;
    applyFrameOutline(record.element);
  });
  scheduleSelectedFramePreviewRender(records);
});

frameOutlineWeightInput?.addEventListener("input", () => {
  const records = getSelectedFrameLayoutRecords();
  if (records.length === 0 || !(frameOutlineWeightInput instanceof HTMLInputElement)) return;
  const weight = Number(frameOutlineWeightInput.value);
  if (!Number.isFinite(weight) || weight < 0) return;
  if (selectedVariantInstanceId !== null) {
    const hasChange = records.some((record) => Number(getFrameRecordVariantValue(
      record,
      "outlineWeight",
      record.element.dataset.outlineWeight || "1",
    )) !== weight);
    if (!hasChange) return;
    recordHistoryForGesture(frameOutlineWeightInput);
    setVariantFrameRecordsProperty(records, "outlineWeight", String(weight));
    return;
  }
  if (records.some((record) => Number(record.element.dataset.outlineWeight || "1") !== weight)) {
    recordHistoryForGesture(frameOutlineWeightInput);
  }
  records.forEach((record) => {
    record.element.dataset.outlineWeight = String(weight);
    applyFrameOutline(record.element);
  });
  scheduleSelectedFramePreviewRender(records);
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
  const records = getSelectedFrameLayoutRecords();
  if (records.length === 0 || !(frameGapInput instanceof HTMLInputElement)) return false;
  const value = frameGapInput.value.trim();

  if (selectedVariantInstanceId !== null) {
    if (/^auto$/i.test(value)) {
      const hasChange = records.some((record) => getFrameRecordVariantValue(
        record,
        "gap",
        record.element.dataset.gapMode === "auto" ? "0px" : `${record.element.dataset.gap || "10"}px`,
      ) !== "0px");
      if (hasChange) {
        recordHistoryForGesture(frameGapInput);
        setVariantFrameRecordsProperty(records, "gap", "0px");
      }
      return true;
    }
    const variantMatch = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
    if (!variantMatch) return false;
    const gap = `${Math.max(0, Number(variantMatch[1]))}px`;
    const hasChange = records.some((record) => getFrameRecordVariantValue(
      record,
      "gap",
      record.element.dataset.gapMode === "auto" ? "0px" : `${record.element.dataset.gap || "10"}px`,
    ) !== gap);
    if (hasChange) {
      recordHistoryForGesture(frameGapInput);
      setVariantFrameRecordsProperty(records, "gap", gap);
    }
    const normalizedGap = String(Math.max(0, Number(variantMatch[1])));
    syncFrameGapOptions(normalizedGap);
    if (normalize) setDropdownValue(frameGapInput, normalizedGap);
    return true;
  }

  if (/^auto$/i.test(value)) {
    if (records.some((record) => record.element.dataset.gapMode !== "auto")) {
      recordHistoryForGesture(frameGapInput);
    }
    records.forEach((record) => {
      record.element.dataset.gapMode = "auto";
      record.element.style.gap = "0px";
      applyFrameAlignment(record.element);
    });
    scheduleSelectedFramePreviewRender(records);
    syncInspectorToSelectedFrame();
    if (normalize) frameGapInput.value = "Auto";
    return true;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  if (!match) return false;
  const gap = Math.max(0, Number(match[1]));
  if (records.some((record) => (
    record.element.dataset.gapMode !== "fixed"
    || Number(record.element.dataset.gap || "10") !== gap
  ))) {
    recordHistoryForGesture(frameGapInput);
  }
  records.forEach((record) => {
    record.element.dataset.gapMode = "fixed";
    record.element.dataset.gap = String(gap);
    record.element.style.gap = `${gap}px`;
    applyFrameAlignment(record.element);
  });
  syncFrameGapOptions(gap);
  scheduleSelectedFramePreviewRender(records);
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
  const records = getSelectedFrameRecords();
  if (records.length === 0 || !(frameHtmlTagInput instanceof HTMLInputElement)) return;
  const htmlTag = normalizeFrameHtmlTag(getDropdownValue(frameHtmlTagInput));
  const sourceRecords = records.map((record) => record.isVariantInstance
    ? record.isComponent ? currentComponent?.frameRecord : getFrameRecord(record.id)
    : record).filter(Boolean);
  if (sourceRecords.length === 0) return;
  if (sourceRecords.some((record) => (record.element.dataset.htmlTag || "div") !== htmlTag)) recordHistory();
  sourceRecords.forEach((record) => {
    record.element.dataset.htmlTag = htmlTag;
  });
  if (records.some((record) => record.isVariantInstance)) renderVariantInstances();
  else scheduleSelectedFramePreviewRender(records);
  renderComponentProps();
});

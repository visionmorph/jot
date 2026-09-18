/* Frame inspector control behavior and event wiring. */

framePaddingInputs.forEach((input) => {
  if (!(input instanceof HTMLInputElement)) return;
  input.addEventListener("input", () => {
    const records = getSelectedFrameLayoutRecords();
    const side = input.dataset.framePadding;
    const value = Number(input.value);
    if (records.length === 0 || !side || !Number.isFinite(value) || value < 0) return;
    const propertyName = `padding${side[0].toUpperCase()}${side.slice(1)}`;
    if (selectedVariantId !== null) {
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
    if (selectedVariantId !== null) {
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
  if (selectedVariantId !== null) {
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
    if (selectedVariantId !== null) {
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
    if (selectedVariantId !== null) {
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
      const editedVariantIds = new Set(edits.map(({ record }) => (
        record.variantId ?? selectedVariantId
      )));
      edits.forEach(({ record, values }) => {
        const variant = getVariant(record.variantId ?? selectedVariantId);
        if (!variant) return;
        const target = getFrameRecordTarget(record);
        upsertVariantOverrideForEditedVariants(
          variant, target, "alignItems", values.alignItems, editedVariantIds,
        );
        upsertVariantOverrideForEditedVariants(
          variant, target, "justifyContent", values.justifyContent, editedVariantIds,
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
    if (selectedVariantId !== null) {
      const edits = records.map((record) => {
        const direction = getFrameRecordVariantValue(
          record,
          "flexDirection",
          record.element.dataset.direction === "vertical" ? "column" : "row",
        ) === "column" ? "vertical" : "horizontal";
        return { record, values: getFrameAlignmentValues({ dataset: { alignment, direction } }) };
      });
      const targets = [...new Set(edits.map(({ record }) => getFrameRecordTarget(record)))];
      const editedVariantIds = new Set(edits.map(({ record }) => (
        record.variantId ?? selectedVariantId
      )));
      if (variantWasSpaceBetweenAtFirstClick) {
        recordHistory();
        edits.forEach(({ record, values }) => {
          const variant = getVariant(record.variantId ?? selectedVariantId);
          if (variant) upsertVariantOverrideForEditedVariants(
            variant,
            getFrameRecordTarget(record),
            "justifyContent",
            values.justifyContent,
            editedVariantIds,
          );
        });
      } else if (edits.some(({ record }) => getFrameRecordVariantValue(
        record,
        "justifyContent",
        record.element.style.justifyContent || "flex-start",
      ) !== "space-between")) {
        recordHistory();
        edits.forEach(({ record }) => {
          const variant = getVariant(record.variantId ?? selectedVariantId);
          if (variant) upsertVariantOverrideForEditedVariants(
            variant,
            getFrameRecordTarget(record),
            "justifyContent",
            "space-between",
            editedVariantIds,
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
  if (selectedVariantId !== null) {
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
  if (selectedVariantId !== null) {
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

  if (selectedVariantId !== null) {
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
  const semanticElement = getDropdownValue(frameHtmlTagInput);
  const htmlTag = normalizeFrameHtmlTag(semanticElement);
  const ariaRole = ["tablist", "tabpanel"].includes(semanticElement) ? semanticElement : "";
  const sourceRecords = records.map((record) => record.isVariant
    ? record.isComponent ? currentComponent?.frameRecord : getFrameRecord(record.id)
    : record).filter(Boolean);
  if (sourceRecords.length === 0) return;
  const hasChange = sourceRecords.some((record) =>
    (record.element.dataset.htmlTag || "div") !== htmlTag
    || normalizeFrameAriaRole(record.element.getAttribute("role")) !== ariaRole);
  if (hasChange) recordHistory();
  sourceRecords.forEach((record) => {
    record.element.dataset.htmlTag = htmlTag;
    if (ariaRole) record.element.setAttribute("role", ariaRole);
    else if (normalizeFrameAriaRole(record.element.getAttribute("role"))) {
      record.element.removeAttribute("role");
    }
  });
  if (records.some((record) => record.isVariant)) renderVariants();
  else scheduleSelectedFramePreviewRender(records);
  renderComponentProps();
});

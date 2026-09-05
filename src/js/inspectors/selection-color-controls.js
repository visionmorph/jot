/* Aggregated color controls for a selected frame and its descendant layers. */

const selectionColorSection = document.querySelector("[data-selection-colors]");
let selectionColorGroups = new Map();

function getLayerTargetForElement(element) {
  if (element === canvasRootStack || element.classList.contains("canvas-root-stack")) return "component:0";
  if (element.classList.contains("canvas-frame")) return `frame:${element.dataset.frameId}`;
  if (element.classList.contains("canvas-text")) return `text:${element.dataset.textId}`;
  if (element.classList.contains("canvas-vector")) return `vector:${element.dataset.vectorId}`;
  return null;
}

function getResolvedColorValue(value, fallbackOpacity = 100) {
  const normalized = String(value || "").trim();
  const channels = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  const color = normalizeHexColor(normalized) || normalizeHexColor(cssColorToHex(normalized));
  if (!color) return null;
  const rawAlpha = channels?.[4];
  const opacity = rawAlpha == null
    ? normalizeColorOpacity(fallbackOpacity)
    : normalizeColorOpacity(Number.parseFloat(rawAlpha) * (rawAlpha.includes("%") ? 1 : 100));
  return {
    color,
    opacity,
    key: `${color}:${Number(opacity.toFixed(3))}`,
  };
}

function hasMaskImage(styles) {
  const maskImage = styles.maskImage || styles.getPropertyValue("-webkit-mask-image");
  return Boolean(maskImage && maskImage !== "none");
}

function getFrameColorMembers(element, target) {
  const members = [];
  const styles = getComputedStyle(element);
  if (normalizeHexColor(element.dataset.frameColor) || String(element.style.backgroundColor).trim()) {
    const value = getResolvedColorValue(styles.backgroundColor, element.dataset.frameColorOpacity || 100);
    if (value) members.push({ ...value, kind: "frame-background", target, element });
  }
  if (normalizeHexColor(element.dataset.outlineColor)) {
    const value = getResolvedColorValue(
      getColorWithOpacity(element.dataset.outlineColor, element.dataset.outlineColorOpacity || 100),
      element.dataset.outlineColorOpacity || 100,
    );
    if (value) members.push({ ...value, kind: "frame-outline", target, element });
  }
  return members;
}

function getTextColorMembers(element, target) {
  const textId = Number(element.dataset.textId);
  const sourceRecord = getTextRecord(textId);
  const preview = element.closest(".variant-preview[data-variant-instance-id]");
  const variantInstanceId = preview instanceof HTMLElement
    ? Number(preview.dataset.variantInstanceId)
    : null;
  const record = sourceRecord
    ? {
        ...sourceRecord,
        element,
        ...(Number.isFinite(variantInstanceId) ? { isVariantInstance: true, variantInstanceId } : {}),
      }
    : null;
  const runData = getCurrentTextRunData(record ?? element);
  if (record && runData.hasRuns) {
    return runData.segments.map((segment) => ({
      color: segment.color,
      opacity: segment.opacity,
      key: segment.key,
      kind: "text-range",
      target,
      element,
      record,
      start: segment.start,
      end: segment.end,
    }));
  }
  const styles = getComputedStyle(element);
  const renderedColor = String(styles.color || "").trim().toLowerCase();
  const isVariantWithoutPaint = record?.isVariantInstance && renderedColor === "transparent";
  const isBaseWithoutPaint = record && !record.isVariantInstance
    && !normalizeHexColor(element.dataset.textColor);
  if (isVariantWithoutPaint || isBaseWithoutPaint) return [];
  const value = getResolvedColorValue(styles.color, element.dataset.textColorOpacity || 100);
  return value ? [{ ...value, kind: "text", target, element }] : [];
}

function getVectorColorMembers(element, target) {
  const record = { element };
  if (getVectorPaintProperties(record).length === 0) return [];
  const value = getResolvedColorValue(
    getColorWithOpacity(getVectorRenderedColor(record), getVectorRenderedOpacity(record)),
    getVectorRenderedOpacity(record),
  );
  return value ? [{ ...value, kind: "vector", target, element }] : [];
}

function getElementColorMembers(element) {
  const target = getLayerTargetForElement(element);
  if (!target) return [];
  const styles = getComputedStyle(element);
  let members;
  if (hasMaskImage(styles)) {
    const value = getResolvedColorValue(styles.color);
    members = value ? [{ ...value, kind: "icon", target, element }] : [];
  } else if (element.classList.contains("canvas-text")) members = getTextColorMembers(element, target);
  else if (element.classList.contains("canvas-vector")) members = getVectorColorMembers(element, target);
  else members = getFrameColorMembers(element, target);
  const preview = element.closest(".variant-preview[data-variant-instance-id]");
  const variantInstanceId = preview instanceof HTMLElement
    ? Number(preview.dataset.variantInstanceId)
    : null;
  return Number.isFinite(variantInstanceId)
    ? members.map((member) => ({ ...member, variantInstanceId }))
    : members;
}

function getSelectionColorRoot() {
  if (selectionState.kind === "component" && selectionState.componentId === currentComponent?.id) {
    return canvasRootStack;
  }
  if (selectionState.kind === "layers"
    && getSelectedLayerKeys().length === 1
    && getPrimarySelectedLayerKey()?.startsWith("frame:")) {
    return getElementForLayerKey(getPrimarySelectedLayerKey());
  }
  if (selectionState.kind !== "variant" || getSelectedVariantLayerTargets().length > 1) return null;
  const target = selectedVariantLayerTarget;
  if (target !== null && !target.startsWith("frame:")) return null;
  const preview = componentSet?.querySelector(
    `.variant-preview[data-variant-instance-id="${CSS.escape(String(selectedVariantInstanceId))}"]`,
  );
  const root = preview?.querySelector(".canvas-root-stack");
  return root instanceof HTMLElement ? findVariantTarget(root, target || "component:0") : null;
}

function groupSelectionColorMembers(members, variantInstanceId = null) {
  const groups = new Map();
  members.forEach((member) => {
    const group = groups.get(member.key);
    if (group) group.members.push(member);
    else groups.set(member.key, {
      id: `selection-color-${groups.size + 1}`,
      color: member.color,
      opacity: member.opacity,
      members: [member],
      variantInstanceId,
    });
  });
  return [...groups.values()];
}

function collectSelectionColorGroups() {
  const root = getSelectionColorRoot();
  if (!(root instanceof HTMLElement)) return [];
  const directChildren = Array.from(root.children).filter((element) => (
    element.matches(".canvas-frame, .canvas-text, .canvas-vector")
  ));
  if (!directChildren.some((element) => getElementColorMembers(element).length > 0)) return [];

  const descendants = Array.from(root.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector"));
  const members = [
    ...getElementColorMembers(root),
    ...descendants.flatMap((element) => getElementColorMembers(element)),
  ];
  return groupSelectionColorMembers(
    members,
    selectionState.kind === "variant" ? selectedVariantInstanceId : null,
  );
}

function collectSelectedFrameColorGroups() {
  const records = typeof getSelectedFrameLayoutRecords === "function"
    ? getSelectedFrameLayoutRecords()
    : getSelectedFrameRecords();
  if (records.length < 2) return [];
  let hasNestedColor = false;
  const rootSignatures = [];
  const members = records.flatMap((record) => {
    const root = record.element;
    const rootMembers = getElementColorMembers(root);
    rootSignatures.push(rootMembers
      .map((member) => `${member.kind}:${member.key}`)
      .sort()
      .join("|"));
    const descendantMembers = Array.from(
      root.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector"),
    ).flatMap((element) => getElementColorMembers(element));
    if (descendantMembers.length > 0) hasNestedColor = true;
    return [...rootMembers, ...descendantMembers];
  });
  if (members.length === 0) return [];
  const hasDifferentRootPaint = rootSignatures.some((signature) => signature !== rootSignatures[0]);
  const hasDistinctColors = new Set(members.map((member) => member.key)).size > 1;
  if (!hasNestedColor && !hasDifferentRootPaint && !hasDistinctColors) return [];
  return groupSelectionColorMembers(
    members,
    selectionState.kind === "variant" ? selectedVariantInstanceId : null,
  );
}

function createTextRangeColorMembers(record, rangeSelection) {
  return getCurrentTextRunData(record, rangeSelection).segments.map((segment) => ({
    color: segment.color,
    opacity: segment.opacity,
    key: segment.key,
    kind: "text-range",
    target: `text:${record.id}`,
    element: record.element,
    record,
    start: segment.start,
    end: segment.end,
  }));
}

function collectSelectedTextColorGroups() {
  const records = getSelectedTextRecords();
  if (records.length === 0) return [];
  const members = records.flatMap((record) => {
    const runData = getCurrentTextRunData(record);
    if (!runData.hasRuns) {
      return getTextColorMembers(record.element, `text:${record.id}`);
    }
    return runData.segments.map((segment) => ({
      color: segment.color,
      opacity: segment.opacity,
      key: segment.key,
      kind: "text-range",
      target: `text:${record.id}`,
      element: record.element,
      record,
      start: segment.start,
      end: segment.end,
    }));
  });
  if (new Set(members.map((member) => member.key)).size < 2) return [];
  return groupSelectionColorMembers(
    members,
    selectionState.kind === "variant" ? selectedVariantInstanceId : null,
  );
}

function collectSelectedVectorColorGroups() {
  const records = getSelectedVectorRecords();
  if (records.length < 2) return [];
  const members = records.flatMap((record) => (
    getVectorColorMembers(record.element, `vector:${record.id}`)
  ));
  if (new Set(members.map((member) => member.key)).size < 2) return [];
  return groupSelectionColorMembers(
    members,
    selectionState.kind === "variant" ? selectedVariantInstanceId : null,
  );
}

function collectActiveTextRangeColorGroups() {
  const record = getSelectedTextRecord();
  const rangeSelection = getActiveTextRangeSelection(record);
  if (!record || !rangeSelection) return [];
  const members = createTextRangeColorMembers(record, rangeSelection);
  if (new Set(members.map((member) => member.key)).size < 2) return [];
  return groupSelectionColorMembers(members, rangeSelection.variantInstanceId);
}

function createSelectionColorControl(group, index) {
  const control = document.createElement("div");
  control.className = "color-input";
  control.dataset.colorControl = "selection";
  control.dataset.selectionColorId = group.id;
  control.innerHTML = `
    <div class="custom-color-value">
      <label class="custom-color-swatch" aria-label="Choose selection color ${index + 1}">
        <span class="custom-color-swatch-fill" data-color-swatch aria-hidden="true"></span>
        <input class="canvas-color-picker" type="color" value="${group.color}" />
      </label>
      <input class="custom-color-hex" type="text" inputmode="text" maxlength="6" value="${group.color.slice(1)}" aria-label="Selection color ${index + 1} hex value" autocomplete="off" autocapitalize="characters" spellcheck="false" data-color-hex />
    </div>
    <div class="divider-vertical divider-vertical--subtle-01" aria-hidden="true"></div>
    <div class="custom-color-opacity">
      <input type="text" inputmode="decimal" maxlength="3" value="${group.opacity}" aria-label="Selection color ${index + 1} opacity" data-color-opacity />
      <span class="text-input__suffix" role="button" aria-label="Adjust selection color ${index + 1} opacity" data-number-suffix data-suffix-min="0" data-suffix-max="100"><span class="text-input__suffix-value" aria-hidden="true">%</span></span>
    </div>`;
  return control;
}

function syncSelectionColorControls(isFrameSelected, isTextSelected, isVectorSelected = false) {
  if (!(selectionColorSection instanceof HTMLElement)) return;
  const showBulkTextColors = isTextSelected && !isFrameSelected;
  const showBulkVectorColors = isVectorSelected && !isFrameSelected && !isTextSelected
    && getSelectedVectorRecords().length > 1;
  const selectedFrameRecords = typeof getSelectedFrameLayoutRecords === "function"
    ? getSelectedFrameLayoutRecords()
    : getSelectedFrameRecords();
  const showBulkFrameColors = isFrameSelected && selectedFrameRecords.length > 1;
  const hasPartialTextFill = showBulkTextColors && Boolean(getPartialTextFillState()?.partial);
  const hasActiveTextRange = showBulkTextColors && Boolean(getActiveTextRangeSelection());
  const groups = showBulkFrameColors
    ? collectSelectedFrameColorGroups()
    : isFrameSelected
      ? collectSelectionColorGroups()
    : showBulkTextColors
      ? hasActiveTextRange ? collectActiveTextRangeColorGroups() : collectSelectedTextColorGroups()
      : showBulkVectorColors
        ? collectSelectedVectorColorGroups()
      : [];
  const textPaintSection = textColorPicker?.closest("[data-paint-section]");
  if (textPaintSection instanceof HTMLElement) {
    textPaintSection.hidden = showBulkTextColors && groups.length > 0 && !hasPartialTextFill;
  }
  const vectorPaintSection = vectorColorPicker?.closest("[data-paint-section]");
  if (vectorPaintSection instanceof HTMLElement) {
    vectorPaintSection.hidden = showBulkVectorColors && groups.length > 0;
  }
  const inspector = isFrameSelected
    ? frameInspector
    : showBulkTextColors
      ? textInspector
      : showBulkVectorColors ? vectorInspector : null;
  if (inspector instanceof HTMLElement) inspector.append(selectionColorSection);
  const previousControls = Array.from(selectionColorSection.querySelectorAll('[data-color-control="selection"]'));
  if (activeColorControl instanceof HTMLElement && previousControls.includes(activeColorControl)) closeColorPicker();
  previousControls.forEach((control) => control.remove());
  selectionColorGroups = new Map(groups.map((group) => [group.id, group]));
  groups.forEach((group, index) => {
    const control = createSelectionColorControl(group, index);
    selectionColorSection.append(control);
    bindCustomColorControl(control);
    const picker = control.querySelector("input[type='color']");
    syncCustomColorControl(picker, group.color, group.opacity);
  });
  selectionColorSection.hidden = groups.length === 0;
}

function getSelectionColorState(control) {
  const group = selectionColorGroups.get(control.dataset.selectionColorId);
  const picker = control.querySelector("input[type='color']");
  if (!group || !(picker instanceof HTMLInputElement)) return null;
  return {
    property: "selection",
    group,
    color: group.color,
    opacity: group.opacity,
    picker,
  };
}

function applyBaseSelectionColorMember(member, color, opacity) {
  const renderedColor = getColorWithOpacity(color, opacity);
  if (member.kind === "text-range") {
    applyTextColorToOffsets(member.element, member.start, member.end, color, opacity);
    persistTextRangeColor(member.record);
    return;
  }
  if (member.kind === "frame-background") {
    member.element.dataset.frameColor = color;
    member.element.dataset.frameColorOpacity = String(opacity);
    member.element.style.backgroundColor = renderedColor;
    return;
  }
  if (member.kind === "frame-outline") {
    member.element.dataset.outlineColor = color;
    member.element.dataset.outlineColorOpacity = String(opacity);
    applyFrameOutline(member.element);
    return;
  }
  if (member.kind === "text") {
    member.element.dataset.textColor = color;
    member.element.dataset.textColorOpacity = String(opacity);
    member.element.style.color = renderedColor;
    return;
  }
  if (member.kind === "icon") {
    member.element.style.color = renderedColor;
    return;
  }
  const vectorId = Number(member.target.split(":")[1]);
  const record = getVectorRecord(vectorId);
  if (!record) return;
  applyVectorColor(record, renderedColor);
  record.element.dataset.vectorColor = color;
  record.element.dataset.vectorColorOpacity = String(opacity);
}

function getVariantSelectionColorMemberProperties(member) {
  if (member.kind === "text-range") return ["richTextHtml", "color"];
  if (member.kind === "frame-background") return ["backgroundColor"];
  if (member.kind === "frame-outline") return ["outlineColor", "outlineColorOpacity"];
  if (member.kind === "text" || member.kind === "icon") return ["color"];
  const properties = getVectorPaintProperties({ element: member.element });
  return properties.length > 0 ? properties : ["fill"];
}

function getSelectionColorEditedVariantIds(members) {
  const idsByProperty = new Map();
  members.forEach((member) => {
    if (!Number.isFinite(member.variantInstanceId)) return;
    getVariantSelectionColorMemberProperties(member).forEach((property) => {
      const key = `${member.target}\u0000${property}`;
      if (!idsByProperty.has(key)) idsByProperty.set(key, new Set());
      idsByProperty.get(key).add(member.variantInstanceId);
    });
  });
  return (member, property) => idsByProperty.get(`${member.target}\u0000${property}`) ?? new Set();
}

function applyVariantSelectionColorMember(instance, member, color, opacity, getEditedInstanceIds) {
  const renderedColor = getColorWithOpacity(color, opacity);
  const writeOverride = (property, value) => upsertVariantOverrideForEditedInstances(
    instance,
    member.target,
    property,
    value,
    getEditedInstanceIds(member, property),
  );
  if (member.kind === "text-range") {
    applyTextColorToOffsets(member.element, member.start, member.end, color, opacity);
    persistTextRangeColor(member.record, {
      getEditedVariantInstanceIds: (property) => getEditedInstanceIds(member, property),
    });
    return;
  }
  if (member.kind === "frame-background") {
    member.element.dataset.frameColor = color;
    member.element.dataset.frameColorOpacity = String(opacity);
    member.element.style.backgroundColor = renderedColor;
    writeOverride("backgroundColor", renderedColor);
    syncVariantLayerStylePreviews(member.target, "backgroundColor", member.element);
    return;
  }
  if (member.kind === "frame-outline") {
    member.element.dataset.outlineColor = color;
    member.element.dataset.outlineColorOpacity = String(opacity);
    applyFrameOutline(member.element);
    writeOverride("outlineColor", color);
    writeOverride("outlineColorOpacity", String(opacity));
    syncVariantLayerStylePreviews(member.target, "outlineColor", member.element);
    syncVariantLayerStylePreviews(member.target, "outlineColorOpacity", member.element);
    return;
  }
  if (member.kind === "text" || member.kind === "icon") {
    if (member.kind === "text") {
      member.element.dataset.textColor = color;
      member.element.dataset.textColorOpacity = String(opacity);
    }
    member.element.style.color = renderedColor;
    writeOverride("color", renderedColor);
    syncVariantLayerStylePreviews(member.target, "color", member.element);
    return;
  }
  const record = { element: member.element };
  const properties = getVectorPaintProperties(record);
  getVectorPaintElements(member.element.querySelector("svg")).forEach((paintElement) => {
    const styles = getComputedStyle(paintElement);
    if (isSolidSvgPaint(styles.fill)) paintElement.style.fill = renderedColor;
    if (isSolidSvgPaint(styles.stroke)) paintElement.style.stroke = renderedColor;
  });
  member.element.dataset.vectorColor = color;
  member.element.dataset.vectorColorOpacity = String(opacity);
  (properties.length > 0 ? properties : ["fill"]).forEach((property) => {
    writeOverride(property, renderedColor);
    syncVariantLayerStylePreviews(member.target, property, member.element);
  });
}

function applySelectionColorValue(control, state, color, opacity) {
  if (!color) return false;
  if (state.color === color && state.opacity === opacity) {
    syncCustomColorControl(state.picker, color, opacity);
    return true;
  }
  recordHistoryForGesture(control);
  const getEditedInstanceIds = getSelectionColorEditedVariantIds(state.group.members);
  state.group.members.forEach((member) => {
    const variantInstanceId = member.variantInstanceId ?? state.group.variantInstanceId;
    const instance = variantInstanceId == null ? null : getVariantInstance(variantInstanceId);
    if (instance) applyVariantSelectionColorMember(
      instance, member, color, opacity, getEditedInstanceIds,
    );
    else applyBaseSelectionColorMember(member, color, opacity);
  });
  state.group.color = color;
  state.group.opacity = opacity;
  syncCustomColorControl(state.picker, color, opacity);
  if (textInspector instanceof HTMLElement && !textInspector.hidden) syncInspectorToSelectedText();
  if (frameInspector instanceof HTMLElement && !frameInspector.hidden) syncInspectorToSelectedFrame();
  if (vectorInspector instanceof HTMLElement && !vectorInspector.hidden) syncInspectorToSelectedVector();
  if (state.group.members.every((member) => (
    member.variantInstanceId == null && state.group.variantInstanceId == null
  )) && variantModel.getInstances().length > 0) scheduleVariantInstanceRender();
  return true;
}

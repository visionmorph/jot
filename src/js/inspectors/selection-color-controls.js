/* Aggregated color controls for a selected frame and its descendant layers. */

const selectionColorSection = document.querySelector("[data-selection-colors]");
let selectionColorGroups = new Map();

function isHiddenFromSelectionColors(element) {
  let current = element;
  while (current instanceof HTMLElement) {
    if (current.matches(".canvas-root-stack, .canvas-frame, .canvas-text, .canvas-vector")) {
      if (!isLayerVisible(current)
        || current.classList.contains("is-layer-hidden")
        || current.style.display === "none") return true;
      if (current.classList.contains("canvas-root-stack")) break;
    }
    current = current.parentElement;
  }
  return false;
}

function getLayerTargetForElement(element) {
  if (element === canvasRootStack || element.classList.contains("canvas-root-stack")) return "component:0";
  if (element.classList.contains("canvas-frame")) return `frame:${element.dataset.frameId}`;
  if (element.classList.contains("canvas-text")) return `text:${element.dataset.textId}`;
  if (element.classList.contains("canvas-vector")) return `vector:${element.dataset.vectorId}`;
  return null;
}

function getResolvedColorValue(value, fallbackOpacity = 100) {
  const normalized = String(value || "").trim();
  if (normalized.toLowerCase() === "transparent") return null;
  const channels = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  const color = normalizeHexColor(normalized) || normalizeHexColor(cssColorToHex(normalized));
  if (!color) return null;
  const rawAlpha = channels?.[4];
  const opacity = rawAlpha == null
    ? normalizeColorOpacity(fallbackOpacity)
    : normalizeColorOpacity(Number.parseFloat(rawAlpha) * (rawAlpha.includes("%") ? 1 : 100));
  if (opacity === 0) return null;
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
  if (isHiddenFromSelectionColors(element)) return [];
  const members = [];
  const styles = getComputedStyle(element);
  const inlineBackground = String(element.style.backgroundColor).trim();
  if (!isTransparentColorValue(inlineBackground)
    && (normalizeHexColor(element.dataset.frameColor) || inlineBackground)) {
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
  if (isHiddenFromSelectionColors(element)) return [];
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
  const isVariantWithoutPaint = record?.isVariantInstance
    && (isTransparentColorValue(element.style.color) || renderedColor === "transparent");
  const isBaseWithoutPaint = record && !record.isVariantInstance
    && !normalizeHexColor(element.dataset.textColor);
  if (isVariantWithoutPaint || isBaseWithoutPaint) return [];
  const value = getResolvedColorValue(styles.color, element.dataset.textColorOpacity || 100);
  return value ? [{ ...value, kind: "text", target, element }] : [];
}

function getVectorColorMembers(element, target) {
  if (isHiddenFromSelectionColors(element)) return [];
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

function groupPaintMembers(members) {
  const groups = new Map();
  members.forEach((member) => {
    const group = groups.get(member.key);
    if (group) group.members.push(member);
    else groups.set(member.key, {
      id: `selection-color-${groups.size + 1}`,
      color: member.color,
      opacity: member.opacity,
      members: [member],
      variantInstanceId: member.variantInstanceId ?? null,
    });
  });
  return [...groups.values()];
}

function createTextRangeColorMembers(record, rangeSelection) {
  if (isHiddenFromSelectionColors(record.element)) return [];
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
    variantInstanceId: rangeSelection.variantInstanceId ?? record.variantInstanceId ?? null,
  }));
}

function createPaintScope(element, includeDescendants, record = null, rangeSelection = null) {
  if (!(element instanceof HTMLElement)) return null;
  const preview = element.closest(".variant-preview[data-variant-instance-id]");
  const variantInstanceId = preview instanceof HTMLElement
    ? Number(preview.dataset.variantInstanceId)
    : null;
  return {
    element,
    target: getLayerTargetForElement(element),
    variantInstanceId: Number.isFinite(variantInstanceId) ? variantInstanceId : null,
    includeDescendants,
    ...(record ? { record } : {}),
    ...(rangeSelection ? { rangeSelection } : {}),
  };
}

function getSelectedPaintScopes(isFrameSelected, isTextSelected, isVectorSelected) {
  if (getSelectedVariantInstanceIds().length > 1 && getSelectedVariantLayerTargets().length > 0) {
    const scopes = [];
    for (const instanceId of getSelectedVariantInstanceIds()) {
      const root = componentSet?.querySelector(
        `.variant-preview[data-variant-instance-id="${CSS.escape(String(instanceId))}"] .canvas-root-stack`,
      );
      if (!(root instanceof HTMLElement)) continue;
      for (const target of getSelectedVariantLayerTargets(instanceId)) {
        const element = findVariantTarget(root, target);
        const scope = createPaintScope(element, target.startsWith("frame:"));
        if (scope) scopes.push(scope);
      }
    }
    return scopes;
  }

  if (isFrameSelected) {
    const records = typeof getSelectedFrameLayoutRecords === "function"
      ? getSelectedFrameLayoutRecords()
      : getSelectedFrameRecords();
    return records.map((record) => createPaintScope(record.element, true, record)).filter(Boolean);
  }
  if (isTextSelected) {
    const record = getSelectedTextRecord();
    const rangeSelection = getActiveTextRangeSelection(record);
    if (record && rangeSelection) return [createPaintScope(record.element, false, record, rangeSelection)].filter(Boolean);
    return getSelectedTextRecords()
      .map((candidate) => createPaintScope(candidate.element, false, candidate))
      .filter(Boolean);
  }
  if (isVectorSelected) {
    return getSelectedVectorRecords()
      .map((record) => createPaintScope(record.element, false, record))
      .filter(Boolean);
  }
  return [];
}

function collectPaintMembers(scopes) {
  const elements = new Set();
  const members = [];
  scopes.forEach((scope) => {
    if (scope.rangeSelection && scope.record) {
      members.push(...createTextRangeColorMembers(scope.record, scope.rangeSelection));
      return;
    }
    elements.add(scope.element);
    if (scope.includeDescendants) {
      scope.element.querySelectorAll(".canvas-frame, .canvas-text, .canvas-vector")
        .forEach((descendant) => elements.add(descendant));
    }
  });
  members.push(...[...elements].flatMap(getElementColorMembers));
  return members;
}

function shouldShowPaintGroups(scopes, members, groups) {
  if (groups.length === 0) return false;
  if (groups.length > 1) return true;
  if (scopes.some((scope) => scope.rangeSelection)) return false;

  const variantIds = new Set(scopes
    .map((scope) => scope.variantInstanceId)
    .filter(Number.isFinite));
  const targetTypes = new Set(scopes.map((scope) => scope.target?.split(":")[0]).filter(Boolean));
  if (variantIds.size > 1 && targetTypes.size === 1) return false;
  if (targetTypes.size > 1) return true;
  if (scopes.every((scope) => !scope.includeDescendants)) return false;

  const hasDescendantPaint = scopes.some((scope) => scope.includeDescendants
    && members.some((member) => member.element !== scope.element && scope.element.contains(member.element)));
  if (hasDescendantPaint) return true;

  const rootSignatures = scopes.map((scope) => members
    .filter((member) => member.element === scope.element)
    .map((member) => `${member.kind}:${member.key}`)
    .sort()
    .join("|"));
  return rootSignatures.some((signature) => signature !== rootSignatures[0]);
}

function getSelectionPaintGroups(isFrameSelected, isTextSelected, isVectorSelected) {
  const scopes = getSelectedPaintScopes(isFrameSelected, isTextSelected, isVectorSelected);
  const members = collectPaintMembers(scopes);
  const groups = groupPaintMembers(members);
  return shouldShowPaintGroups(scopes, members, groups) ? groups : [];
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
  const showMultiVariantColors = getSelectedVariantInstanceIds().length > 1
    && getSelectedVariantLayerTargets().length > 0;
  const showBulkTextColors = isTextSelected && !isFrameSelected;
  const showBulkVectorColors = isVectorSelected && !isFrameSelected && !isTextSelected
    && (showMultiVariantColors || getSelectedVectorRecords().length > 1);
  const hasPartialTextFill = showBulkTextColors && Boolean(getPartialTextFillState()?.partial);
  const groups = getSelectionPaintGroups(isFrameSelected, isTextSelected, isVectorSelected);
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

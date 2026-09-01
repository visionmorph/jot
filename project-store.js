/* Shared document state, hierarchy operations, selection, and undo/redo history. */

const canvas = document.querySelector("#canvas");

const toolbar = document.querySelector(".toolbar");

const componentSet = document.querySelector("[data-component-set]");

const canvasRootStack = document.querySelector("[data-canvas-root-stack]");

const treeView = document.querySelector("[data-tree-view]");

const instanceTreeView = document.querySelector("[data-instance-tree-view]");

const pageInspector = document.querySelector("[data-page-inspector]");

const frameInspector = document.querySelector("[data-frame-inspector]");

const frameInspectorHeading = document.querySelector("#frame-heading");

const addVariantAction = document.querySelector("[data-add-variant-action]");

const textInspector = document.querySelector("[data-text-inspector]");

const vectorInspector = document.querySelector("[data-vector-inspector]");

const colorPicker = document.querySelector("#canvas-color-picker");

const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

const fontSelect = document.querySelector("#text-font");

const weightSelect = document.querySelector("#text-weight");

const sizeSelect = document.querySelector("#text-size");

const textSizeCombobox = document.querySelector("[data-text-size-combobox]");

const textSizeOptions = Array.from(document.querySelectorAll("[data-text-size-option]"));

const lineHeightInput = document.querySelector("#text-line-height");

const letterSpacingInput = document.querySelector("#text-letter-spacing");

const textColorPicker = document.querySelector("#text-color-picker");

const vectorColorPicker = document.querySelector("#vector-color-picker");

const colorControls = Array.from(document.querySelectorAll("[data-color-control]"));

const frameSizeInputs = Array.from(document.querySelectorAll("[data-frame-size]"));

const textLayerSizeInputs = Array.from(document.querySelectorAll("[data-text-layer-size]"));

const vectorSizeInputs = Array.from(document.querySelectorAll("[data-vector-size]"));

const sizeModeComboboxes = Array.from(document.querySelectorAll("[data-size-combobox]"));

const framePaddingInputs = Array.from(document.querySelectorAll("[data-frame-padding]"));

const framePaddingAxisInputs = Array.from(document.querySelectorAll("[data-frame-padding-axis]"));

const framePaddingModeToggle = document.querySelector("[data-padding-mode-toggle]");

const framePaddingSides = document.querySelector("[data-padding-sides]");

const framePaddingAxes = document.querySelector("[data-padding-axes]");

const frameRadiusInput = document.querySelector("#frame-radius");

const frameColorPicker = document.querySelector("#frame-color-picker");

const frameDirectionOptions = Array.from(document.querySelectorAll("[data-frame-direction]"));

const frameAlignmentOptions = Array.from(document.querySelectorAll("[data-frame-alignment]"));

const frameAlignmentGrid = document.querySelector("[data-frame-alignment-grid]");

const textAlignmentOptions = Array.from(document.querySelectorAll("[data-text-alignment]"));

const frameOutlineColorPicker = document.querySelector("#frame-outline-color-picker");

const frameOutlinePositionSelect = document.querySelector("#frame-outline-position");

const frameOutlineWeightInput = document.querySelector("#frame-outline-weight");

const frameOutlineControls = document.querySelector("[data-frame-outline-controls]");

const frameGapInput = document.querySelector("#frame-gap");

document.addEventListener("focusin", (event) => {
  const input = event.target;
  if (input instanceof HTMLInputElement && input.matches(".text-input[data-select-on-focus], .dropdown__input[data-select-on-focus]")) {
    input.select();
  }
});

document.querySelectorAll("[data-text-input-prefix]").forEach((prefix) => {
  if (!(prefix instanceof HTMLElement)) return;
  const shell = prefix.closest(".text-input-shell, .size-mode-combobox");
  const input = shell?.querySelector("input.text-input, input.dropdown__input");
  if (!(input instanceof HTMLInputElement)) return;

  let drag = null;

  const finishDrag = (event, shouldFocus) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const didDrag = drag.didDrag;
    drag = null;
    prefix.classList.remove("is-dragging");
    shell?.classList.remove("is-scrubbing");
    if (prefix.hasPointerCapture(event.pointerId)) prefix.releasePointerCapture(event.pointerId);
    endHistoryGesture(input);
    if (!didDrag && shouldFocus) input.focus();
    event.preventDefault();
  };

  prefix.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const startValues = input.value.split(",").map((part) => Number(part.trim()));
    if (startValues.length < 1 || startValues.length > 2 || startValues.some((value) => !Number.isFinite(value))) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    document.querySelectorAll(".text-input-shell.is-scrubbing, .size-mode-combobox.is-scrubbing").forEach((activeShell) => {
      if (activeShell !== shell) activeShell.classList.remove("is-scrubbing");
    });
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValues,
      didDrag: false,
    };
    beginHistoryGesture(input);
    shell?.classList.add("is-scrubbing");
    prefix.setPointerCapture(event.pointerId);
    event.preventDefault();
  });

  prefix.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dragUnits = Math.trunc(event.clientX - drag.startX);
    if (!drag.didDrag && Math.abs(dragUnits) < 2) return;
    drag.didDrag = true;
    prefix.classList.add("is-dragging");
    const multiplier = event.shiftKey ? 10 : 1;
    const minimumValue = input.min || input.dataset.min;
    const maximumValue = input.max || input.dataset.max;
    const minimum = minimumValue == null || minimumValue === "" ? -Infinity : Number(minimumValue);
    const maximum = maximumValue == null || maximumValue === "" ? Infinity : Number(maximumValue);
    const nextValues = drag.startValues.map((startValue) => (
      Math.min(maximum, Math.max(minimum, startValue + dragUnits * multiplier))
    ));
    const nextValue = nextValues.join(", ");
    if (input.value === nextValue) return;
    input.value = nextValue;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    event.preventDefault();
  });

  prefix.addEventListener("pointerup", (event) => finishDrag(event, true));
  prefix.addEventListener("pointercancel", (event) => finishDrag(event, false));
  prefix.addEventListener("lostpointercapture", (event) => finishDrag(event, false));
  prefix.addEventListener("click", (event) => event.preventDefault());
});

function getDropdownValue(input) {
  return input instanceof HTMLInputElement ? input.dataset.value ?? input.value : "";
}

function setDropdownValue(input, value) {
  if (!(input instanceof HTMLInputElement)) return;
  const dropdown = input.closest("[data-dropdown]");
  const options = Array.from(dropdown?.querySelectorAll(".dropdown__option") ?? []);
  const selectedOption = options.find((option) => option.getAttribute("data-dropdown-value") === String(value));
  input.dataset.value = String(value);
  input.value = selectedOption?.textContent?.trim() || String(value);
  options.forEach((option) => {
    option.setAttribute("aria-selected", String(option === selectedOption));
  });
}

function setDropdownOpen(dropdown, isOpen) {
  if (!(dropdown instanceof HTMLElement)) return;
  const input = dropdown.querySelector(".dropdown__input");
  const toggle = dropdown.querySelector("[data-dropdown-toggle]");
  const menu = dropdown.querySelector("[data-dropdown-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;

  if (isOpen) {
    document.querySelectorAll("[data-dropdown].is-open").forEach((otherDropdown) => {
      if (otherDropdown !== dropdown) setDropdownOpen(otherDropdown, false);
    });
  }

  menu.hidden = !isOpen;
  dropdown.classList.toggle("is-open", isOpen);
  input.setAttribute("aria-expanded", String(isOpen));
  toggle?.setAttribute("aria-expanded", String(isOpen));
  if (isOpen) {
    input.focus();
    if (input.hasAttribute("data-select-on-focus")) input.select();
  }
}

document.querySelectorAll("[data-dropdown]").forEach((dropdown) => {
  if (!(dropdown instanceof HTMLElement)) return;
  const input = dropdown.querySelector(".dropdown__input");
  const toggle = dropdown.querySelector("[data-dropdown-toggle]");
  const menu = dropdown.querySelector("[data-dropdown-menu]");
  if (!(input instanceof HTMLInputElement) || !(menu instanceof HTMLElement)) return;

  toggle?.addEventListener("click", () => setDropdownOpen(dropdown, menu.hidden));
  input.addEventListener("click", () => {
    if (input.readOnly) setDropdownOpen(dropdown, menu.hidden);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDropdownOpen(dropdown, true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setDropdownOpen(dropdown, false);
    } else if (event.key === "Enter" && input.readOnly) {
      event.preventDefault();
      setDropdownOpen(dropdown, menu.hidden);
    }
  });
  menu.addEventListener("pointerdown", (event) => event.preventDefault());
  menu.addEventListener("click", (event) => {
    const option = event.target instanceof Element ? event.target.closest(".dropdown__option") : null;
    if (!(option instanceof HTMLButtonElement)) return;
    const value = option.getAttribute("data-dropdown-value") ?? option.textContent?.trim() ?? "";
    setDropdownValue(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    setDropdownOpen(dropdown, false);
    input.focus();
    if (input.hasAttribute("data-select-on-focus")) input.select();
  });
});

document.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Node)) return;
  document.querySelectorAll("[data-dropdown].is-open").forEach((dropdown) => {
    if (dropdown instanceof HTMLElement && !dropdown.contains(event.target)) setDropdownOpen(dropdown, false);
  });
});

const frameGapCombobox = document.querySelector("[data-gap-combobox]");

const frameHtmlTagInput = document.querySelector("#frame-html-tag");

const exportComponentsButton = document.querySelector("[data-export-components]");

const addComponentButton = document.querySelector("[data-add-component]");

const addPropButton = document.querySelector("[data-add-prop]");

const addPropOverflowMenu = document.querySelector("[data-prop-overflow-menu]");

const addPropMenu = document.querySelector("[data-prop-menu]");

const addPropTypeOptions = Array.from(document.querySelectorAll("[data-prop-type]"));

const propRowsContainer = document.querySelector("[data-prop-rows]");

const addVariantButton = document.querySelector("[data-add-variant]");

const variantInspector = document.querySelector("[data-variant-inspector]");

const variantInspectorContent = document.querySelector("[data-variant-inspector-content]");

const variantPropRowsContainer = document.querySelector("[data-variant-prop-rows]");

const variantRuleRowsContainer = document.querySelector("[data-variant-rule-rows]");

const addVariantPropButton = document.querySelector("[data-add-variant-prop]");

const addVariantRuleButton = document.querySelector("[data-add-variant-rule]");

const vectorImportButton = document.querySelector("[data-vector-import]");

const vectorFileInput = document.querySelector("[data-vector-file-input]");

const RESIZE_HANDLE_DIRECTIONS = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const DEFAULT_FONT_FAMILY = "Inter";

const DEFAULT_FONT_WEIGHT = 400;

const WEIGHT_LABELS = {
  100: "Thin",
  200: "Extra Light",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "Semi Bold",
  700: "Bold",
  800: "Extra Bold",
  900: "Black",
};

const FALLBACK_FONT_CATALOG = [
  { family: "Inter", category: "Sans Serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: "Roboto", category: "Sans Serif", weights: [100, 300, 400, 500, 700, 900] },
  { family: "Open Sans", category: "Sans Serif", weights: [300, 400, 500, 600, 700, 800] },
  { family: "Lato", category: "Sans Serif", weights: [100, 300, 400, 700, 900] },
  { family: "Montserrat", category: "Sans Serif", weights: [100, 200, 300, 400, 500, 600, 700, 800, 900] },
  { family: "Merriweather", category: "Serif", weights: [300, 400, 700, 900] },
];

let fontCatalog = FALLBACK_FONT_CATALOG;

const loadedGoogleFonts = new Set();

let activeTool = "select";

let components = [];

let currentComponent = null;

let nextComponentId = 1;

let isComponentExpanded = true;

let selectionState = { kind: "canvas" };

let nextFrameId = 1;

let nextTextId = 1;

let nextVectorId = 1;

let nextLayerOrder = 1;

let frameRecords = [];

let textRecords = [];

let vectorRecords = [];

let componentProps = [];

let nextComponentPropId = 1;

/* Owns variant collection structure and ID allocation; contained records remain live editable objects. */
function createVariantModel() {
  let props = Object.freeze([]);
  let rules = Object.freeze([]);
  let instances = Object.freeze([]);
  let nextPropId = 1;
  let nextRuleId = 1;
  let nextInstanceId = 1;

  return Object.freeze({
    getProps: () => props,
    getRules: () => rules,
    getInstances: () => instances,
    peekNextPropId: () => nextPropId,
    addProp(input) {
      const prop = { ...input, id: nextPropId++ };
      props = Object.freeze([...props, prop]);
      return prop;
    },
    addRule(input) {
      const rule = { ...input, id: nextRuleId++ };
      rules = Object.freeze([...rules, rule]);
      return rule;
    },
    addInstance(input, { prepend = false } = {}) {
      const instance = { ...input, id: nextInstanceId++ };
      instances = Object.freeze(prepend ? [instance, ...instances] : [...instances, instance]);
      return instance;
    },
    replaceProps(nextProps) {
      props = Object.freeze([...nextProps]);
    },
    replaceRules(nextRules) {
      rules = Object.freeze([...nextRules]);
    },
    replaceInstances(nextInstances) {
      instances = Object.freeze([...nextInstances]);
    },
    capture() {
      return {
        variantProps: structuredClone(props),
        variantRules: structuredClone(rules),
        variantInstances: structuredClone(instances),
        nextVariantPropId: nextPropId,
        nextVariantRuleId: nextRuleId,
        nextVariantInstanceId: nextInstanceId,
      };
    },
    restore(snapshot) {
      props = Object.freeze(structuredClone(snapshot.variantProps));
      rules = Object.freeze(structuredClone(snapshot.variantRules));
      instances = Object.freeze(structuredClone(snapshot.variantInstances));
      nextPropId = snapshot.nextVariantPropId;
      nextRuleId = snapshot.nextVariantRuleId;
      nextInstanceId = snapshot.nextVariantInstanceId;
    },
  });
}

const variantModel = createVariantModel();

const MIN_INTERACTIVE_LAYER_SIZE = 1;

const expandedFrameIds = new Set();

let undoHistory = [];

let redoHistory = [];

const HISTORY_LIMIT = 100;

let isRestoringHistory = false;

let isBatchingHistory = false;

let canvasColorValue = colorPicker instanceof HTMLInputElement ? colorPicker.value : "#121619";

let canvasColorOpacity = 100;

let resizeInteraction = null;

let observedResizeElement = null;

const resizeOverlay = document.createElement("div");

const selectedLayerResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => requestAnimationFrame(positionResizeOverlay))
  : null;

function getDefaultComponentFrameState() {
  return {
    dataset: {
      canvasRootStack: "",
      paddingLeft: "10",
      paddingTop: "10",
      paddingRight: "10",
      paddingBottom: "10",
      width: "100",
      height: "100",
      widthMode: "hug",
      heightMode: "hug",
      radius: "0",
      frameColor: "#ffffff",
      frameColorOpacity: "100",
      direction: "horizontal",
      alignment: "top-left",
      gap: "10",
      gapMode: "fixed",
      outlineColor: "",
      outlineColorOpacity: "100",
      outlinePosition: "inside",
      outlineWeight: "0",
      htmlTag: "div",
      layerVisibility: "visible",
    },
    style: "width: 100px; height: 100px; padding: 10px; gap: 10px; flex-direction: row; align-items: flex-start; justify-content: flex-start; border: 0; border-radius: 0px; box-shadow: none; background-color: #ffffff; box-sizing: border-box;",
  };
}

function createEmptyWorkspaceState(componentId) {
  return {
    componentId,
    componentFrame: getDefaultComponentFrameState(),
    frames: [],
    texts: [],
    vectors: [],
    selection: { kind: "component", componentId },
    expandedFrameIds: [],
    nextFrameId: 1,
    nextTextId: 1,
    nextVectorId: 1,
    nextLayerOrder: 1,
    componentProps: [],
    nextComponentPropId: 1,
    variantProps: [],
    variantRules: [],
    variantInstances: [],
    variantModelVersion: 3,
    nextVariantPropId: 1,
    nextVariantRuleId: 1,
    nextVariantInstanceId: 1,
    canvasColor: "#121619",
    canvasColorOpacity: 100,
    activeTool: "select",
  };
}

function createComponentDefinition(name) {
  const id = nextComponentId;
  nextComponentId += 1;
  return {
    id,
    name,
    expanded: true,
    expandedFrameIds: [],
    frameRecord: {
      id: 0,
      parentId: null,
      element: canvasRootStack,
      order: 0,
      isComponent: true,
      name,
    },
    workspace: createEmptyWorkspaceState(id),
    undoHistory: [],
    redoHistory: [],
  };
}

function initializeComponents() {
  if (components.length > 0) return;
  const component = createComponentDefinition("Component 1");
  components.push(component);
  currentComponent = component;
  selectComponentState(component.id);
  isComponentExpanded = true;
  restoreWorkspaceState(component.workspace, { render: false });
  selectComponentState(component.id);
  syncElementSelectionStyles();
}

function getFrameRecord(frameId) {
  if (frameId === 0 && currentComponent?.frameRecord) return currentComponent.frameRecord;
  return frameRecords.find((record) => record.id === frameId);
}

function getTextRecord(textId) {
  return textRecords.find((record) => record.id === textId);
}

function syncTextRecordContent(record, value, { writeElement = true } = {}) {
  if (!record?.element) return "";
  const text = String(value ?? "");
  record.name = text;
  if (writeElement && record.element.textContent !== text) record.element.textContent = text;
  record.element.setAttribute("aria-label", text || `Text ${record.id}`);
  componentProps.forEach((prop) => {
    if (prop.type === "string" && prop.targetTextId === record.id) prop.defaultValue = text;
  });
  return text;
}

function getVectorRecord(vectorId) {
  return vectorRecords.find((record) => record.id === vectorId);
}

function getLayerDimensionMode(element, dimension, fallback = "fixed") {
  const mode = element.dataset[`${dimension}Mode`];
  return mode === "fixed" || mode === "hug" || mode === "fill" ? mode : fallback;
}

function getLayerSizingContext(type, record) {
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  const parentRecord = parentId === null && !record.isComponent
    ? currentComponent?.frameRecord ?? null
    : parentId === null ? null : getFrameRecord(parentId);
  const parentDirection = parentRecord?.element.dataset.direction === "vertical" ? "vertical" : "horizontal";
  return { parentId, parentDirection };
}

function getFrameChildren(parentId) {
  return frameRecords.filter((record) => record.parentId === parentId);
}

function getTextChildren(parentFrameId) {
  return textRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getVectorChildren(parentFrameId) {
  return vectorRecords.filter((record) => record.parentFrameId === parentFrameId);
}

function getLayerChildren(parentFrameId) {
  return [
    ...getFrameChildren(parentFrameId).map((record) => ({ type: "frame", record })),
    ...getTextChildren(parentFrameId).map((record) => ({ type: "text", record })),
    ...getVectorChildren(parentFrameId).map((record) => ({ type: "vector", record })),
  ].sort((a, b) => a.record.order - b.record.order);
}

function getLayerKey(type, id) {
  return `${type}:${id}`;
}

function getElementForLayerKey(key) {
  const [type, rawId] = key.split(":");
  const id = Number(rawId);
  if (type === "frame") return getFrameRecord(id)?.element ?? null;
  if (type === "text") return getTextRecord(id)?.element ?? null;
  if (type === "vector") return getVectorRecord(id)?.element ?? null;
  return null;
}

function getLayerParentKey(key) {
  const [type, rawId] = String(key).split(":");
  const id = Number(rawId);
  const record = type === "frame" ? getFrameRecord(id) : type === "text" ? getTextRecord(id) : getVectorRecord(id);
  if (!record || record.isComponent) return null;
  const parentId = type === "frame" ? record.parentId : record.parentFrameId;
  return parentId === null ? "component:0" : `frame:${parentId}`;
}

function getLayerDepth(key) {
  let parentKey = getLayerParentKey(key);
  let depth = 0;
  while (parentKey?.startsWith("frame:")) {
    depth += 1;
    parentKey = getLayerParentKey(parentKey);
  }
  return depth;
}

function getShallowestPrimaryLayerKey(keys) {
  if (keys.length === 0) return null;
  const minimumDepth = Math.min(...keys.map(getLayerDepth));
  return [...keys].reverse().find((key) => getLayerDepth(key) === minimumDepth) ?? keys[keys.length - 1];
}

function normalizeLayerSelection(keys, primaryKey = null) {
  const uniqueKeys = [...new Set(keys)].filter((key) => getElementForLayerKey(key) instanceof HTMLElement);
  const resolvedPrimary = uniqueKeys.includes(primaryKey) ? primaryKey : uniqueKeys[uniqueKeys.length - 1] ?? null;
  if (!resolvedPrimary) return { keys: [], primaryKey: null };
  const parentKey = getLayerParentKey(resolvedPrimary);
  const peerKeys = uniqueKeys.filter((key) => getLayerParentKey(key) === parentKey);
  return {
    keys: peerKeys,
    primaryKey: peerKeys.includes(resolvedPrimary) ? resolvedPrimary : peerKeys[peerKeys.length - 1] ?? null,
  };
}

function selectCanvasState() {
  selectionState = { kind: "canvas" };
}

function selectComponentState(componentId = currentComponent?.id) {
  if (componentId == null) return false;
  selectionState = { kind: "component", componentId };
  return true;
}

function selectVariantState(instanceId, target = null, componentId = currentComponent?.id) {
  if (instanceId == null || componentId == null) return false;
  const normalizedTarget = target === null || getElementForLayerKey(target) instanceof HTMLElement ? target : null;
  selectionState = {
    kind: "variant",
    componentId,
    instanceId,
    targets: normalizedTarget === null ? [] : [normalizedTarget],
    anchorTarget: normalizedTarget,
    target: normalizedTarget,
  };
  return true;
}

function selectVariantLayerTargetsState(
  instanceId,
  targets,
  anchorTarget = null,
  componentId = currentComponent?.id,
) {
  if (instanceId == null || componentId == null || !getVariantInstance(instanceId)) return false;
  const normalized = normalizeLayerSelection(targets, anchorTarget);
  if (normalized.keys.length === 0) {
    selectCanvasState();
    return false;
  }
  selectionState = {
    kind: "variant",
    componentId,
    instanceId,
    targets: normalized.keys,
    anchorTarget: normalized.primaryKey,
    // Keep the singular field for inspectors and older snapshots. It is an
    // internal anchor only; selection and movement use the complete target set.
    target: normalized.primaryKey,
  };
  return true;
}

function selectVariantLayerTarget(instanceId, target, additive = false, componentId = currentComponent?.id) {
  const currentTargets = selectionState.kind === "variant" && selectionState.instanceId === instanceId
    ? getSelectedVariantLayerTargets()
    : [];
  if (!additive) return selectVariantLayerTargetsState(instanceId, [target], target, componentId);
  const nextTargets = [...currentTargets];
  const existingIndex = nextTargets.indexOf(target);
  if (existingIndex >= 0) {
    nextTargets.splice(existingIndex, 1);
    return selectVariantLayerTargetsState(
      instanceId,
      nextTargets,
      nextTargets[nextTargets.length - 1] ?? null,
      componentId,
    );
  }
  return selectVariantLayerTargetsState(instanceId, [...nextTargets, target], target, componentId);
}

function getSelectedVariantLayerTargets() {
  if (selectionState.kind !== "variant") return [];
  if (Array.isArray(selectionState.targets)) return selectionState.targets;
  return selectionState.target === null ? [] : [selectionState.target];
}

function isVariantLayerTargetSelected(instanceId, target) {
  return selectionState.kind === "variant"
    && selectionState.instanceId === instanceId
    && getSelectedVariantLayerTargets().includes(target);
}

function getSelectedVariantInstanceIds() {
  if (selectionState.kind === "variants") return [...selectionState.instanceIds];
  if (selectionState.kind === "variant") return [selectionState.instanceId];
  return [];
}

function isVariantInstanceSelected(instanceId) {
  return getSelectedVariantInstanceIds().includes(instanceId);
}

function selectVariantInstancesState(instanceIds, primaryInstanceId = null, componentId = currentComponent?.id) {
  if (componentId == null) return false;
  const validIds = new Set(variantModel.getInstances().map((instance) => instance.id));
  const normalizedIds = [...new Set(instanceIds)].filter((instanceId) => validIds.has(instanceId));
  if (normalizedIds.length === 0) {
    selectCanvasState();
    return false;
  }
  const resolvedPrimary = normalizedIds.includes(primaryInstanceId)
    ? primaryInstanceId
    : normalizedIds[normalizedIds.length - 1];
  if (normalizedIds.length === 1) return selectVariantState(normalizedIds[0], null, componentId);
  selectionState = {
    kind: "variants",
    componentId,
    instanceIds: normalizedIds,
    primaryInstanceId: resolvedPrimary,
  };
  return true;
}

function selectLayerKeys(keys, primaryKey = null, componentId = currentComponent?.id) {
  if (componentId == null) return false;
  const normalized = normalizeLayerSelection(keys, primaryKey);
  if (normalized.keys.length === 0) {
    selectCanvasState();
    return false;
  }
  selectionState = {
    kind: "layers",
    componentId,
    keys: normalized.keys,
    primaryKey: normalized.primaryKey,
  };
  return true;
}

function selectLayerKey(key, additive = false) {
  const currentKeys = selectionState.kind === "layers" ? selectionState.keys : [];
  if (!additive) return selectLayerKeys([key], key);
  const nextKeys = [...currentKeys];
  const existingIndex = nextKeys.indexOf(key);
  if (existingIndex >= 0) {
    nextKeys.splice(existingIndex, 1);
    return selectLayerKeys(nextKeys, nextKeys[nextKeys.length - 1] ?? null);
  }
  return selectLayerKeys([...nextKeys, key], key);
}

function removeLayerKeyFromSelection(key) {
  if (selectionState.kind !== "layers" || !selectionState.keys.includes(key)) return false;
  const nextKeys = selectionState.keys.filter((candidate) => candidate !== key);
  return selectLayerKeys(nextKeys, nextKeys[nextKeys.length - 1] ?? null);
}

function getSelectedLayerKeys() {
  return selectionState.kind === "layers" ? selectionState.keys : [];
}

function getPrimarySelectedLayerKey() {
  return selectionState.kind === "layers" ? selectionState.primaryKey : null;
}

function captureSelectionState() {
  if (selectionState.kind === "layers") {
    return { ...selectionState, keys: [...selectionState.keys] };
  }
  if (selectionState.kind === "variant") {
    return { ...selectionState, targets: [...getSelectedVariantLayerTargets()] };
  }
  if (selectionState.kind === "variants") {
    return { ...selectionState, instanceIds: [...selectionState.instanceIds] };
  }
  return { ...selectionState };
}

function restoreSelectionState(snapshot) {
  const savedSelection = snapshot.selection;
  if (savedSelection?.kind === "component" && savedSelection.componentId === currentComponent?.id) {
    selectComponentState(savedSelection.componentId);
    return;
  }
  if (savedSelection?.kind === "variant"
    && savedSelection.componentId === currentComponent?.id
    && getVariantInstance(savedSelection.instanceId)) {
    const savedTargets = Array.isArray(savedSelection.targets)
      ? savedSelection.targets
      : savedSelection.target == null ? [] : [savedSelection.target];
    if (savedTargets.length > 0) {
      selectVariantLayerTargetsState(
        savedSelection.instanceId,
        savedTargets,
        savedSelection.anchorTarget ?? savedSelection.target ?? null,
        savedSelection.componentId,
      );
    } else {
      selectVariantState(savedSelection.instanceId, null, savedSelection.componentId);
    }
    return;
  }
  if (savedSelection?.kind === "variants" && savedSelection.componentId === currentComponent?.id) {
    if (selectVariantInstancesState(
      savedSelection.instanceIds ?? [],
      savedSelection.primaryInstanceId ?? null,
      savedSelection.componentId,
    )) return;
  }
  if (savedSelection?.kind === "layers" && savedSelection.componentId === currentComponent?.id) {
    if (selectLayerKeys(savedSelection.keys ?? [], savedSelection.primaryKey ?? null, savedSelection.componentId)) return;
  }

  // Migrate snapshots created before selection became a single state object.
  if (snapshot.selectedVariantInstanceId != null && getVariantInstance(snapshot.selectedVariantInstanceId)) {
    selectVariantState(snapshot.selectedVariantInstanceId, snapshot.selectedVariantLayerTarget ?? null);
    return;
  }
  const legacyKeys = [...(snapshot.selectedLayerKeys ?? [])];
  if (legacyKeys.length === 0) {
    const legacyElementEntries = [
      ["frame", snapshot.selectedCanvasFrame],
      ["text", snapshot.selectedCanvasText],
      ["vector", snapshot.selectedCanvasVector],
    ];
    legacyElementEntries.forEach(([type, element]) => {
      const records = type === "frame" ? frameRecords : type === "text" ? textRecords : vectorRecords;
      const record = records.find((candidate) => candidate.element === element);
      if (record) legacyKeys.push(getLayerKey(type, record.id));
    });
  }
  if (selectLayerKeys(legacyKeys, legacyKeys[legacyKeys.length - 1] ?? null)) return;
  if (snapshot.selectedComponentId === currentComponent?.id) {
    selectComponentState(snapshot.selectedComponentId);
    return;
  }
  selectCanvasState();
}

const selectedLayerKeys = Object.freeze({
  get size() { return getSelectedLayerKeys().length; },
  has(key) { return getSelectedLayerKeys().includes(key); },
  forEach(callback, thisArg) {
    getSelectedLayerKeys().forEach((key) => callback.call(thisArg, key, key, selectedLayerKeys));
  },
  [Symbol.iterator]() { return getSelectedLayerKeys()[Symbol.iterator](); },
});

const selectedVariantLayerTargets = Object.freeze({
  get size() { return getSelectedVariantLayerTargets().length; },
  has(target) { return getSelectedVariantLayerTargets().includes(target); },
  forEach(callback, thisArg) {
    getSelectedVariantLayerTargets().forEach(
      (target) => callback.call(thisArg, target, target, selectedVariantLayerTargets),
    );
  },
  [Symbol.iterator]() { return getSelectedVariantLayerTargets()[Symbol.iterator](); },
});

function getPrimarySelectedElement(type) {
  const key = getPrimarySelectedLayerKey();
  return key?.startsWith(`${type}:`) ? getElementForLayerKey(key) : null;
}

Object.defineProperties(globalThis, {
  selectedComponentId: {
    configurable: true,
    get: () => selectionState.kind === "component" ? selectionState.componentId : null,
  },
  selectedVariantInstanceId: {
    configurable: true,
    get: () => selectionState.kind === "variant"
      ? selectionState.instanceId
      : selectionState.kind === "variants" ? selectionState.primaryInstanceId : null,
  },
  selectedVariantLayerTarget: {
    configurable: true,
    get: () => selectionState.kind === "variant" ? selectionState.target : null,
  },
  selectedVariantInstanceIds: {
    configurable: true,
    get: () => getSelectedVariantInstanceIds(),
  },
  selectedCanvasFrame: {
    configurable: true,
    get: () => getPrimarySelectedElement("frame"),
  },
  selectedCanvasText: {
    configurable: true,
    get: () => getPrimarySelectedElement("text"),
  },
  selectedCanvasVector: {
    configurable: true,
    get: () => getPrimarySelectedElement("vector"),
  },
});

function isLayerSelected(type, id) {
  return selectedLayerKeys.has(getLayerKey(type, id));
}

function setPrimarySelectionFromKey(key) {
  selectLayerKeys(getSelectedLayerKeys(), key);
}

function setPrimarySelectionToLatest() {
  const keys = getSelectedLayerKeys();
  setPrimarySelectionFromKey(keys[keys.length - 1]);
}

function captureWorkspaceState() {
  return {
    componentId: currentComponent?.id ?? null,
    componentName: currentComponent?.name ?? "Component",
    componentFrame: canvasRootStack instanceof HTMLElement
      ? {
          dataset: { ...canvasRootStack.dataset },
          style: canvasRootStack.getAttribute("style"),
        }
      : getDefaultComponentFrameState(),
    frames: frameRecords.map((record) => ({
      record,
      name: record.name,
      parentId: record.parentId,
      order: record.order,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
    })),
    texts: textRecords.map((record) => ({
      record,
      name: record.name,
      parentFrameId: record.parentFrameId,
      order: record.order,
      isNew: record.isNew,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
      textContent: record.element.textContent ?? "",
      contentEditable: record.element.contentEditable,
    })),
    vectors: vectorRecords.map((record) => ({
      record,
      parentFrameId: record.parentFrameId,
      order: record.order,
      name: record.name,
      svgSource: record.svgSource,
      originalSvgSource: record.originalSvgSource,
      dataset: { ...record.element.dataset },
      style: record.element.getAttribute("style"),
    })),
    selection: captureSelectionState(),
    expandedFrameIds: [...expandedFrameIds],
    nextFrameId,
    nextTextId,
    nextVectorId,
    nextLayerOrder,
    componentProps: componentProps.map((prop) => ({
      ...prop,
      ...(Array.isArray(prop.options) ? { options: [...prop.options] } : {}),
    })),
    nextComponentPropId,
    ...variantModel.capture(),
    variantModelVersion: 3,
    canvasColor: canvasColorValue,
    canvasColorOpacity,
    activeTool,
  };
}

function restoreElementState(element, dataset, style) {
  Object.keys(element.dataset).forEach((key) => delete element.dataset[key]);
  Object.entries(dataset).forEach(([key, value]) => {
    element.dataset[key] = value;
  });
  if (style === null) element.removeAttribute("style");
  else element.setAttribute("style", style);
}

function getSnapshotArray(snapshot, key) {
  const value = snapshot[key];
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`Workspace snapshot "${key}" must be an array.`);
  return value;
}

function normalizeSnapshotCounter(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 ? Math.max(number, fallback) : fallback;
}

function normalizeWorkspaceLayerEntries(snapshot, key) {
  return getSnapshotArray(snapshot, key).map((entry, index) => {
    if (!entry || typeof entry !== "object" || !entry.record || typeof entry.record !== "object") {
      throw new TypeError(`Workspace snapshot "${key}[${index}]" is missing its layer record.`);
    }
    if (!(entry.record.element instanceof HTMLElement)) {
      throw new TypeError(`Workspace snapshot "${key}[${index}]" is missing its layer element.`);
    }
    return {
      ...entry,
      dataset: entry.dataset && typeof entry.dataset === "object" && !Array.isArray(entry.dataset)
        ? { ...entry.dataset }
        : {},
      style: typeof entry.style === "string" ? entry.style : null,
    };
  });
}

function getNextSnapshotRecordId(entries) {
  return entries.reduce((nextId, entry) => {
    const id = Number(entry.record.id);
    return Number.isInteger(id) && id >= nextId ? id + 1 : nextId;
  }, 1);
}

function getNextSnapshotEntityId(entries) {
  return entries.reduce((nextId, entry) => {
    const id = Number(entry?.id);
    return Number.isInteger(id) && id >= nextId ? id + 1 : nextId;
  }, 1);
}

function normalizeWorkspaceSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    throw new TypeError("Workspace snapshot must be an object.");
  }

  const frames = normalizeWorkspaceLayerEntries(snapshot, "frames");
  const texts = normalizeWorkspaceLayerEntries(snapshot, "texts");
  const vectors = normalizeWorkspaceLayerEntries(snapshot, "vectors").map((entry) => ({
    ...entry,
    svgSource: String(entry.svgSource ?? entry.record.svgSource ?? ""),
  }));
  const normalizedComponentProps = getSnapshotArray(snapshot, "componentProps");
  const normalizedVariantProps = getSnapshotArray(snapshot, "variantProps");
  const normalizedVariantRules = getSnapshotArray(snapshot, "variantRules");
  const normalizedVariantInstances = getSnapshotArray(snapshot, "variantInstances");
  const defaultComponentFrame = getDefaultComponentFrameState();
  const componentFrame = snapshot.componentFrame && typeof snapshot.componentFrame === "object"
    ? snapshot.componentFrame
    : defaultComponentFrame;
  const componentFrameDataset = componentFrame.dataset
    && typeof componentFrame.dataset === "object"
    && !Array.isArray(componentFrame.dataset)
    ? componentFrame.dataset
    : {};
  const layerEntries = [...frames, ...texts, ...vectors];
  const nextLayerOrderFallback = layerEntries.reduce((nextOrder, entry) => {
    const order = Number(entry.order);
    return Number.isFinite(order) && order >= nextOrder ? order + 1 : nextOrder;
  }, 1);
  const canvasOpacity = Number(snapshot.canvasColorOpacity ?? 100);

  return {
    ...snapshot,
    componentId: snapshot.componentId ?? currentComponent?.id ?? null,
    componentName: typeof snapshot.componentName === "string"
      ? snapshot.componentName
      : currentComponent?.name ?? "Component",
    componentFrame: {
      dataset: { ...defaultComponentFrame.dataset, ...componentFrameDataset },
      style: typeof componentFrame.style === "string" || componentFrame.style === null
        ? componentFrame.style
        : defaultComponentFrame.style,
    },
    frames,
    texts,
    vectors,
    expandedFrameIds: getSnapshotArray(snapshot, "expandedFrameIds"),
    nextFrameId: normalizeSnapshotCounter(snapshot.nextFrameId, getNextSnapshotRecordId(frames)),
    nextTextId: normalizeSnapshotCounter(snapshot.nextTextId, getNextSnapshotRecordId(texts)),
    nextVectorId: normalizeSnapshotCounter(snapshot.nextVectorId, getNextSnapshotRecordId(vectors)),
    nextLayerOrder: normalizeSnapshotCounter(snapshot.nextLayerOrder, nextLayerOrderFallback),
    componentProps: normalizedComponentProps,
    variantProps: normalizedVariantProps,
    variantRules: normalizedVariantRules,
    variantInstances: normalizedVariantInstances,
    nextComponentPropId: normalizeSnapshotCounter(
      snapshot.nextComponentPropId,
      getNextSnapshotEntityId(normalizedComponentProps),
    ),
    nextVariantPropId: normalizeSnapshotCounter(
      snapshot.nextVariantPropId,
      getNextSnapshotEntityId(normalizedVariantProps),
    ),
    nextVariantRuleId: normalizeSnapshotCounter(
      snapshot.nextVariantRuleId,
      getNextSnapshotEntityId(normalizedVariantRules),
    ),
    nextVariantInstanceId: normalizeSnapshotCounter(
      snapshot.nextVariantInstanceId,
      getNextSnapshotEntityId(normalizedVariantInstances),
    ),
    canvasColor: typeof snapshot.canvasColor === "string" ? snapshot.canvasColor : "#121619",
    canvasColorOpacity: Number.isFinite(canvasOpacity) ? Math.max(0, Math.min(100, canvasOpacity)) : 100,
    activeTool: typeof snapshot.activeTool === "string" ? snapshot.activeTool : "select",
  };
}

function isLayerVisible(element) {
  return element?.dataset.layerVisibility !== "hidden";
}

function syncLayerVisibility(element) {
  if (!(element instanceof HTMLElement)) return;
  const isVisible = isLayerVisible(element);
  element.classList.toggle("is-layer-hidden", !isVisible);
  if (isVisible) element.removeAttribute("aria-hidden");
  else element.setAttribute("aria-hidden", "true");
}

function attachRestoredLayers(parentFrameId, parentElement) {
  getLayerChildren(parentFrameId).forEach((layer) => {
    if (parentFrameId === null && canvasRootStack instanceof HTMLElement) {
      canvasRootStack.append(layer.record.element);
    } else parentElement.append(layer.record.element);
    if (layer.type === "frame") attachRestoredLayers(layer.record.id, layer.record.element);
  });
}

function applyWorkspaceSnapshot(snapshot, preparedVectorSvgs) {
  const allElements = new Set([
    ...frameRecords.map((record) => record.element),
    ...textRecords.map((record) => record.element),
    ...vectorRecords.map((record) => record.element),
    ...snapshot.frames.map((entry) => entry.record.element),
    ...snapshot.texts.map((entry) => entry.record.element),
    ...(snapshot.vectors ?? []).map((entry) => entry.record.element),
  ]);
  allElements.forEach((element) => element.remove());

  if (canvasRootStack instanceof HTMLElement) {
    if (currentComponent && typeof snapshot.componentName === "string") {
      currentComponent.name = snapshot.componentName;
      currentComponent.frameRecord.name = snapshot.componentName;
    }
    const componentFrameState = snapshot.componentFrame ?? getDefaultComponentFrameState();
    restoreElementState(canvasRootStack, componentFrameState.dataset, componentFrameState.style);
    canvasRootStack.style.removeProperty("outline");
    syncLayerVisibility(canvasRootStack);
    canvasRootStack.setAttribute("aria-label", currentComponent?.name || "Component");
    canvasRootStack.setAttribute("aria-selected", "false");
  }

  frameRecords = snapshot.frames.map((entry) => {
    entry.record.name = entry.name ?? `Frame ${entry.record.id}`;
    entry.record.parentId = entry.parentId;
    entry.record.order = entry.order;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    syncLayerVisibility(entry.record.element);
    return entry.record;
  });
  textRecords = snapshot.texts.map((entry) => {
    entry.record.name = entry.name;
    entry.record.parentFrameId = entry.parentFrameId;
    entry.record.order = entry.order;
    entry.record.isNew = entry.isNew;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    syncLayerVisibility(entry.record.element);
    entry.record.element.textContent = entry.textContent;
    entry.record.element.contentEditable = entry.contentEditable;
    return entry.record;
  });
  vectorRecords = snapshot.vectors.map((entry, index) => {
    entry.record.parentFrameId = entry.parentFrameId;
    entry.record.order = entry.order;
    entry.record.name = entry.name;
    entry.record.svgSource = entry.svgSource;
    entry.record.originalSvgSource = entry.originalSvgSource ?? entry.record.originalSvgSource ?? entry.svgSource;
    restoreElementState(entry.record.element, entry.dataset, entry.style);
    syncLayerVisibility(entry.record.element);
    entry.record.element.replaceChildren(preparedVectorSvgs[index]);
    return entry.record;
  });

  nextFrameId = snapshot.nextFrameId;
  nextTextId = snapshot.nextTextId;
  nextVectorId = snapshot.nextVectorId ?? 1;
  nextLayerOrder = snapshot.nextLayerOrder;
  componentProps = (snapshot.componentProps ?? []).map((prop) => {
    const normalizedProp = {
      ...prop,
      ...(Array.isArray(prop.options) ? { options: [...prop.options] } : {}),
    };
    const legacyEnumType = normalizedProp.type;
    if (["size", "variant", "shape"].includes(legacyEnumType)) {
      normalizedProp.name = normalizedProp.name || normalizedProp.type;
      normalizedProp.type = "enum";
      normalizedProp.property = legacyEnumType === "size"
        ? "size"
        : "kind";
    }
    if (normalizedProp.type === "enum") {
      const isState = normalizedProp.variantSubtype === "state";
      const options = isState
        ? ["enabled", "hover", "active", "focus-visible"]
        : Array.isArray(normalizedProp.options) && normalizedProp.options.length > 0
        ? normalizedProp.options
        : ["default"];
      normalizedProp.options = options;
      normalizedProp.defaultValue = options[0];
      const enumProperties = ["size", "kind", "state"];
      const savedProperty = String(normalizedProp.property ?? "").toLowerCase();
      const namedProperty = String(normalizedProp.name ?? "").trim().toLowerCase();
      const migratedProperty = savedProperty === "type" || savedProperty === "variant"
        ? "kind"
        : savedProperty;
      const migratedNamedProperty = namedProperty === "type" || namedProperty === "variant"
        ? "kind"
        : namedProperty;
      normalizedProp.property = isState
        ? "state"
        : enumProperties.includes(migratedProperty)
          ? migratedProperty
          : enumProperties.includes(migratedNamedProperty) ? migratedNamedProperty : "kind";
    } else if (normalizedProp.type === "boolean") {
      normalizedProp.defaultValue = normalizedProp.defaultValue === true || normalizedProp.defaultValue === "true";
    }
    return normalizedProp;
  });
  nextComponentPropId = snapshot.nextComponentPropId ?? 1;
  variantModel.restore(snapshot);
  if (variantModel.getInstances().length > 0 && (snapshot.variantModelVersion ?? 0) < 2) {
    variantModel.addInstance({
      name: "Variant 1",
      componentId: currentComponent?.id ?? snapshot.componentId,
      parentVariantId: null,
      propValues: Object.fromEntries(variantModel.getProps()
        .filter((prop) => prop.type !== "action")
        .map((prop) => [prop.id, getVariantPropDefaultValue(prop)])),
      overrides: [],
    }, { prepend: true });
  }
  normalizeDefaultVariantInstance();
  expandedFrameIds.clear();
  snapshot.expandedFrameIds.forEach((frameId) => expandedFrameIds.add(frameId));
  restoreSelectionState(snapshot);

  attachRestoredLayers(null, canvas);
  syncElementSelectionStyles();
  canvasColorValue = snapshot.canvasColor ?? "#121619";
  canvasColorOpacity = Math.max(0, Math.min(100, Number(snapshot.canvasColorOpacity ?? 100)));
  canvas.style.backgroundColor = canvasColorValue ? getColorWithOpacity(canvasColorValue, canvasColorOpacity) : "transparent";
  if (colorPicker instanceof HTMLInputElement) {
    syncCustomColorControl(colorPicker, canvasColorValue, canvasColorOpacity);
  }
  selectTool(snapshot.activeTool);
}

function restoreWorkspaceState(snapshot, options = {}) {
  if (!(canvas instanceof HTMLElement)) return;

  const normalizedSnapshot = normalizeWorkspaceSnapshot(snapshot);
  const preparedVectorSvgs = normalizedSnapshot.vectors.map((entry) => createCanvasSvg(entry.svgSource));
  const previousRestoringHistory = isRestoringHistory;
  isRestoringHistory = true;
  try {
    applyWorkspaceSnapshot(normalizedSnapshot, preparedVectorSvgs);
  } finally {
    isRestoringHistory = previousRestoringHistory;
  }
  if (options.render !== false) renderTree();
}

function recordHistory() {
  if (isRestoringHistory || isBatchingHistory) return false;
  undoHistory.push(captureWorkspaceState());
  if (undoHistory.length > HISTORY_LIMIT) undoHistory.shift();
  redoHistory.length = 0;
  return true;
}

let recordedHistoryGestureOwners = new WeakSet();

function beginHistoryGesture(owner) {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  recordedHistoryGestureOwners.delete(owner);
}

function recordHistoryForGesture(owner) {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) {
    recordHistory();
    return;
  }
  if (recordedHistoryGestureOwners.has(owner)) return;
  if (recordHistory()) recordedHistoryGestureOwners.add(owner);
}

function endHistoryGesture(owner) {
  if ((typeof owner !== "object" && typeof owner !== "function") || owner === null) return;
  recordedHistoryGestureOwners.delete(owner);
}

function bindHistoryGesture(owner) {
  if (!(owner instanceof HTMLElement)) return;
  owner.addEventListener("focus", () => beginHistoryGesture(owner));
  owner.addEventListener("blur", () => {
    queueMicrotask(() => endHistoryGesture(owner));
  });
  owner.addEventListener("keydown", (event) => {
    if (event.key === "Enter") queueMicrotask(() => endHistoryGesture(owner));
  });
  owner.addEventListener("keyup", (event) => {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") endHistoryGesture(owner);
  });
}

function undoWorkspaceChange() {
  const snapshot = undoHistory.pop();
  if (!snapshot) return;
  recordedHistoryGestureOwners = new WeakSet();
  redoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

function redoWorkspaceChange() {
  const snapshot = redoHistory.pop();
  if (!snapshot) return;
  recordedHistoryGestureOwners = new WeakSet();
  undoHistory.push(captureWorkspaceState());
  restoreWorkspaceState(snapshot);
}

function saveCurrentComponentWorkspace() {
  if (!currentComponent) return;
  currentComponent.workspace = captureWorkspaceState();
  currentComponent.expanded = isComponentExpanded;
  currentComponent.expandedFrameIds = [...expandedFrameIds];
  currentComponent.undoHistory = undoHistory;
  currentComponent.redoHistory = redoHistory;
}

function activateComponent(componentId, options = {}) {
  const component = components.find((entry) => entry.id === componentId);
  if (!component) return false;
  if (currentComponent && currentComponent.id !== component.id && options.saveCurrent !== false) {
    saveCurrentComponentWorkspace();
  }

  const savedExpandedFrameIds = Array.isArray(component.expandedFrameIds)
    ? component.expandedFrameIds
    : component.workspace?.expandedFrameIds ?? [];
  currentComponent = component;
  isComponentExpanded = component.expanded !== false;
  undoHistory = component.undoHistory ?? [];
  redoHistory = component.redoHistory ?? [];
  restoreWorkspaceState(component.workspace ?? createEmptyWorkspaceState(component.id), { render: false });
  expandedFrameIds.clear();
  savedExpandedFrameIds.forEach((frameId) => expandedFrameIds.add(frameId));
  component.expandedFrameIds = [...expandedFrameIds];

  if (options.selectComponent !== false) {
    selectComponentState(component.id);
    syncElementSelectionStyles();
  }
  if (options.render !== false) renderTree();
  return true;
}

function addComponent() {
  saveCurrentComponentWorkspace();
  const component = createComponentDefinition(`Component ${nextComponentId}`);
  components.push(component);
  activateComponent(component.id, { saveCurrent: false });
  return component;
}

function deleteSelectedComponent() {
  if (selectedComponentId === null || components.length <= 1) return false;
  const componentIndex = components.findIndex((component) => component.id === selectedComponentId);
  if (componentIndex < 0) return false;

  components.splice(componentIndex, 1);
  const nextComponent = components[Math.min(componentIndex, components.length - 1)];
  currentComponent = null;
  selectCanvasState();
  activateComponent(nextComponent.id, { saveCurrent: false });
  return true;
}

function getSelectedTextRecord() {
  if (selectedVariantInstanceId !== null && selectedVariantLayerTarget?.startsWith("text:")) {
    const textId = Number(selectedVariantLayerTarget.split(":")[1]);
    const sourceRecord = textRecords.find((record) => record.id === textId);
    const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(selectedVariantInstanceId))}"]`);
    const element = preview?.querySelector(`[data-text-id="${CSS.escape(String(textId))}"]`);
    if (sourceRecord && element instanceof HTMLElement) return { ...sourceRecord, element, isVariantInstance: true };
  }
  return selectedCanvasText
    ? textRecords.find((record) => record.element === selectedCanvasText)
    : undefined;
}

function getSelectedFrameRecord() {
  if (selectedVariantInstanceId !== null) {
    const target = selectedVariantLayerTarget || "component:0";
    if (target === "component:0") {
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(selectedVariantInstanceId))}"]`);
      const element = preview?.querySelector(".canvas-root-stack");
      if (currentComponent?.frameRecord && element instanceof HTMLElement) {
        return { ...currentComponent.frameRecord, element, isVariantInstance: true };
      }
      return undefined;
    }
    if (target.startsWith("frame:")) {
      const frameId = Number(target.split(":")[1]);
      const sourceRecord = frameRecords.find((record) => record.id === frameId);
      const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(selectedVariantInstanceId))}"]`);
      const element = preview?.querySelector(`[data-frame-id="${CSS.escape(String(frameId))}"]`);
      if (sourceRecord && element instanceof HTMLElement) return { ...sourceRecord, element, isVariantInstance: true };
    }
    return undefined;
  }
  if (selectedComponentId === currentComponent?.id) return currentComponent.frameRecord;
  return selectedCanvasFrame
    ? frameRecords.find((record) => record.element === selectedCanvasFrame)
    : undefined;
}

function getSelectedVectorRecord() {
  if (selectedVariantInstanceId !== null && selectedVariantLayerTarget?.startsWith("vector:")) {
    const vectorId = Number(selectedVariantLayerTarget.split(":")[1]);
    const sourceRecord = vectorRecords.find((record) => record.id === vectorId);
    const preview = componentSet?.querySelector(`.variant-preview[data-variant-instance-id="${CSS.escape(String(selectedVariantInstanceId))}"]`);
    const element = preview?.querySelector(`[data-vector-id="${CSS.escape(String(vectorId))}"]`);
    if (sourceRecord && element instanceof HTMLElement) return { ...sourceRecord, element, isVariantInstance: true };
  }
  return selectedCanvasVector
    ? vectorRecords.find((record) => record.element === selectedCanvasVector)
    : undefined;
}

function canNestFrame(draggedFrameId, parentFrameId) {
  if (draggedFrameId === parentFrameId) return false;
  let ancestor = getFrameRecord(parentFrameId);

  while (ancestor) {
    if (ancestor.id === draggedFrameId) return false;
    ancestor = ancestor.parentId === null ? undefined : getFrameRecord(ancestor.parentId);
  }

  return true;
}

function getLayerParentId(layer) {
  if (layer.type === "frame") return getFrameRecord(layer.id)?.parentId ?? null;
  if (layer.type === "text") return getTextRecord(layer.id)?.parentFrameId ?? null;
  return getVectorRecord(layer.id)?.parentFrameId ?? null;
}

function getLayerRecord(layer) {
  if (layer.type === "frame") return getFrameRecord(layer.id);
  if (layer.type === "text") return getTextRecord(layer.id);
  return getVectorRecord(layer.id);
}

function normalizeSiblingOrder(parentFrameId) {
  getLayerChildren(parentFrameId).forEach((layer, index) => {
    layer.record.order = index + 1;
  });
  nextLayerOrder = Math.max(
    1,
    ...frameRecords.map((record) => record.order + 1),
    ...textRecords.map((record) => record.order + 1),
    ...vectorRecords.map((record) => record.order + 1),
  );
}

function syncLayerDomOrder(parentFrameId) {
  const parentElement = parentFrameId === null ? canvasRootStack : getFrameRecord(parentFrameId)?.element;
  if (!(parentElement instanceof HTMLElement)) return;
  getLayerChildren(parentFrameId).forEach((layer) => {
    parentElement.append(layer.record.element);
  });
}

function moveLayer(layer, parentFrameId, targetIndex, rootPosition) {
  const record = getLayerRecord(layer);
  if (!record) return false;
  if (layer.type === "frame" && parentFrameId !== null && !canNestFrame(layer.id, parentFrameId)) return false;

  const previousParentId = getLayerParentId(layer);
  const previousSiblings = getLayerChildren(previousParentId);
  const previousIndex = previousSiblings.findIndex((sibling) => sibling.type === layer.type && sibling.record.id === layer.id);
  const nextSiblings = getLayerChildren(parentFrameId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? nextSiblings.length, nextSiblings.length));
  if (previousParentId === parentFrameId && previousIndex === insertionIndex) return false;

  recordHistory();
  const element = record.element;
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
  const elementBounds = element.getBoundingClientRect();

  if (layer.type === "frame") record.parentId = parentFrameId;
  else record.parentFrameId = parentFrameId;

  if (parentFrameId === null) {
    const left = rootPosition?.x ?? (canvasBounds ? elementBounds.left - canvasBounds.left : 0);
    const top = rootPosition?.y ?? (canvasBounds ? elementBounds.top - canvasBounds.top : 0);
    element.style.left = `${Math.max(0, left)}px`;
    element.style.top = `${Math.max(0, top)}px`;
  } else {
    element.style.left = "";
    element.style.top = "";
    expandedFrameIds.add(parentFrameId);
  }

  nextSiblings.splice(insertionIndex, 0, { type: layer.type, record });
  nextSiblings.forEach((sibling, index) => {
    sibling.record.order = index + 1;
  });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentFrameId);
  syncLayerDomOrder(previousParentId);
  if (parentFrameId !== previousParentId) syncLayerDomOrder(parentFrameId);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return true;
}

function moveLayers(layers, parentFrameId, targetIndex) {
  const uniqueLayers = [...new Map(
    layers.map((layer) => [`${layer.type}:${layer.id}`, layer]),
  ).values()];
  if (uniqueLayers.length === 0) return false;
  if (uniqueLayers.length === 1) return moveLayer(uniqueLayers[0], parentFrameId, targetIndex);
  if (uniqueLayers.some((layer) => !getLayerRecord(layer))) return false;

  const previousParentIds = new Set(uniqueLayers.map(getLayerParentId));
  if (previousParentIds.size !== 1) return false;
  if (uniqueLayers.some(
    (layer) => layer.type === "frame" && parentFrameId !== null && !canNestFrame(layer.id, parentFrameId),
  )) return false;

  const previousParentId = uniqueLayers.length > 0 ? getLayerParentId(uniqueLayers[0]) : null;
  const movingKeys = new Set(uniqueLayers.map((layer) => `${layer.type}:${layer.id}`));
  const previousSiblings = getLayerChildren(previousParentId);
  const movingSiblings = previousSiblings.filter(
    (sibling) => movingKeys.has(`${sibling.type}:${sibling.record.id}`),
  );
  if (movingSiblings.length !== uniqueLayers.length) return false;

  const targetSiblings = getLayerChildren(parentFrameId).filter(
    (sibling) => !movingKeys.has(`${sibling.type}:${sibling.record.id}`),
  );
  const insertionIndex = Math.max(0, Math.min(targetIndex ?? targetSiblings.length, targetSiblings.length));
  const nextTargetSiblings = [...targetSiblings];
  nextTargetSiblings.splice(insertionIndex, 0, ...movingSiblings);

  if (previousParentId === parentFrameId) {
    const previousOrder = previousSiblings.map((sibling) => `${sibling.type}:${sibling.record.id}`);
    const nextOrder = nextTargetSiblings.map((sibling) => `${sibling.type}:${sibling.record.id}`);
    if (previousOrder.every((key, index) => key === nextOrder[index])) return false;
  }

  recordHistory();
  const canvasBounds = canvas instanceof HTMLElement ? canvas.getBoundingClientRect() : null;
  const rootPositions = new Map(movingSiblings.map((sibling) => {
    const bounds = sibling.record.element.getBoundingClientRect();
    return [`${sibling.type}:${sibling.record.id}`, {
      x: canvasBounds ? bounds.left - canvasBounds.left : 0,
      y: canvasBounds ? bounds.top - canvasBounds.top : 0,
    }];
  }));

  movingSiblings.forEach((sibling) => {
    if (sibling.type === "frame") sibling.record.parentId = parentFrameId;
    else sibling.record.parentFrameId = parentFrameId;
    if (parentFrameId === null) {
      const position = rootPositions.get(`${sibling.type}:${sibling.record.id}`);
      sibling.record.element.style.left = `${Math.max(0, position?.x ?? 0)}px`;
      sibling.record.element.style.top = `${Math.max(0, position?.y ?? 0)}px`;
    } else {
      sibling.record.element.style.left = "";
      sibling.record.element.style.top = "";
      expandedFrameIds.add(parentFrameId);
    }
  });

  if (previousParentId !== parentFrameId) {
    previousSiblings
      .filter((sibling) => !movingKeys.has(`${sibling.type}:${sibling.record.id}`))
      .forEach((sibling, index) => { sibling.record.order = index + 1; });
  }
  nextTargetSiblings.forEach((sibling, index) => { sibling.record.order = index + 1; });
  normalizeSiblingOrder(previousParentId);
  normalizeSiblingOrder(parentFrameId);
  syncLayerDomOrder(previousParentId);
  if (parentFrameId !== previousParentId) syncLayerDomOrder(parentFrameId);
  queueCanvasMutationEffects({ sizing: true, tree: true });
  return true;
}

function nestLayer(layer, parentFrameId) {
  return moveLayer(layer, parentFrameId, getLayerChildren(parentFrameId).length);
}

function moveLayerRelative(layer, targetLayer, position) {
  if (position === "inside" && targetLayer.type === "frame") {
    return nestLayer(layer, targetLayer.id);
  }

  const parentFrameId = getLayerParentId(targetLayer);
  const siblings = getLayerChildren(parentFrameId).filter(
    (sibling) => sibling.type !== layer.type || sibling.record.id !== layer.id,
  );
  const targetIndex = siblings.findIndex(
    (sibling) => sibling.type === targetLayer.type && sibling.record.id === targetLayer.id,
  );
  if (targetIndex < 0) return false;
  return moveLayer(layer, parentFrameId, targetIndex + (position === "after" ? 1 : 0));
}

function collectFrameAndDescendantIds(frameId) {
  const ids = new Set([frameId]);
  let foundChild = true;

  while (foundChild) {
    foundChild = false;
    frameRecords.forEach((record) => {
      if (record.parentId !== null && ids.has(record.parentId) && !ids.has(record.id)) {
        ids.add(record.id);
        foundChild = true;
      }
    });
  }

  return ids;
}

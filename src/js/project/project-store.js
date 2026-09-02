/* Shared document state, hierarchy operations, selection, and undo/redo history. */

const canvas = document.querySelector("#canvas");

const toolbar = document.querySelector(".toolbar");

const componentSet = document.querySelector("[data-component-set]");

const canvasRootStack = document.querySelector("[data-canvas-root-stack]");

const treeView = document.querySelector("[data-tree-view]");

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

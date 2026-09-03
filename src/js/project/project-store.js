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

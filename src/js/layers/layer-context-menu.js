/* Lightweight context menu for canvas layers and layer-tree rows. */

const layerContextMenu = document.createElement("div");
const isMacPlatform = /Mac|iPhone|iPad/.test(navigator.platform);
const commandKey = isMacPlatform ? "⌘" : "Ctrl+";
const layerContextActions = [
  { id: "copy", label: "Copy", shortcut: `${commandKey}C` },
  { id: "paste", label: "Paste", shortcut: `${commandKey}V` },
  { id: "duplicate", label: "Duplicate", shortcut: `${commandKey}D` },
  { id: "front", label: "Bring to front", shortcut: "]" },
  { id: "back", label: "Send to back", shortcut: "[" },
  { id: "delete", label: "Delete", shortcut: "Delete" },
];

layerContextMenu.className = "dropdown__menu layer-context-menu";
layerContextMenu.setAttribute("role", "menu");
layerContextMenu.setAttribute("aria-label", "Layer actions");
layerContextMenu.hidden = true;
layerContextMenu.append(...layerContextActions.map(({ id, label, shortcut }) => {
  const button = document.createElement("button");
  const labelElement = document.createElement("span");
  const shortcutElement = document.createElement("span");
  button.className = "dropdown__option layer-context-menu__item";
  button.type = "button";
  button.dataset.contextAction = id;
  button.setAttribute("role", "menuitem");
  labelElement.textContent = label;
  shortcutElement.className = "layer-context-menu__shortcut";
  shortcutElement.textContent = shortcut;
  shortcutElement.setAttribute("aria-hidden", "true");
  button.append(labelElement, shortcutElement);
  return button;
}));
document.body.append(layerContextMenu);

function closeLayerContextMenu({ restoreFocus = false } = {}) {
  if (layerContextMenu.hidden) return;
  const returnFocus = layerContextMenu.returnFocus;
  layerContextMenu.hidden = true;
  layerContextMenu.returnFocus = null;
  if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) returnFocus.focus();
}

function canPasteLayerContextSelection() {
  return Boolean(
    (copiedLayerSelection?.component === currentComponent && copiedLayerSelection.copy?.layers?.length)
    || (copiedVariantSelection?.component === currentComponent && copiedVariantSelection.variants?.length),
  );
}

function writeContextClipboardToken(token) {
  if (!token || !navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(token).catch(() => {});
}

function copyLayerContextSelection() {
  const layerCopy = captureSelectedLayerCopies();
  if (layerCopy.layers.length > 0) {
    const token = `Jot layers ${crypto.randomUUID()}`;
    copiedLayerSelection = { token, component: currentComponent, copy: layerCopy };
    writeContextClipboardToken(token);
    return true;
  }
  const variants = captureSelectedVariantCopies();
  if (variants.length === 0) return false;
  const token = `Jot variants ${crypto.randomUUID()}`;
  copiedVariantSelection = { token, component: currentComponent, variants };
  writeContextClipboardToken(token);
  return true;
}

function pasteLayerContextSelection() {
  if (copiedLayerSelection?.component === currentComponent) {
    return insertLayerCopies(copiedLayerSelection.copy);
  }
  if (copiedVariantSelection?.component === currentComponent) {
    return insertVariantCopies(copiedVariantSelection.variants);
  }
  return false;
}

function deleteLayerContextSelection() {
  const nestedInstanceLayer = getSelectedNestedInstanceLayer();
  if (nestedInstanceLayer) {
    setNestedInstanceLayerOverride(nestedInstanceLayer, "visibility", "hidden");
    renderTree();
    return true;
  }
  const keys = getSelectedVariantIds().length > 0
    ? getSelectedVariantLayerTargets()
    : getSelectedLayerKeys();
  const layers = keys.flatMap((key) => {
    const [type, rawId] = key.split(":");
    const id = Number(rawId);
    return LAYER_TYPES.includes(type) && Number.isFinite(id) ? [{ type, id }] : [];
  });
  if (layers.length === 0) return false;
  deleteLayers(layers);
  return true;
}

function runLayerContextAction(action) {
  if (action === "copy") return copyLayerContextSelection();
  if (action === "paste") return pasteLayerContextSelection();
  if (action === "duplicate") return duplicateSelectedLayer();
  if (action === "front") return reorderPrimaryLayer(0, "front");
  if (action === "back") return reorderPrimaryLayer(0, "back");
  if (action === "delete") return deleteLayerContextSelection();
  return false;
}

function selectLayerContextTarget(target) {
  const treeNode = target.closest?.(".tree-node[data-selection-layer-key]");
  if (treeNode instanceof HTMLElement) {
    const componentId = Number(treeNode.dataset.selectionComponentId);
    const [type, rawId] = treeNode.dataset.selectionLayerKey.split(":");
    const id = Number(rawId);
    const component = components.find((entry) => entry.id === componentId);
    const record = component && getComponentDefinitionLayer(component.workspace, type, id);
    if (!component || !record) return false;
    const isSelected = component.id === currentComponent?.id
      && (selectedVariantId !== null
        ? isVariantLayerTargetSelected(selectedVariantId, `${type}:${id}`)
        : isLayerSelected(type, id));
    if (!isSelected) selectComponentLayerTreeNode(component, type, record);
    return true;
  }

  const hit = resolveCanvasHit(target);
  if (!hit.layer || !["layer", "variant-layer"].includes(hit.kind)) return false;
  const key = getLayerDescriptorKey(hit.layer);
  if (hit.kind === "variant-layer") {
    if (!isVariantLayerTargetSelected(hit.variantId, key)) selectVariantState(hit.variantId, key);
    return true;
  }
  if (!isLayerSelected(hit.layer.type, hit.layer.id)) {
    const record = getLayerRecord(hit.layer);
    if (!record) return false;
    selectLayerDescriptor({ type: hit.layer.type, record });
  }
  return true;
}

function openLayerContextMenu(event) {
  event.preventDefault();
  const selectedTarget = selectLayerContextTarget(event.target);
  const isCanvasContext = event.target instanceof Node
    && canvas instanceof HTMLElement
    && canvas.contains(event.target);
  if (!selectedTarget && !isCanvasContext) {
    closeLayerContextMenu();
    return;
  }
  closeLayerContextMenu();
  layerContextMenu.returnFocus = event.target instanceof HTMLElement ? event.target : null;
  const pasteButton = layerContextMenu.querySelector('[data-context-action="paste"]');
  if (pasteButton instanceof HTMLButtonElement) pasteButton.disabled = !canPasteLayerContextSelection();
  layerContextMenu.hidden = false;
  const bounds = layerContextMenu.getBoundingClientRect();
  const margin = 4;
  layerContextMenu.style.left = `${Math.max(margin, Math.min(event.clientX, window.innerWidth - bounds.width - margin))}px`;
  layerContextMenu.style.top = `${Math.max(margin, Math.min(event.clientY, window.innerHeight - bounds.height - margin))}px`;
}

document.addEventListener("contextmenu", openLayerContextMenu);
layerContextMenu.addEventListener("click", (event) => {
  const item = event.target instanceof Element ? event.target.closest("[data-context-action]") : null;
  if (!(item instanceof HTMLButtonElement) || item.disabled) return;
  runLayerContextAction(item.dataset.contextAction);
  closeLayerContextMenu();
});
layerContextMenu.addEventListener("keydown", (event) => {
  const items = Array.from(layerContextMenu.querySelectorAll("button:not(:disabled)"));
  const index = items.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    closeLayerContextMenu({ restoreFocus: true });
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  } else if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    items[event.key === "Home" ? 0 : items.length - 1]?.focus();
  }
});
document.addEventListener("pointerdown", (event) => {
  if (!layerContextMenu.hidden && !layerContextMenu.contains(event.target)) closeLayerContextMenu();
});
window.addEventListener("blur", () => closeLayerContextMenu());
window.addEventListener("resize", () => closeLayerContextMenu());
window.addEventListener("scroll", () => closeLayerContextMenu(), true);

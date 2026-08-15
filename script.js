const canvas = document.querySelector("#canvas");
const toolbar = document.querySelector(".toolbar");
const treeView = document.querySelector("[data-tree-view]");
const colorPicker = document.querySelector("#canvas-color-picker");
const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));

let activeTool = "select";
let selectedCanvasFrame = null;
let nextFrameId = 1;
let nextTextId = 1;
let frameRecords = [];
const expandedFrameIds = new Set();

function selectTool(toolName) {
  activeTool = toolName;
  canvas?.classList.toggle("is-frame-tool-active", activeTool === "frame");
  canvas?.classList.toggle("is-text-tool-active", activeTool === "text");

  toolButtons.forEach((toolButton) => {
    const isSelected = toolButton.getAttribute("data-tool") === activeTool;
    toolButton.classList.toggle("is-toggled", isSelected);
    toolButton.setAttribute("aria-pressed", String(isSelected));
  });
}

function getFrameRecord(frameId) {
  return frameRecords.find((record) => record.id === frameId);
}

function getChildRecords(parentId) {
  return frameRecords.filter((record) => record.parentId === parentId);
}

function selectCanvasFrame(frameElement) {
  frameRecords.forEach((record) => {
    const isSelected = record.element === frameElement;
    record.element.classList.toggle("is-selected", isSelected);
    record.element.setAttribute("aria-selected", String(isSelected));
  });

  selectedCanvasFrame = frameElement;
  renderTree();
}

function clearCanvasFrameSelection() {
  if (!selectedCanvasFrame) return;

  selectedCanvasFrame.classList.remove("is-selected");
  selectedCanvasFrame.setAttribute("aria-selected", "false");
  selectedCanvasFrame = null;
  renderTree();
}

function createIconCell(content) {
  const cell = document.createElement("span");
  cell.className = "icon-cell";
  if (content) cell.append(content);
  return cell;
}

function createSquareIcon() {
  const square = document.createElement("span");
  square.className = "square-icon square-icon--small";
  square.setAttribute("aria-hidden", "true");
  return square;
}

function renderTreeNode(record, depth) {
  const childRecords = getChildRecords(record.id);
  const isBranch = childRecords.length > 0;
  const isExpanded = expandedFrameIds.has(record.id);
  const item = document.createElement("div");
  const node = document.createElement("div");
  const iconGroup = document.createElement("span");
  const label = document.createElement("span");

  item.className = "dynamic-tree-item";
  node.className = "tree-node tree-node--dynamic";
  node.setAttribute("role", "treeitem");
  node.setAttribute("tabindex", "0");
  node.setAttribute("aria-level", String(depth));
  node.setAttribute("aria-selected", String(record.element === selectedCanvasFrame));
  node.style.setProperty("--tree-indent", `${8 + (depth - 1) * 40}px`);
  if (record.element === selectedCanvasFrame) node.classList.add("is-selected");
  if (isBranch) node.setAttribute("aria-expanded", String(isExpanded));

  node.addEventListener("click", () => selectCanvasFrame(record.element));
  node.addEventListener("keydown", (event) => {
    if (event.target === node && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      selectCanvasFrame(record.element);
    }
  });

  iconGroup.className = "branch-icon-group";

  if (isBranch) {
    const branchToggle = document.createElement("button");
    const chevron = document.createElement("span");

    branchToggle.className = "icon-cell branch-toggle";
    branchToggle.type = "button";
    branchToggle.setAttribute("aria-label", `${isExpanded ? "Collapse" : "Expand"} Frame ${record.id}`);
    branchToggle.setAttribute("aria-expanded", String(isExpanded));
    chevron.className = `chevron ${isExpanded ? "chevron--down" : "chevron--right"}`;
    chevron.setAttribute("aria-hidden", "true");
    branchToggle.append(chevron);
    branchToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (expandedFrameIds.has(record.id)) expandedFrameIds.delete(record.id);
      else expandedFrameIds.add(record.id);
      renderTree();
    });
    iconGroup.append(branchToggle);
  } else {
    iconGroup.append(createIconCell());
  }

  iconGroup.append(createIconCell(createSquareIcon()));
  label.className = "tree-node-label";
  label.textContent = `Frame ${record.id}`;
  node.append(iconGroup, label);
  item.append(node);

  if (isBranch && isExpanded) {
    childRecords.forEach((childRecord) => item.append(renderTreeNode(childRecord, depth + 1)));
  }

  return item;
}

function renderTree() {
  if (!treeView) return;
  const rootNodes = getChildRecords(null).map((record) => renderTreeNode(record, 1));
  treeView.replaceChildren(...rootNodes);
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

function nestFrame(draggedFrameId, parentFrameId) {
  if (!canNestFrame(draggedFrameId, parentFrameId)) return;

  const draggedRecord = getFrameRecord(draggedFrameId);
  const parentRecord = getFrameRecord(parentFrameId);
  if (!draggedRecord || !parentRecord) return;

  draggedRecord.parentId = parentFrameId;
  draggedRecord.element.style.left = "";
  draggedRecord.element.style.top = "";
  parentRecord.element.append(draggedRecord.element);
  expandedFrameIds.add(parentFrameId);
  renderTree();
}

function startEditingText(textElement) {
  textElement.contentEditable = "true";
  textElement.focus();

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(textElement);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function createCanvasText(parentRecord, x, y) {
  if (!(canvas instanceof HTMLElement)) return;

  const textId = nextTextId;
  nextTextId += 1;

  const text = document.createElement("div");
  text.className = "canvas-text";
  text.dataset.textId = String(textId);
  text.contentEditable = "false";
  text.spellcheck = false;

  if (parentRecord) {
    parentRecord.element.append(text);
  } else {
    text.style.left = `${x}px`;
    text.style.top = `${y}px`;
    canvas.insertBefore(text, toolbar);
  }

  text.addEventListener("click", (event) => {
    if (activeTool === "text" || text.isContentEditable) {
      event.stopPropagation();
      startEditingText(text);
    }
  });

  text.addEventListener("dblclick", (event) => {
    if (activeTool === "select") {
      event.stopPropagation();
      startEditingText(text);
    }
  });

  text.addEventListener("blur", () => {
    text.contentEditable = "false";
  });

  text.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      text.blur();
    }
  });

  text.addEventListener("dragstart", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  startEditingText(text);
}

function createCanvasFrame(x, y) {
  if (!(canvas instanceof HTMLElement)) return;

  const frameId = nextFrameId;
  nextFrameId += 1;

  const frame = document.createElement("div");
  const record = { id: frameId, parentId: null, element: frame };

  frame.className = "canvas-frame";
  frame.draggable = true;
  frame.dataset.frameId = String(frameId);
  frame.setAttribute("aria-label", `Frame ${frameId}`);
  frame.setAttribute("aria-selected", "false");
  frame.style.left = `${x}px`;
  frame.style.top = `${y}px`;

  frame.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target !== frame) return;

    if (activeTool === "text") {
      const frameBounds = frame.getBoundingClientRect();
      createCanvasText(
        record,
        event.clientX - frameBounds.left,
        event.clientY - frameBounds.top,
      );
      return;
    }

    selectCanvasFrame(frame);
  });

  frame.addEventListener("dragstart", (event) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(frameId));
  });

  frame.addEventListener("dragover", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  });

  frame.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const draggedFrameId = Number(event.dataTransfer.getData("text/plain"));
    if (Number.isInteger(draggedFrameId)) nestFrame(draggedFrameId, frameId);
  });

  frameRecords.push(record);
  canvas.insertBefore(frame, toolbar);
  renderTree();
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

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTool(button.getAttribute("data-tool") || "select");
  });
});

canvas?.addEventListener("click", (event) => {
  if (!(canvas instanceof HTMLElement) || event.target !== canvas) return;

  clearCanvasFrameSelection();

  const canvasBounds = canvas.getBoundingClientRect();
  const x = event.clientX - canvasBounds.left;
  const y = event.clientY - canvasBounds.top;

  if (activeTool === "text") {
    createCanvasText(null, x, y);
    return;
  }

  if (activeTool !== "frame") return;
  createCanvasFrame(x, y);
  selectTool("select");
});

document.addEventListener("keydown", (event) => {
  if (
    !selectedCanvasFrame ||
    (event.key !== "Delete" && event.key !== "Backspace")
  ) return;

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  ) return;

  event.preventDefault();
  const selectedRecord = frameRecords.find((record) => record.element === selectedCanvasFrame);
  if (!selectedRecord) return;

  const idsToDelete = collectFrameAndDescendantIds(selectedRecord.id);
  selectedCanvasFrame.remove();
  frameRecords = frameRecords.filter((record) => !idsToDelete.has(record.id));
  idsToDelete.forEach((frameId) => expandedFrameIds.delete(frameId));
  selectedCanvasFrame = null;
  renderTree();
});

colorPicker?.addEventListener("input", () => {
  if (canvas && colorPicker instanceof HTMLInputElement) {
    canvas.style.backgroundColor = colorPicker.value;
  }
});

renderTree();

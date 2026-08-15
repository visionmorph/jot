const treeNodes = Array.from(document.querySelectorAll("[data-tree-node]"));
const branchNode = document.querySelector("[data-branch-node]");
const branchToggle = document.querySelector("[data-branch-toggle]");
const childNode = document.querySelector("[data-child-node]");

function selectTreeNode(selectedNode) {
  treeNodes.forEach((node) => {
    const isSelected = node === selectedNode;
    node.classList.toggle("is-selected", isSelected);
    node.setAttribute("aria-selected", String(isSelected));
  });
}

function toggleBranch() {
  if (!branchNode || !branchToggle || !childNode) return;

  const isExpanded = branchNode.getAttribute("aria-expanded") === "true";
  const willExpand = !isExpanded;
  const chevron = branchToggle.querySelector(".chevron");

  branchNode.setAttribute("aria-expanded", String(willExpand));
  branchToggle.setAttribute("aria-expanded", String(willExpand));
  branchToggle.setAttribute("aria-label", willExpand ? "Collapse Frame" : "Expand Frame");
  childNode.hidden = !willExpand;
  chevron?.classList.toggle("chevron--down", willExpand);
  chevron?.classList.toggle("chevron--right", !willExpand);
}

treeNodes.forEach((node) => {
  const activateNode = () => selectTreeNode(node);

  node.addEventListener("click", activateNode);
  node.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activateNode();
    }
  });
});

branchToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  toggleBranch();
});

const canvas = document.querySelector("#canvas");
const toolbar = document.querySelector(".toolbar");
const toolButtons = Array.from(document.querySelectorAll("[data-tool]"));
let activeTool = "select";
let selectedCanvasFrame = null;

function selectTool(toolName) {
  activeTool = toolName;
  canvas?.classList.toggle("is-frame-tool-active", activeTool === "frame");

  toolButtons.forEach((toolButton) => {
    const isSelected = toolButton.getAttribute("data-tool") === activeTool;
    toolButton.classList.toggle("is-toggled", isSelected);
    toolButton.setAttribute("aria-pressed", String(isSelected));
  });
}

toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectTool(button.getAttribute("data-tool") || "select");
  });
});

const colorPicker = document.querySelector("#canvas-color-picker");

canvas?.addEventListener("click", (event) => {
  if (!(canvas instanceof HTMLElement)) return;

  const clickedFrame = event.target instanceof Element
    ? event.target.closest(".canvas-frame")
    : null;

  if (clickedFrame instanceof HTMLElement && canvas.contains(clickedFrame)) {
    canvas.querySelectorAll(".canvas-frame").forEach((frame) => {
      const isSelected = frame === clickedFrame;
      frame.classList.toggle("is-selected", isSelected);
      frame.setAttribute("aria-selected", String(isSelected));
    });
    selectedCanvasFrame = clickedFrame;
    return;
  }

  if (event.target !== canvas) return;

  if (selectedCanvasFrame) {
    selectedCanvasFrame.classList.remove("is-selected");
    selectedCanvasFrame.setAttribute("aria-selected", "false");
    selectedCanvasFrame = null;
  }

  if (activeTool !== "frame") return;

  const canvasBounds = canvas.getBoundingClientRect();
  const frame = document.createElement("div");
  const frameNumber = canvas.querySelectorAll(".canvas-frame").length + 1;

  frame.className = "canvas-frame";
  frame.setAttribute("aria-label", `Frame ${frameNumber}`);
  frame.setAttribute("aria-selected", "false");
  frame.style.left = `${event.clientX - canvasBounds.left}px`;
  frame.style.top = `${event.clientY - canvasBounds.top}px`;
  canvas.insertBefore(frame, toolbar);

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
  selectedCanvasFrame.remove();
  selectedCanvasFrame = null;
});

colorPicker?.addEventListener("input", () => {
  if (canvas && colorPicker instanceof HTMLInputElement) {
    canvas.style.backgroundColor = colorPicker.value;
  }
});

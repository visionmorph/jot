async function dropSvg(page, name, source) {
  const canvas = page.getByRole("region", { name: "Canvas" });
  await canvas.evaluate((element, file) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([file.source], file.name, { type: "image/svg+xml" }));
    const bounds = element.getBoundingClientRect();
    element.dispatchEvent(new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2,
      dataTransfer: transfer,
    }));
  }, { name, source });
}

async function createGroupedColorFixture(page, { splitColors = false } = {}) {
  await page.evaluate(({ split }) => {
    const root = canvasRootStack;
    root.dataset.frameColor = split ? "#336699" : "";
    root.dataset.frameColorOpacity = "100";
    root.style.backgroundColor = split ? "#336699" : "";
    root.dataset.outlineColor = split ? "" : "#336699";
    root.dataset.outlineColorOpacity = "100";
    root.dataset.outlineWeight = split ? "0" : "1";
    applyFrameOutline(root);

    const textRecord = createCanvasText(currentComponent.frameRecord, 0, 0, {
      beginEditing: false,
      isNew: false,
      textContent: "Grouped color",
    });
    const childColor = split ? "#FFFFFF" : "#336699";
    textRecord.element.dataset.textColor = childColor;
    textRecord.element.style.color = childColor;
    createCanvasVector({
      name: "Grouped icon",
      width: 24,
      height: 24,
      source: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path d="M2 2h20v20H2z" fill="${childColor}"/></svg>`,
    }, 0, 0, currentComponent.frameRecord, { select: false });
    selectComponentState(currentComponent.id);
    renderTree();
  }, { split: splitColors });
}

module.exports = { dropSvg, createGroupedColorFixture };

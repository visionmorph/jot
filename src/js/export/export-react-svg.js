/* React JSX serialization and component source generation. */

function toReactSvgAttributeName(name) {
  const lowerName = name.toLowerCase();
  const exactNames = {
    class: "className",
    tabindex: "tabIndex",
    viewbox: "viewBox",
    preserveaspectratio: "preserveAspectRatio",
    gradientunits: "gradientUnits",
    gradienttransform: "gradientTransform",
    markerwidth: "markerWidth",
    markerheight: "markerHeight",
    refx: "refX",
    refy: "refY",
    textlength: "textLength",
    lengthadjust: "lengthAdjust",
    patternunits: "patternUnits",
    patterncontentunits: "patternContentUnits",
    patterntransform: "patternTransform",
    "xlink:href": "xlinkHref",
    "xml:space": "xmlSpace",
    "xmlns:xlink": "xmlnsXlink",
  };
  if (exactNames[lowerName]) return exactNames[lowerName];
  if (lowerName.startsWith("data-") || lowerName.startsWith("aria-")) return lowerName;
  return name.replace(/[-:]([a-z])/g, (_, character) => character.toUpperCase());
}

function parseSvgStyle(styleValue) {
  const parsedStyle = document.createElement("span").style;
  parsedStyle.cssText = String(styleValue ?? "");
  return Array.from(parsedStyle).reduce((style, property) => {
    const value = parsedStyle.getPropertyValue(property).trim();
    if (!value) return style;
    const reactProperty = property.startsWith("--") ? property : toReactStyleProperty(property);
    style[reactProperty] = value;
    return style;
  }, {});
}

function getReactStyleEntries(expression) {
  const source = String(expression ?? "").trim();
  if (!source) return "";
  return source.startsWith("{ ") && source.endsWith(" }")
    ? source.slice(2, -2).trim()
    : `...${source}`;
}

function mergeReactStyleExpressions(...expressions) {
  const entries = expressions.map(getReactStyleEntries).filter(Boolean);
  return `{ ${entries.join(", ")} }`;
}

function serializeSvgElementToJsx(
  element,
  depth,
  rootStyle = null,
  rawProperties = null,
  rootClassName = "",
  options = {},
) {
  const indent = "  ".repeat(depth);
  const attributes = [];
  let inlineStyle = {};
  let existingClassName = "";
  const dynamicPaintProperties = new Set();
  const presentationPaintProperties = new Set();
  const isRoot = options.isRoot !== false;

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase() === "style") {
      inlineStyle = parseSvgStyle(attribute.value);
      return;
    }
    if (attribute.name.toLowerCase() === "class") {
      existingClassName = attribute.value;
      return;
    }
    const attributeName = attribute.name.toLowerCase();
    if (!isRoot && options.paintStyleExpression
      && ["fill", "stroke"].includes(attributeName)
      && isSolidSvgPaint(attribute.value)) {
      presentationPaintProperties.add(attributeName);
      return;
    }
    attributes.push(` ${toReactSvgAttributeName(attribute.name)}=${JSON.stringify(attribute.value)}`);
  });
  if (!isRoot && options.paintStyleExpression) {
    ["fill", "stroke"].forEach((property) => {
      if (!isSolidSvgPaint(inlineStyle[property]) && !presentationPaintProperties.has(property)) return;
      inlineStyle[property] = `${options.paintStyleExpression}?.${property}`;
      dynamicPaintProperties.add(property);
    });
  }
  const className = [existingClassName, rootClassName].filter(Boolean).join(" ");
  if (className) attributes.push(` className=${JSON.stringify(className)}`);
  const combinedStyle = rootStyle ? { ...inlineStyle, ...rootStyle } : inlineStyle;
  if (isRoot && options.rootStyleExpression) {
    attributes.push(` style={${options.rootStyleExpression}}`);
  } else if (Object.keys(combinedStyle).length > 0) {
    const combinedRawProperties = new Set([
      ...(rawProperties ?? []),
      ...dynamicPaintProperties,
    ]);
    attributes.push(` style={${formatReactStyle(combinedStyle, combinedRawProperties)}}`);
  }

  const children = Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return [serializeSvgElementToJsx(node, depth + 1, null, null, "", {
        ...options,
        isRoot: false,
        rootStyleExpression: "",
      })];
    }
    if ((node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
      && (node.textContent || "").trim().length > 0) {
      return [`${"  ".repeat(depth + 1)}{${JSON.stringify(node.textContent)}}`];
    }
    return [];
  });
  const tagName = element.tagName;
  if (children.length === 0) return `${indent}<${tagName}${attributes.join("")} />`;
  return `${indent}<${tagName}${attributes.join("")}>\n${children.join("\n")}\n${indent}</${tagName}>`;
}

function renderExportVector(
  record,
  depth,
  exportProps,
  variantStyle = {},
  className = "",
  dynamicStyleExpression = "",
) {
  const parsed = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
  const renderedSvg = record.element.querySelector("svg");
  const svgElement = renderedSvg instanceof SVGElement ? renderedSvg : parsed.documentElement;
  const visibilityProp = findVisibilityProp(exportProps, "vector", record.id);
  const { style, rawProperties } = withVisibilityStyle(
    { ...getExportVectorStyle(record), ...variantStyle },
    visibilityProp,
  );
  return serializeSvgElementToJsx(svgElement, depth, style, rawProperties, className, {
    rootStyleExpression: dynamicStyleExpression,
    paintStyleExpression: dynamicStyleExpression,
  });
}

function renderExportRichTextNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return `{${JSON.stringify(node.textContent ?? "")}}`;
  if (!(node instanceof HTMLElement)) return "";
  const content = Array.from(node.childNodes).map(renderExportRichTextNode).join("");
  const color = node.style.color;
  return color
    ? `<span style={{ color: ${JSON.stringify(color)} }}>${content}</span>`
    : content;
}

function renderExportTextContent(element, stringProp) {
  if (stringProp) return `{${stringProp.exportName}}`;
  if (!element.querySelector("[data-rich-text-color]")) {
    return `{${JSON.stringify(element.textContent || "")}}`;
  }
  return Array.from(element.childNodes).map(renderExportRichTextNode).join("");
}


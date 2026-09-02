/* SVG-to-JSX conversion and vector layer rendering for component exports. */

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
    style[reactProperty] = parsedStyle.getPropertyPriority(property) === "important"
      ? `${value} !important`
      : value;
    return style;
  }, {});
}

function serializeSvgElementToJsx(element, depth, rootStyle = null, rawProperties = null, rootClassName = "") {
  const indent = "  ".repeat(depth);
  const attributes = [];
  let inlineStyle = {};
  let existingClassName = "";

  Array.from(element.attributes).forEach((attribute) => {
    if (attribute.name.toLowerCase() === "style") {
      inlineStyle = parseSvgStyle(attribute.value);
      return;
    }
    if (attribute.name.toLowerCase() === "class") {
      existingClassName = attribute.value;
      return;
    }
    attributes.push(` ${toReactSvgAttributeName(attribute.name)}=${JSON.stringify(attribute.value)}`);
  });
  const className = [existingClassName, rootClassName].filter(Boolean).join(" ");
  if (className) attributes.push(` className=${JSON.stringify(className)}`);
  const combinedStyle = rootStyle ? { ...inlineStyle, ...rootStyle } : inlineStyle;
  if (Object.keys(combinedStyle).length > 0) attributes.push(` style={${formatReactStyle(combinedStyle, rawProperties)}}`);

  const children = Array.from(element.childNodes).flatMap((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return [serializeSvgElementToJsx(node, depth + 1)];
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

function renderExportVector(record, depth, exportProps, variantStyle = {}, className = "") {
  const parsed = new DOMParser().parseFromString(record.svgSource, "image/svg+xml");
  const renderedSvg = record.element.querySelector("svg");
  const svgElement = renderedSvg instanceof SVGElement ? renderedSvg : parsed.documentElement;
  const visibilityProp = findVisibilityProp(exportProps, "vector", record.id);
  const { style, rawProperties } = withVisibilityStyle(
    { ...getExportVectorStyle(record), ...variantStyle },
    visibilityProp,
  );
  return serializeSvgElementToJsx(svgElement, depth, style, rawProperties, className);
}

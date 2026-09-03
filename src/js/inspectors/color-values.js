/* Reusable color normalization, opacity, and HSV conversion utilities. */

function normalizeHexColor(value) {
  const match = String(value || "").trim().replace(/^#/, "").match(/^([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return "";
  const hex = match[1].length === 3
    ? [...match[1]].map((character) => character.repeat(2)).join("")
    : match[1];
  return `#${hex.toUpperCase()}`;
}

function normalizeColorOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.max(0, Math.min(100, opacity)) : 100;
}

function getColorWithOpacity(color, opacity = 100) {
  const normalizedColor = normalizeHexColor(color);
  if (!normalizedColor) return "";
  const normalizedOpacity = normalizeColorOpacity(opacity);
  if (normalizedOpacity === 100) return normalizedColor;
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16);
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16);
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16);
  const alpha = Number((normalizedOpacity / 100).toFixed(3));
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function hsvToHex(hue, saturation, value) {
  const chroma = value * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs((sector % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] = sector < 1 ? [chroma, secondary, 0]
    : sector < 2 ? [secondary, chroma, 0]
      : sector < 3 ? [0, chroma, secondary]
        : sector < 4 ? [0, secondary, chroma]
          : sector < 5 ? [secondary, 0, chroma]
            : [chroma, 0, secondary];
  const channel = (number) => Math.round((number + match) * 255).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`.toUpperCase();
}

function hexToHsv(color) {
  const normalizedColor = normalizeHexColor(color) || "#000000";
  const red = Number.parseInt(normalizedColor.slice(1, 3), 16) / 255;
  const green = Number.parseInt(normalizedColor.slice(3, 5), 16) / 255;
  const blue = Number.parseInt(normalizedColor.slice(5, 7), 16) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  let hue = 0;
  if (delta && maximum === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (delta && maximum === green) hue = 60 * (((blue - red) / delta) + 2);
  else if (delta) hue = 60 * (((red - green) / delta) + 4);
  return {
    hue: (hue + 360) % 360,
    saturation: maximum === 0 ? 0 : delta / maximum,
    value: maximum,
  };
}

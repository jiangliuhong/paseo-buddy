/**
 * Pure geometry helpers for a floating pill and expanding agent popover.
 * The collapsed pill stays anchored while the panel opens in available space.
 */
const compact = Object.freeze({ width: 104, height: 52 });
const expanded = Object.freeze({ width: 320, height: 340 });
const defaultPlacement = Object.freeze({ horizontal: "right", vertical: "below" });

function scaledSize(size, scale = 1) {
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function boundsFor(size, x, y, area) {
  return {
    width: size.width,
    height: size.height,
    x: clamp(x, area.x, area.x + Math.max(0, area.width - size.width)),
    y: clamp(y, area.y, area.y + Math.max(0, area.height - size.height)),
  };
}
function collapsedAnchor(bounds, placement = defaultPlacement, scale = 1) {
  const size = scaledSize(compact, scale);
  return {
    x: placement.horizontal === "left" ? bounds.x : bounds.x + bounds.width - size.width,
    y: placement.vertical === "above" ? bounds.y + bounds.height - size.height : bounds.y,
  };
}
function resizedLayout(current, expand, area, previousPlacement = defaultPlacement, scale = 1) {
  const compactSize = scaledSize(compact, scale);
  const expandedSize = scaledSize(expanded, scale);
  if (!expand) {
    const anchor = collapsedAnchor(current, previousPlacement, scale);
    return { bounds: boundsFor(compactSize, anchor.x, anchor.y, area), placement: defaultPlacement };
  }
  const leftX = current.x + current.width - expandedSize.width;
  const canOpenLeft = leftX >= area.x;
  const canOpenRight = current.x + expandedSize.width <= area.x + area.width;
  const horizontal = canOpenLeft || !canOpenRight ? "right" : "left";
  const x = horizontal === "right" ? leftX : current.x;

  const aboveY = current.y + current.height - expandedSize.height;
  const canOpenBelow = current.y + expandedSize.height <= area.y + area.height;
  const canOpenAbove = aboveY >= area.y;
  const vertical = canOpenBelow || !canOpenAbove ? "below" : "above";
  const y = vertical === "above" ? aboveY : current.y;

  return { bounds: boundsFor(expandedSize, x, y, area), placement: { horizontal, vertical } };
}
module.exports = { compact, expanded, scaledSize, defaultPlacement, boundsFor, collapsedAnchor, resizedLayout };

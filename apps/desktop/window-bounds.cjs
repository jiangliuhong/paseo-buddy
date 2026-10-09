/**
 * Pure geometry helpers for the floating pill.
 * Expanded panels anchor on the pill's right edge where possible.
 * Near the left edge they open to the right, keeping the pill stationary.
 */
const compact = Object.freeze({ width: 190, height: 64 });
const expanded = Object.freeze({ width: 360, height: 380 });

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function boundsFor(size, x, y, area) {
  return {
    width: size.width,
    height: size.height,
    x: clamp(x, area.x, area.x + Math.max(0, area.width - size.width)),
    y: clamp(y, area.y, area.y + Math.max(0, area.height - size.height))
  };
}
function collapsedAnchor(bounds, placement = "right") {
  return { x: placement === "left" ? bounds.x : bounds.x + bounds.width - compact.width, y: bounds.y };
}
function resizedLayout(current, expand, area, previousPlacement = "right") {
  if (!expand) {
    const anchor = collapsedAnchor(current, previousPlacement);
    return { bounds: boundsFor(compact, anchor.x, anchor.y, area), placement: previousPlacement };
  }
  const leftX = current.x + current.width - expanded.width;
  const canOpenLeft = leftX >= area.x;
  const canOpenRight = current.x + expanded.width <= area.x + area.width;
  const placement = canOpenLeft || !canOpenRight ? "right" : "left";
  const x = placement === "right" ? leftX : current.x;
  return { bounds: boundsFor(expanded, x, current.y, area), placement };
}
module.exports = { compact, expanded, boundsFor, collapsedAnchor, resizedLayout };

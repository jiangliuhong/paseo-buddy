/**
 * Pure geometry helpers for the floating pill.
 * The saved position always refers to the collapsed pill, even when expanded.
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
function collapsedAnchor(bounds) {
  return { x: bounds.x + bounds.width - compact.width, y: bounds.y };
}
function resizedBounds(current, expand, area) {
  const size = expand ? expanded : compact;
  return boundsFor(size, current.x + current.width - size.width, current.y, area);
}
module.exports = { compact, expanded, boundsFor, collapsedAnchor, resizedBounds };

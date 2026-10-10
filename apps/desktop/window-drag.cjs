const { compact, boundsFor, resizedLayout } = require("./window-bounds.cjs");

// A small dead zone keeps ordinary clicks and hand tremor from moving the pill.
function createGesture(point, anchor) {
  let dragged = false;
  return {
    move(cursor, area, expanded) {
      const dx = cursor.x - point.x;
      const dy = cursor.y - point.y;
      dragged ||= Math.hypot(dx, dy) >= 4;
      if (!dragged) return null;
      const bounds = boundsFor(compact, Math.round(anchor.x + dx), Math.round(anchor.y + dy), area);
      return expanded ? resizedLayout(bounds, true, area) : {
        bounds, placement: { horizontal: "right", vertical: "below" },
      };
    },
    get dragged() { return dragged; },
  };
}
module.exports = { createGesture };

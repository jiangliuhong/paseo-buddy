const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compact, expanded, boundsFor, collapsedAnchor, resizedBounds } = require("../window-bounds.cjs");

const area = { x: 0, y: 25, width: 1440, height: 875 };

test("expansion and collapse preserve pill right edge", () => {
  const initial = { x: 1220, y: 60, ...compact };
  const opened = resizedBounds(initial, true, area);
  assert.deepEqual(opened, { x: 1050, y: 60, ...expanded });
  assert.deepEqual(resizedBounds(opened, false, area), initial);
});
test("expanded window persists compact anchor, not expanded top-left", () => {
  const initial = { x: 1220, y: 60, ...compact };
  const opened = resizedBounds(initial, true, area);
  assert.deepEqual(collapsedAnchor(opened), { x: 1220, y: 60 });
});
test("clamps within positive-offset display work area", () => {
  const secondary = { x: 1440, y: 50, width: 1024, height: 700 };
  assert.deepEqual(boundsFor(expanded, 2500, -100, secondary),
    { x: 2104, y: 50, ...expanded });
});
test("clamps a window outside available bounds", () => {
  assert.deepEqual(boundsFor(compact, -99, 9999, area),
    { x: 0, y: 836, ...compact });
});

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compact, expanded, boundsFor, collapsedAnchor, resizedLayout } = require("../window-bounds.cjs");

const area = { x: 0, y: 25, width: 1440, height: 875 };

test("right-edge pill expands left without shifting", () => {
  const initial = { x: 1220, y: 60, ...compact };
  const opened = resizedLayout(initial, true, area);
  assert.deepEqual(opened, {
    bounds: { x: 1050, y: 60, ...expanded },
    placement: { horizontal: "right", vertical: "below" },
  });
  assert.deepEqual(resizedLayout(opened.bounds, false, area, opened.placement).bounds, initial);
});
test("left-edge pill expands right without shifting", () => {
  const initial = { x: 0, y: 60, ...compact };
  const opened = resizedLayout(initial, true, area);
  assert.deepEqual(opened, {
    bounds: { x: 0, y: 60, ...expanded },
    placement: { horizontal: "left", vertical: "below" },
  });
  assert.deepEqual(collapsedAnchor(opened.bounds, opened.placement), { x: 0, y: 60 });
  assert.deepEqual(resizedLayout(opened.bounds, false, area, opened.placement).bounds, initial);
});
test("bottom-edge pill expands above without shifting", () => {
  const initial = { x: 1200, y: 820, ...compact };
  const opened = resizedLayout(initial, true, area);
  assert.deepEqual(opened, {
    bounds: { x: 1030, y: 504, ...expanded },
    placement: { horizontal: "right", vertical: "above" },
  });
  assert.deepEqual(collapsedAnchor(opened.bounds, opened.placement), { x: 1200, y: 820 });
  assert.deepEqual(resizedLayout(opened.bounds, false, area, opened.placement).bounds, initial);
});
test("top-left and bottom-right positions persist after opening", () => {
  for (const initial of [
    { x: 0, y: 25, ...compact },
    { x: 1200, y: 820, ...compact },
    { x: 40, y: 700, ...compact }
  ]) {
    const opened = resizedLayout(initial, true, area);
    assert.deepEqual(collapsedAnchor(opened.bounds, opened.placement),
      { x: initial.x, y: initial.y });
  }
});
test("bounds clamp to a positive-offset secondary display", () => {
  const secondary = { x: 1440, y: 50, width: 1024, height: 700 };
  assert.deepEqual(boundsFor(expanded, 2500, -100, secondary),
    { x: 2104, y: 50, ...expanded });
});
test("bounds clamp outside available work area", () => {
  assert.deepEqual(boundsFor(compact, -99, 9999, area),
    { x: 0, y: 836, ...compact });
});

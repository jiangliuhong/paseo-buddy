const { test } = require("node:test");
const assert = require("node:assert/strict");
const { compact, expanded, boundsFor, collapsedAnchor, resizedLayout } = require("../window-bounds.cjs");

const area = { x: 0, y: 25, width: 1440, height: 875 };
test("opening to the left keeps the pill anchored to the right", () => {
  const initial = { x: 1220, y: 60, ...compact };
  const opened = resizedLayout(initial, true, area);
  assert.deepEqual(opened, { bounds: { x: 1050, y: 60, ...expanded }, placement: "right" });
  assert.deepEqual(resizedLayout(opened.bounds, false, area, opened.placement).bounds, initial);
});
test("left-edge pill opens panel to the right without moving the pill", () => {
  const initial = { x: 0, y: 60, ...compact };
  const opened = resizedLayout(initial, true, area);
  assert.deepEqual(opened, { bounds: { x: 0, y: 60, ...expanded }, placement: "left" });
  assert.deepEqual(collapsedAnchor(opened.bounds, opened.placement), { x: 0, y: 60 });
  assert.deepEqual(resizedLayout(opened.bounds, false, area, opened.placement).bounds, initial);
});
test("expanded placement persists the original collapsed anchor", () => {
  const initial = { x: 1220, y: 60, ...compact };
  const opened = resizedLayout(initial, true, area);
  assert.deepEqual(collapsedAnchor(opened.bounds, opened.placement), { x: 1220, y: 60 });
});
test("clamps bounds to a positive-offset secondary display", () => {
  const secondary = { x: 1440, y: 50, width: 1024, height: 700 };
  assert.deepEqual(boundsFor(expanded, 2500, -100, secondary),
    { x: 2104, y: 50, ...expanded });
});
test("clamps a window outside available bounds", () => {
  assert.deepEqual(boundsFor(compact, -99, 9999, area),
    { x: 0, y: 836, ...compact });
});

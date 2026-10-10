const test = require('node:test');
const assert = require('node:assert/strict');
const {createGesture} = require('../window-drag.cjs');
const {collapsedAnchor, compact, resizedLayout} = require('../window-bounds.cjs');
const display = {x:0,y:0,width:1440,height:900};

test('click jitter stays stationary; dragging stays a drag even when returning to the start',()=>{
  const gesture=createGesture({x:100,y:100},{x:80,y:80});
  assert.equal(gesture.move({x:102,y:101},display,false),null);
  assert.equal(gesture.dragged,false);
  assert.ok(gesture.move({x:105,y:100},display,false));
  assert.equal(gesture.dragged,true);
  gesture.move({x:100,y:100},display,false);
  assert.equal(gesture.dragged,true);
});
test('pill reaches the full display bottom beyond the Dock work area',()=>{
  const gesture=createGesture({x:100,y:100},{x:80,y:80});
  const result=gesture.move({x:100,y:1000},display,false);
  assert.equal(result.bounds.y,848);
  assert.equal(result.bounds.y+result.bounds.height,900);
});
test('dragging an expanded pill down flips the panel above and preserves its bottom anchor',()=>{
  const gesture=createGesture({x:100,y:100},{x:80,y:80});
  const result=gesture.move({x:100,y:1000},display,true);
  assert.equal(result.placement.vertical,'above');
  assert.deepEqual(collapsedAnchor(result.bounds,result.placement),{x:80,y:848});
  const collapsed=resizedLayout(result.bounds,false,display,result.placement);
  assert.deepEqual(collapsed.bounds,{x:80,y:848,...compact});
});
test('dragging can move to a monitor with negative screen coordinates',()=>{
  const secondary={x:-1440,y:0,width:1440,height:900};
  const gesture=createGesture({x:100,y:100},{x:80,y:80});
  assert.equal(gesture.move({x:-100,y:200},secondary,false).bounds.x,-120);
});

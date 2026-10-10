import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { displaySchema, displaySettings } from '../build/shared/display-settings.js';
import { createDisplayMirror } from '../build/server/display-settings.js';

function source(read = async()=>({status:'ready',revision:'r1',values:{opacity:0.6,scale:1.25}})) {
  let listener;let removed=false;
  return {read,subscribe(fn){listener=fn;return ()=>{removed=true;};},emit:state=>listener(state),get removed(){return removed;}};
}
const values = mirror => JSON.parse(readFileSync(mirror.file,'utf8'));

test('verified host settings schema has safe defaults and bounds',()=>{
  assert.equal(displaySettings.scope,'host');
  assert.deepEqual(displaySchema.parse({}),{opacity:1,scale:1});
  for(const value of [{opacity:0},{opacity:1.1},{opacity:NaN},{scale:0},{scale:2},{scale:Infinity}])assert.equal(displaySchema.safeParse(value).success,false);
});
test('initial hydration and subscribed saves atomically update the private appearance mirror',async(t)=>{
  const settings=source();const mirror=createDisplayMirror(settings);t.after(()=>mirror.stop());
  await mirror.ready;assert.deepEqual(values(mirror),{opacity:0.6,scale:1.25});
  assert.equal(statSync(mirror.file).mode&0o777,0o600);
  settings.emit({status:'ready',values:{opacity:0.3,scale:1.5,ignored:'not mirrored'}});
  assert.deepEqual(values(mirror),{opacity:0.3,scale:1.5});
  settings.emit({status:'invalid',error:'bad data'});
  assert.deepEqual(values(mirror),{opacity:0.3,scale:1.5});
  mirror.stop();assert.equal(settings.removed,true);assert.equal(existsSync(mirror.file),false);
});
test('live changes take precedence over a stale initial read',async(t)=>{
  let resolve;const settings=source(()=>new Promise(r=>resolve=r));const mirror=createDisplayMirror(settings);t.after(()=>mirror.stop());
  settings.emit({status:'ready',values:{opacity:0.5,scale:0.75}});
  resolve({status:'ready',values:{opacity:1,scale:1}});await mirror.ready;
  assert.deepEqual(values(mirror),{opacity:0.5,scale:0.75});
});
test('cleanup releases a pending hydration and cannot recreate the mirror afterward',async()=>{
  let resolve;const settings=source(()=>new Promise(r=>resolve=r));const mirror=createDisplayMirror(settings);
  mirror.stop();await mirror.ready;
  resolve({status:'ready',values:{opacity:0.5,scale:1.5}});await Promise.resolve();
  assert.equal(existsSync(mirror.file),false);
});

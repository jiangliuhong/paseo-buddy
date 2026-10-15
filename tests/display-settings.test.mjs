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
const heightDefaults = {listMinHeight:140,listMaxHeight:360};
const identityDefaults = {...heightDefaults,showIcon:true,showText:true,customText:'Buddy'};

test('verified host settings schema has safe defaults and bounds',()=>{
  assert.equal(displaySettings.scope,'host');
  assert.deepEqual(displaySchema.parse({}),{opacity:1,scale:1,...identityDefaults});
  assert.equal(displaySettings.version,1);
  for(const value of [{opacity:0},{opacity:1.1},{opacity:NaN},{scale:0},{scale:2},{scale:Infinity},{showIcon:'false'},{showText:0},{customText:'a'.repeat(33)},{customText:'two\nlines'},{customText:'two\u2028lines'}])assert.equal(displaySchema.safeParse(value).success,false);
});
test('legacy appearance values gain identity defaults without resetting opacity or scale',()=>{
  assert.deepEqual(displaySchema.parse({opacity:0.6,scale:1.25}),{opacity:0.6,scale:1.25,...identityDefaults});
  assert.deepEqual(displaySchema.parse({showIcon:false,showText:false,customText:'  小助手 🐾  '}),
    {opacity:1,scale:1,showIcon:false,showText:false,customText:'小助手 🐾',...heightDefaults});
  assert.equal(displaySchema.parse({customText:''}).customText,'');
});
test('initial hydration and subscribed saves atomically update the private appearance mirror',async(t)=>{
  const settings=source();const mirror=createDisplayMirror(settings);t.after(()=>mirror.stop());
  await mirror.ready;assert.deepEqual(values(mirror),{opacity:0.6,scale:1.25,...identityDefaults});
  assert.equal(statSync(mirror.file).mode&0o777,0o600);
  settings.emit({status:'ready',values:{opacity:0.3,scale:1.5,showIcon:false,showText:false,customText:'My agents',ignored:'not mirrored'}});
  assert.deepEqual(values(mirror),{opacity:0.3,scale:1.5,showIcon:false,showText:false,customText:'My agents',...heightDefaults});
  settings.emit({status:'invalid',error:'bad data'});
  settings.emit({status:'ready',values:{customText:'invalid\nlabel'}});
  assert.deepEqual(values(mirror),{opacity:0.3,scale:1.5,showIcon:false,showText:false,customText:'My agents',...heightDefaults});
  mirror.stop();assert.equal(settings.removed,true);assert.equal(existsSync(mirror.file),false);
});
test('live changes take precedence over a stale initial read',async(t)=>{
  let resolve;const settings=source(()=>new Promise(r=>resolve=r));const mirror=createDisplayMirror(settings);t.after(()=>mirror.stop());
  settings.emit({status:'ready',values:{opacity:0.5,scale:0.75,showText:false,customText:'Keep live label',...heightDefaults}});
  resolve({status:'ready',values:{opacity:1,scale:1}});await mirror.ready;
  assert.deepEqual(values(mirror),{opacity:0.5,scale:0.75,showIcon:true,showText:false,customText:'Keep live label',...heightDefaults});
});
test('cleanup releases a pending hydration and cannot recreate the mirror afterward',async()=>{
  let resolve;const settings=source(()=>new Promise(r=>resolve=r));const mirror=createDisplayMirror(settings);
  mirror.stop();await mirror.ready;
  resolve({status:'ready',values:{opacity:0.5,scale:1.5}});await Promise.resolve();
  assert.equal(existsSync(mirror.file),false);
});

test('list height bounds reject invalid pairs and mirror valid live changes',async(t)=>{
  for(const value of [{listMinHeight:99},{listMaxHeight:601},{listMinHeight:140.5},{listMinHeight:400,listMaxHeight:360},{listMaxHeight:NaN}])
    assert.equal(displaySchema.safeParse(value).success,false);
  const settings=source();const mirror=createDisplayMirror(settings);t.after(()=>mirror.stop());await mirror.ready;
  settings.emit({status:'ready',values:{listMinHeight:100,listMaxHeight:280}});
  assert.deepEqual(values(mirror),{opacity:1,scale:1,...identityDefaults,listMinHeight:100,listMaxHeight:280});
  settings.emit({status:'ready',values:{listMinHeight:500,listMaxHeight:200}});
  assert.equal(values(mirror).listMinHeight,100);
  assert.equal(values(mirror).listMaxHeight,280);
});

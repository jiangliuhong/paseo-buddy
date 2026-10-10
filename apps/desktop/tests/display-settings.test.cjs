const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {parseDisplaySettings,readDisplaySettings,watchDisplaySettings}=require('../display-settings.cjs');
const {compact,scaledSize,collapsedAnchor,resizedLayout}=require('../window-bounds.cjs');
const {createGesture}=require('../window-drag.cjs');

test('appearance reader rejects unsafe dimensions and invisible opacity',()=>{
  for(const value of [null,[],{opacity:0,scale:1},{opacity:1,scale:99},{opacity:'0.5',scale:1},{opacity:1,scale:NaN}])assert.equal(parseDisplaySettings(value),null);
  assert.deepEqual(parseDisplaySettings({opacity:0.5,scale:1.25,extra:'ignored'}),{opacity:0.5,scale:1.25});
});
test('directory watch follows repeated atomic replacements and keeps valid settings after bad data',async(t)=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buddy-display-watch-'));const file=path.join(dir,'display.json');
  fs.writeFileSync(file,JSON.stringify({opacity:1,scale:1}));const received=[];
  const stop=watchDisplaySettings(file,values=>received.push(values));t.after(()=>{stop();fs.rmSync(dir,{recursive:true,force:true});});
  const write=value=>{fs.writeFileSync(path.join(dir,'next.json'),JSON.stringify(value));fs.renameSync(path.join(dir,'next.json'),file);};
  const until=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.fail('No appearance update');};
  write({opacity:0.5,scale:1.5});await until(()=>received.at(-1)?.scale===1.5);
  write({opacity:0.8,scale:0.75});await until(()=>received.at(-1)?.scale===0.75);
  write({opacity:0,scale:8});await new Promise(r=>setTimeout(r,60));assert.deepEqual(received.at(-1),{opacity:0.8,scale:0.75});
  assert.equal(readDisplaySettings(file),null);
});
test('all size presets preserve the pill anchor when opening and closing at the bottom',()=>{
  const area={x:0,y:0,width:1440,height:900};
  for(const scale of [0.75,1,1.25,1.5]){
    const initial={x:1100,y:760,...scaledSize(compact,scale)};
    const opened=resizedLayout(initial,true,area,undefined,scale);
    assert.equal(opened.placement.vertical,'above');
    assert.deepEqual(collapsedAnchor(opened.bounds,opened.placement,scale),{x:1100,y:760});
    assert.deepEqual(resizedLayout(opened.bounds,false,area,opened.placement,scale).bounds,initial);
    const drag=createGesture({x:100,y:100},{x:1100,y:760});
    const moved=drag.move({x:80,y:70},area,true,scale);
    assert.deepEqual(collapsedAnchor(moved.bounds,moved.placement,scale),{x:1080,y:730});
  }
});

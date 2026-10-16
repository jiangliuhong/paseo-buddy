import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { nativePublisher } from '../build/server/desktop-companion.js';

function fixture(){const stdin=new EventEmitter();const writes=[];stdin.destroyed=false;stdin.write=value=>{writes.push(JSON.parse(value));return writes.length!==1;};return {stdin,writes,publisher:nativePublisher({stdin})};}
const session=(id,text)=>({sessionId:id,projectId:'p',workspaceId:'w',agentId:randomUUID(),workspaceName:'W',agentReady:true,
  connection:'connected',status:'idle',delivery:'accepted',epoch:'epoch',messages:[{key:'e:0:0',role:'assistant',text,truncated:false}],partial:false,error:null});

test('chat results survive snapshot coalescing and only the latest transcript per session is retained',()=>{
  const {stdin,writes,publisher}=fixture();const id=randomUUID();
  publisher.publish({connection:'connecting',agents:[]});
  publisher.quickChat({kind:'session',session:session(id,'old')});
  publisher.quickChat({kind:'session',session:session(id,'latest')});
  const result={kind:'result',requestId:randomUUID(),ok:true,error:null};publisher.quickChat(result);
  publisher.notify({id:'a'.repeat(64),agentName:'Agent',outcome:'completed'});
  stdin.emit('drain');
  assert.deepEqual(writes[1],{quickChat:result});assert.equal(writes[2].quickChat.session.messages[0].text,'latest');
  assert.ok(!JSON.stringify(writes).includes('old'));assert.equal(writes[3].notification.outcome,'completed');publisher.stop();
});

test('chat overflow emits a resync signal instead of silently presenting a partial delivery queue',()=>{
  const {stdin,writes,publisher}=fixture();publisher.publish({connection:'connected',agents:[]});
  for(let i=0;i<40;i++)publisher.quickChat({kind:'result',requestId:randomUUID(),ok:true,error:null});
  stdin.emit('drain');assert.ok(writes.some(frame=>frame.quickChat?.kind==='resync_required'));assert.ok(writes.length<=34);
  const count=writes.length;publisher.stop();publisher.quickChat({kind:'resync_required'});assert.equal(writes.length,count);
});

test('unknown result fields cannot leak credentials or paths into a chat envelope',()=>{
  const {stdin,writes,publisher}=fixture();publisher.quickChat({kind:'result',requestId:randomUUID(),ok:true,error:null,credential:'secret'});
  stdin.emit('drain');assert.deepEqual(writes,[{quickChat:{kind:'resync_required'}}]);assert.ok(!JSON.stringify(writes).includes('secret'));publisher.stop();
});

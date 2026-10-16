import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createQuickChatService } from '../build/server/quick-chat.js';
import { quickChatCommandSchema, quickChatMessageSchema } from '../build/shared/quick-chat.js';
import { parseAgentDeepLink } from '@getpaseo/protocol/agent-deep-link';

const project={projectId:'project',projectDisplayName:'Buddy',projectRootPath:'/private/project',projectKind:'git'};
const workspace={...project,id:'existing',name:'main',title:null,workspaceDirectory:'/private/project',archivingAt:null};
const profile={id:'saved',name:'My coding',provider:'codex',model:'model',modeId:'review',thinkingOptionId:'medium',featureValues:{speed:true}};
const command=(type,fields={})=>({type,requestId:randomUUID(),...fields});
const create=(fields={})=>command('quick_chat_create',{draftId:randomUUID(),projectId:'project',workspaceId:'existing',selection:{kind:'profile',profileId:'saved'},messageId:randomUUID(),text:'你好',...fields});
const row=(seq,role,text,messageId)=>({provider:'codex',item:{type:role+'_message',text,...(messageId?{messageId}: {})},timestamp:'2026-10-16T12:00:00Z',seqStart:seq,seqEnd:seq,sourceSeqRanges:[],collapsed:[]});
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await wait(3);}assert.fail('Condition did not become true');}
function fixture(t,overrides={}) {
  const calls=[];const updates=[];const agents=new Map();const workspaces=new Map([[workspace.id,{...workspace}]]);
  const listeners=new Map();const connections=[];
  let epoch='epoch-a';let entries=[];let status='idle';let permissions=[];
  let models=[{id:'model',provider:'codex',label:'Model',isDefault:true,thinkingOptions:[{id:'medium',label:'Medium'}]}];
  const api={
    config:{get:async()=>({config:{agentProfiles:[profile],providers:{secret:'credential'},env:{key:'secret'}}})},
    projects:{list:async()=>({projects:[project]})},
    providers:{listAvailable:async()=>({providers:[{provider:'codex',available:true}],error:null}),
      listModels:async()=>({models,error:null}),listModes:async()=>({modes:[{id:'review',label:'Review'}],error:null})},
    workspaces:{list:async options=>({entries:[...workspaces.values()].filter(w=>w.projectId===options.filter.projectId),pageInfo:{hasMore:false}}),
      create:async options=>{calls.push(['workspace',options]);const w={...workspace,id:options.workspaceId,name:'Paseo title'};workspaces.set(w.id,w);return {current:()=>w};},
      ref:input=>{const id=typeof input==='string'?input:input.id;return {
        refresh:async()=>workspaces.get(id)??null,
        agents:{create:async options=>{calls.push(['agent',options,id]);const agent={id:options.agentId,workspaceId:id,status:'idle',pendingPermissions:[]};agents.set(agent.id,agent);return {id:agent.id};}},
      };}},
    agents:{ref:id=>({
      send:async(text,options)=>{calls.push(['send',text,options]);entries.push(row(entries.length,'user',text,options.messageId));},
      timeline:{refetch:async options=>{calls.push(['history',options]);return {agent:{...agents.get(id),status,pendingPermissions:permissions},epoch,entries:[...entries],hasOlder:false,hasNewer:false,gap:false,staleCursor:false,error:null};},
        subscribe:handler=>{calls.push(['subscribe',id]);listeners.set(id,handler);const unsubscribe=()=>{calls.push(['release',id]);listeners.delete(id);};unsubscribe.release=async()=>unsubscribe();unsubscribe.ready=Promise.resolve();return unsubscribe;},
      },
    })},
  };
  const connect=async signal=>{
    calls.push(['connect',signal]);
    const conn={api,serverId:'local',hasProfiles:true,canCreate:true,online:true,connected(){return this.online;},async close(){this.online=false;calls.push(['close']);}};
    connections.push(conn);return conn;
  };
  const service=createQuickChatService({connect,publish:update=>{assert.equal(quickChatMessageSchema.safeParse(update).success,true);updates.push(update);},pollMs:3,retryBaseMs:1,syncDelayMs:1,timeoutMs:100,...overrides});
  t.after(()=>service.stop());
  return {api,service,calls,updates,agents,workspaces,listeners,connections,
    set models(value){models=value;},set entries(value){entries=value;},set epoch(value){epoch=value;},set status(value){status=value;},set permissions(value){permissions=value;},
    event(event={type:'timeline'}){for(const [agentId,listener]of listeners)listener({agentId,event});}};
}

test('contracts reject arbitrary endpoints, cwd, shell, workspace naming and unbounded input',()=>{
  for(const extra of [{cwd:'/tmp'},{serverId:'remote'},{endpoint:'ws://remote'},{shell:'echo bad'},{title:'name'}])assert.equal(quickChatCommandSchema.safeParse({...create(),...extra}).success,false);
  assert.equal(quickChatCommandSchema.safeParse(create({text:' '})).success,false);
  assert.equal(quickChatCommandSchema.safeParse(create({text:'x'.repeat(16001)})).success,false);
  assert.equal(quickChatCommandSchema.safeParse(create({selection:{kind:'model',providerId:'codex',modelId:'model',modeId:'bypass'}})).success,false);
});

test('service is lazy; options expose sanitized metadata and preserve exact model IDs',async t=>{
  const f=fixture(t);assert.equal(f.calls.length,0);
  const result=await f.service.handle(command('quick_chat_options',{projectId:'project',providerId:'codex'}));
  assert.equal(result.ok,true);assert.equal(result.options.profiles[0].modeId,'review');
  assert.equal(result.options.models[0].id,'model');assert.equal(result.options.workspaces[0].id,'existing');
  const output=JSON.stringify(result);assert.ok(!output.includes('/private/'));assert.ok(!output.includes('secret'));assert.ok(!output.includes('featureValues'));
  assert.equal(f.calls.filter(call=>['workspace','agent','send'].includes(call[0])).length,0);
});

test('existing workspace creation copies the profile and subscribes before the first send',async t=>{
  const f=fixture(t);const request=create();const result=await f.service.handle(request);
  assert.equal(result.ok,true);assert.equal(result.session.sessionId,request.draftId);assert.equal(result.session.delivery,'accepted');
  assert.equal(result.session.messages[0].text,'你好');assert.equal(result.session.messages[0].role,'user');
  assert.deepEqual(parseAgentDeepLink(result.session.conversationUrl),{serverId:'local',agentId:result.session.agentId});
  const creation=f.calls.find(call=>call[0]==='agent');
  assert.equal(creation[2],'existing');assert.deepEqual(creation[1].config,{provider:'codex/model',modeId:'review',thinkingOptionId:'medium',featureValues:{speed:true}});
  assert.equal(creation[1].prompt,undefined);assert.equal(f.calls.filter(call=>call[0]==='workspace').length,0);
  assert.ok(f.calls.findIndex(call=>call[0]==='subscribe')<f.calls.findIndex(call=>call[0]==='send'));
});

test('new workspaces pass first-message naming context and no explicit names',async t=>{
  const f=fixture(t);const request=create({workspaceId:null});const result=await f.service.handle(request);
  assert.equal(result.ok,true);const input=f.calls.find(call=>call[0]==='workspace')[1];
  assert.deepEqual(input.source,{kind:'directory',projectId:'project',path:'/private/project'});
  assert.deepEqual(input.firstAgentContext,{prompt:'你好'});assert.equal(input.title,undefined);assert.equal(input.agent,undefined);
  assert.equal(result.session.workspaceName,'Paseo title');assert.equal(f.calls.find(call=>call[0]==='agent')[2],input.workspaceId);
});

test('manual Provider/model path works without reading unsupported profile config',async t=>{
  const f=fixture(t);f.api.config.get=async()=>{throw Error('must not read unsupported config');};
  // This fixture's factory is wrapped to turn off the profile capability.
  const manual=createQuickChatService({publish(){},connect:async signal=>{const conn={api:f.api,serverId:'local',canCreate:true,hasProfiles:false,connected:()=>true,close:async()=>{}};return conn;}});
  t.after(()=>manual.stop());
  const result=await manual.handle(create({selection:{kind:'model',providerId:'codex',modelId:'model'}}));
  assert.equal(result.ok,true);assert.deepEqual(f.calls.find(call=>call[0]==='agent')[1].config,{provider:'codex/model'});
});

test('invalid projects, workspaces, profiles, modes and model IDs never reach a write',async t=>{
  const f=fixture(t);
  for(const fields of [{projectId:'other'},{workspaceId:'other'},{selection:{kind:'profile',profileId:'missing'}},{selection:{kind:'model',providerId:'codex',modelId:'wrong'}}]) {
    assert.equal((await f.service.handle(create(fields))).error,'invalid_selection');
  }
  f.api.providers.listModes=async()=>({modes:[],error:null});
  assert.equal((await f.service.handle(create())).error,'invalid_selection');
  assert.equal(f.calls.filter(call=>['workspace','agent','send'].includes(call[0])).length,0);
});

test('pre-write validation failure explicitly releases a draft for editing',async t=>{
  const f=fixture(t);const request=create({selection:{kind:'profile',profileId:'deleted'}});
  const result=await f.service.handle(request);
  assert.equal(result.error,'invalid_selection');assert.equal(result.draftEditable,true);
  assert.equal(f.calls.filter(call=>['workspace','agent','send'].includes(call[0])).length,0);
  assert.equal((await f.service.handle({...request,requestId:randomUUID(),selection:{kind:'profile',profileId:'saved'}})).ok,true);
});

test('creation attempts with unknown outcomes never release drafts for editing',async t=>{
  const f=fixture(t);
  f.api.workspaces.create=async()=>{throw Error('response lost');};
  const result=await f.service.handle(create({workspaceId:null}));
  assert.equal(result.error,'outcome_unknown');assert.equal(result.draftEditable,undefined);
});

test('duplicate requests/drafts/messages are idempotent; changed content conflicts',async t=>{
  const f=fixture(t);const request=create();
  const results=await Promise.all([f.service.handle(request),f.service.handle(request)]);assert.ok(results.every(r=>r.ok));
  assert.equal((await f.service.handle({...request,requestId:randomUUID()})).ok,true);
  assert.equal((await f.service.handle({...request,text:'changed'})).error,'request_conflict');
  assert.equal((await f.service.handle({...request,requestId:randomUUID(),text:'changed'})).error,'request_conflict');
  const next=command('quick_chat_send',{sessionId:request.draftId,messageId:randomUUID(),text:'继续'});
  assert.equal((await f.service.handle(next)).ok,true);
  assert.equal((await f.service.handle({...next,requestId:randomUUID()})).ok,true);
  assert.equal((await f.service.handle({...next,requestId:randomUUID(),text:'changed'})).error,'request_conflict');
  assert.equal(f.calls.filter(call=>call[0]==='agent').length,1);assert.equal(f.calls.filter(call=>call[0]==='send').length,2);
});

test('sends are rejected when authoritative snapshots show running or permission-blocked agents',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  for(const permission of [false,true]){
    f.status=permission?'idle':'running';f.permissions=permission?[{requestId:'permission'}]:[];
    const result=await f.service.handle(command('quick_chat_send',{sessionId:request.draftId,messageId:randomUUID(),text:'next'}));
    assert.equal(result.error,'busy');
    assert.equal(f.updates.at(-1).session.status,permission?'waiting_permission':'running');
  }
  assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
});

test('a pending timeline handshake must become ready before sending',async t=>{
  const f=fixture(t);const original=f.api.agents.ref;let ready;
  f.api.agents.ref=id=>{const handle=original(id);const subscribe=handle.timeline.subscribe;
    handle.timeline.subscribe=handler=>{const subscription=subscribe(handler);subscription.ready=new Promise(resolve=>ready=resolve);return subscription;};return handle;};
  const pending=f.service.handle(create());await until(()=>!!ready);
  assert.equal(f.calls.filter(call=>call[0]==='send').length,0);ready();
  assert.equal((await pending).ok,true);assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
});

test('resume refreshes Paseo-generated workspace titles',async t=>{
  const f=fixture(t);const request=create({workspaceId:null});const first=await f.service.handle(request);
  f.workspaces.get(first.session.workspaceId).title='New automatic title';
  const result=await f.service.handle(command('quick_chat_resume',{sessionId:request.draftId}));
  assert.equal(result.ok,true);assert.equal(result.session.workspaceName,'New automatic title');
});

test('canonical snapshots replace stream updates without duplicate messages and invalidate epochs',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  f.entries=[row(1,'assistant','Hel','answer')];f.event();f.event();
  await until(()=>f.updates.at(-1)?.session.messages[0]?.text==='Hel');
  f.entries=[row(1,'assistant','Hello','answer')];f.event();
  await until(()=>f.updates.at(-1)?.session.messages[0]?.text==='Hello');
  assert.equal(f.updates.at(-1).session.messages.length,1);
  f.epoch='epoch-b';f.entries=[row(0,'assistant','Replacement','new')];f.event({type:'replacement',epoch:'epoch-b'});
  await until(()=>f.updates.at(-1)?.session.epoch==='epoch-b');
  assert.equal(f.updates.at(-1).session.messages[0].key,'epoch-b:0:0');
  assert.ok(f.updates.every(message=>message.kind==='session')); // No completion-notification path.
});

test('history windows and individual message text are bounded and explicitly truncated',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  f.entries=Array.from({length:100},(_,i)=>row(i,'assistant','x'.repeat(5000)));
  const result=await f.service.handle(command('quick_chat_resume',{sessionId:request.draftId}));
  assert.equal(result.ok,true);assert.equal(result.session.partial,true);
  assert.ok(result.session.messages.length<=60);assert.ok(result.session.messages.every(message=>message.text.length===4096&&message.truncated));
  assert.ok(Buffer.byteLength(JSON.stringify(result))<256*1024);
});

test('ambiguous send preserves identity, never resends automatically, and recovers via history',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  const ref=f.api.agents.ref;
  f.api.agents.ref=id=>{const handle=ref(id);handle.send=async()=>{throw Error('credential /private/path');};return handle;};
  const next=command('quick_chat_send',{sessionId:request.draftId,messageId:randomUUID(),text:'uncertain'});
  const result=await f.service.handle(next);assert.equal(result.error,'outcome_unknown');
  assert.equal((await f.service.handle({...next,requestId:randomUUID()})).error,'outcome_unknown');
  f.entries=[row(1,'user','uncertain',next.messageId)];
  const resumed=await f.service.handle(command('quick_chat_resume',{sessionId:request.draftId}));
  assert.equal(resumed.ok,true);assert.equal(resumed.session.delivery,'accepted');
  assert.equal((await f.service.handle({...next,requestId:randomUUID()})).ok,true);
  assert.ok(!JSON.stringify(f.updates).includes('credential'));
});

test('native delivery proof preserves clientMessageId when the Provider supplies a different message ID',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  f.entries=[{...row(1,'user','你好','provider-message'),item:{type:'user_message',text:'你好',messageId:'provider-message',clientMessageId:request.messageId}}];
  const result=await f.service.handle(command('quick_chat_resume',{sessionId:request.draftId}));
  assert.equal(result.ok,true);assert.equal(result.session.messages[0].messageId,request.messageId);
});

test('reconnect retries failed history reads without requiring a new timeline event',async t=>{
  const f=fixture(t);await f.service.handle(create());
  const ref=f.api.agents.ref;let failed=false;
  f.api.agents.ref=id=>{const handle=ref(id);const read=handle.timeline.refetch;
    handle.timeline.refetch=async options=>{
      if(!failed){failed=true;return {error:'temporary read failure'};}
      return read(options);
    };return handle;};
  f.entries=[row(5,'assistant','recovered without events','answer')];
  f.connections[0].online=false;
  await until(()=>f.updates.at(-1)?.session.messages[0]?.text==='recovered without events');
  assert.equal(failed,true);assert.ok(f.connections.length>=3);
  assert.equal(f.calls.filter(call=>call[0]==='agent').length,1);
  assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
});

test('disconnect reconnects with fresh config discovery, replaces missed history and rejects old callbacks',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  const oldCallback=[...f.listeners.values()][0];f.connections[0].online=false;
  f.epoch='reconnect';f.entries=[row(5,'assistant','missed reply','reply')];
  await until(()=>f.connections.length===2&&f.updates.at(-1)?.session.epoch==='reconnect');
  const count=f.updates.length;oldCallback({agentId:[...f.agents.keys()][0],event:{type:'error',error:'late'}});await wait(10);
  assert.equal(f.connections.length,2);assert.equal(f.updates.length,count);
  assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
  assert.ok(f.updates.some(update=>update.session.connection==='disconnected'));
});

test('creation timeout retains caller-selected IDs and reuses the receipt on an explicit retry',async t=>{
  const f=fixture(t,{timeoutMs:20});const original=f.api.workspaces.create;let first=true;let timedInput;
  f.api.workspaces.create=async input=>{if(first){first=false;timedInput=input;await new Promise(()=>{});}return original(input);};
  const request=create({workspaceId:null});const failed=await f.service.handle(request);
  assert.equal(failed.error,'outcome_unknown');await wait(10);
  const result=await f.service.handle({...request,requestId:randomUUID()});assert.equal(result.ok,true);
  const retried=f.calls.find(call=>call[0]==='workspace')[1];assert.deepEqual(retried,timedInput);
  assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
});

test('an Agent creation timeout reuses its ID without creating another workspace',async t=>{
  const f=fixture(t,{timeoutMs:20});const original=f.api.workspaces.ref;let first=true;let timedInput;
  f.api.workspaces.ref=input=>{const handle=original(input);const create=handle.agents.create;
    handle.agents.create=async options=>{if(first){first=false;timedInput=options;await new Promise(()=>{});}return create(options);};return handle;};
  const request=create({workspaceId:null});assert.equal((await f.service.handle(request)).error,'outcome_unknown');await wait(10);
  const retried=await f.service.handle({...request,requestId:randomUUID()});assert.equal(retried.ok,true);
  assert.deepEqual(f.calls.find(call=>call[0]==='agent')[1],timedInput);
  assert.equal(f.calls.filter(call=>call[0]==='workspace').length,1);
});

test('a daemon identity change cannot resume or write a local session against a different host',async t=>{
  const f=fixture(t);let first=true;const open=async()=>{
    const conn={api:f.api,serverId:first?'local':'different',hasProfiles:true,canCreate:true,online:true,
      connected(){return this.online;},async close(){this.online=false;}};first=false;f.connections.push(conn);return conn;
  };
  const service=createQuickChatService({connect:open,publish(){},pollMs:3,retryBaseMs:1,timeoutMs:50});t.after(()=>service.stop());
  const request=create();assert.equal((await service.handle(request)).ok,true);f.connections[0].online=false;
  await until(()=>f.connections.length>=2);
  const result=await service.handle(command('quick_chat_send',{sessionId:request.draftId,messageId:randomUUID(),text:'no'}));
  assert.equal(result.ok,false);assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
});

test('stop cancels a stalled preflight and prevents all late writes and publications',async t=>{
  const f=fixture(t);let release;f.api.projects.list=()=>new Promise(resolve=>release=resolve);
  const task=f.service.handle(create());await until(()=>!!release);await f.service.stop();
  const result=await task;assert.equal(result.error,'stopped');const count=f.updates.length;
  release({projects:[project]});await wait(5);
  assert.equal(f.calls.filter(call=>['workspace','agent','send'].includes(call[0])).length,0);assert.equal(f.updates.length,count);
});

test('malformed pagination cannot return partial options or create an Agent',async t=>{
  const f=fixture(t);f.api.workspaces.list=async()=>({entries:[workspace],pageInfo:{hasMore:true,nextCursor:'same'}});
  const result=await f.service.handle(command('quick_chat_options',{projectId:'project'}));
  assert.equal(result.ok,false);assert.equal(result.error,'unavailable');assert.equal(result.options,undefined);
  assert.equal((await f.service.handle(create())).ok,false);assert.equal(f.calls.filter(call=>call[0]==='agent').length,0);
});

test('an archived Agent retires only its chat session without reconnecting other sessions',async t=>{
  const f=fixture(t);const request=create();await f.service.handle(request);
  f.agents.get([...f.agents.keys()][0]).archivedAt='2026-10-16T13:00:00Z';f.event();
  await until(()=>f.updates.at(-1)?.session.error==='not_found');await wait(10);
  assert.equal(f.connections.length,1);assert.equal(f.listeners.size,0);
  const next=await f.service.handle(command('quick_chat_send',{sessionId:request.draftId,messageId:randomUUID(),text:'no'}));
  assert.equal(next.error,'not_found');assert.equal(f.calls.filter(call=>call[0]==='send').length,1);
});

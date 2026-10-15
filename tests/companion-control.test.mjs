import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompanionControl } from '../build/server/companion-control.js';
import { companionVersion } from '../build/server/desktop-companion.js';

function fixture() {
  const starts=[];
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},options=>{
    starts.push(options);
    if(!options.allowBuild)options.onError('Build confirmation required');
    return {ready:Promise.resolve(),async stop(){}};
  });
  return {control,starts};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('activation and cached start never authorize a first build; preparation/cancel do not start',async()=>{
  const {control,starts}=fixture();await settle();
  assert.equal(starts[0].allowBuild,false);
  const offer=(await control.handle({action:'prepare'})).offer;
  assert.equal(offer.version,companionVersion);assert.equal(offer.arch,'arm64');assert.equal(offer.sourceSha256.length,64);assert.ok(offer.requires.includes('no Companion download'));
  await control.handle({action:'cancel'});
  await assert.rejects(control.handle({action:'confirm',token:offer.token}),/cancelled/);
  assert.equal(starts.length,1);
  await control.handle({action:'start'});await settle();
  assert.equal(starts[1].allowBuild,false);await control.stop();
});
test('confirmation is single use, rejects forgery and serializes simultaneous requests',async()=>{
  const {control,starts}=fixture();await settle();
  const offer=(await control.handle({action:'prepare'})).offer;
  await assert.rejects(control.handle({action:'confirm',token:'forged'}),/cancelled/);
  const replies=await Promise.allSettled([control.handle({action:'confirm',token:offer.token}),control.handle({action:'confirm',token:offer.token})]);
  assert.equal(replies.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(starts.filter(o=>o.allowBuild).length,1);
  await control.stop();
  await assert.rejects(control.handle({action:'prepare'}),/disabled/);
});
test('failed authorized build can be retried with fresh confirmation',async()=>{
  let attempts=0;
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'x64'},o=>{
    if(!o.allowBuild)o.onError('missing');
    else if(++attempts===1)o.onError('Compiler failed');
    return {ready:Promise.resolve(),async stop(){}};
  });
  await settle();
  for(let i=0;i<2;i++){
    const offer=(await control.handle({action:'prepare'})).offer;
    assert.equal(offer.arch,'x64');
    await control.handle({action:'confirm',token:offer.token});await settle();
    assert.equal((await control.handle({action:'status'})).status.state,i===0?'error':'running');
  }
  assert.equal(attempts,2);await control.stop();
});
test('unsupported platform cannot prepare or confirm or start',async()=>{
  let calls=0;
  const control=createCompanionControl({platform:'linux',arch:'x64'},()=>{calls++;});
  for(const action of ['prepare','start','confirm'])await assert.rejects(control.handle({action,token:'anything'}),/macOS/);
  assert.equal(calls,0);await control.stop();
});

test('macOS below 13 cannot launch or offer a build',async()=>{
  let calls=0;
  const control=createCompanionControl({platform:'darwin',arch:'arm64',systemRelease:'21.6.0'},()=>{calls++;});
  assert.equal((await control.handle({action:'status'})).status.state,'unsupported');
  await assert.rejects(control.handle({action:'prepare'}),/macOS/);
  assert.equal(calls,0);await control.stop();
});
test('stop invalidates offers and holds lock until owned process terminates',async()=>{
  let release;
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},o=>{
    o.onError('missing');return {ready:Promise.resolve(),stop:()=>new Promise(r=>release=r)};
  });
  await settle();const offer=(await control.handle({action:'prepare'})).offer;
  const stopping=control.handle({action:'stop'});
  await assert.rejects(control.handle({action:'confirm',token:offer.token}),/progress/);
  release();await stopping;
  await assert.rejects(control.handle({action:'confirm',token:offer.token}),/cancelled/);
});
test('a newer offer and expiry both revoke earlier confirmation',async(t)=>{
  const {control,starts}=fixture();await settle();
  let now=1000;t.mock.method(Date,'now',()=>now);
  const first=(await control.handle({action:'prepare'})).offer;
  const second=(await control.handle({action:'prepare'})).offer;
  await assert.rejects(control.handle({action:'confirm',token:first.token}),/cancelled/);
  now+=300001;
  await assert.rejects(control.handle({action:'confirm',token:second.token}),/expired/);
  assert.equal(starts.length,1);await control.stop();
});
test('owned process exit permits a cached-only restart',async()=>{
  const starts=[];
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},o=>{
    starts.push(o);return {ready:Promise.resolve(),async stop(){}};
  });
  await settle();assert.equal((await control.handle({action:'status'})).status.state,'running');
  starts[0].onExit();
  await control.handle({action:'start'});await settle();
  assert.equal(starts.length,2);assert.equal(starts[1].allowBuild,false);await control.stop();
});

test('synchronous startup failures remain retryable and old callbacks cannot change a new lifetime',async()=>{
  let attempts=0;const starts=[];
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},options=>{
    if(++attempts===1)throw Error('startup failed');
    starts.push(options);return {ready:Promise.resolve(),async stop(){}};
  });
  assert.equal((await control.handle({action:'status'})).status.state,'error');
  await control.handle({action:'start'});await settle();
  await assert.rejects(control.handle({action:'prepare'}),/Stop/);
  await control.handle({action:'stop'});
  await control.handle({action:'start'});await settle();
  starts[0].onExit();starts[0].onError('stale failure');
  assert.equal((await control.handle({action:'status'})).status.state,'running');
  await control.stop();
});

test('disable joins an in-flight stop and startup cannot restore running during shutdown',async()=>{
  let resolveReady;let resolveStop;let stops=0;
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},()=>({
    ready:new Promise(resolve=>resolveReady=resolve),
    stop:()=>{stops++;return new Promise(resolve=>resolveStop=resolve);},
  }));
  const stopping=control.handle({action:'stop'});
  const disabling=control.stop();
  resolveReady();await settle();
  resolveStop();await Promise.all([stopping,disabling]);
  assert.equal(stops,1);
  await assert.rejects(control.handle({action:'status'}),/disabled/);
});

test('stop failure prevents a second process until shutdown succeeds',async()=>{
  let attempts=0;let starts=0;
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},()=>{
    starts++;return {ready:Promise.resolve(),async stop(){if(++attempts===1)throw Error('stop failed');}};
  });
  await settle();await assert.rejects(control.handle({action:'stop'}),/could not stop/);
  await assert.rejects(control.handle({action:'start'}),/Retry stopping/);
  assert.equal(starts,1);
  await control.handle({action:'stop'});await control.handle({action:'start'});await settle();
  assert.equal(starts,2);await control.stop();
});

test('synchronous stop failures release the lock so shutdown can be retried',async()=>{
  let attempts=0;
  const control=createCompanionControl({platform:'darwin',systemRelease:'22.0.0',arch:'arm64'},()=>({
    ready:Promise.resolve(),stop(){if(++attempts===1)throw Error('synchronous failure');return Promise.resolve();},
  }));
  await settle();await assert.rejects(control.handle({action:'stop'}),/could not stop/);
  await control.handle({action:'stop'});
  assert.equal((await control.handle({action:'status'})).status.state,'stopped');
  await control.stop();
});

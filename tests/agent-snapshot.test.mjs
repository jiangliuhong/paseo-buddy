import test from 'node:test';
import assert from 'node:assert/strict';
import { collectAgentSnapshot, maxDirectoryEntries } from '../build/server/agent-snapshot.js';

const page=(entries=[],hasMore=false,nextCursor=null)=>({entries,pageInfo:{hasMore,nextCursor}});

test('snapshot collection rejects missing and cyclic cursors instead of looping',async()=>{
  await assert.rejects(collectAgentSnapshot(page([],true),async()=>assert.fail('No cursor')),/cursor/);
  let reads=0;
  await assert.rejects(collectAgentSnapshot(page([],true,'a'),async()=>{reads++;return page([],true,'a');}),/cursor/);
  assert.equal(reads,1);
});

test('snapshot collection rejects oversized directories and stops fetching superseded pages',async()=>{
  await assert.rejects(collectAgentSnapshot(page(Array(maxDirectoryEntries+1).fill({})),async()=>assert.fail()),/limit/);
  let current=true;
  await assert.rejects(collectAgentSnapshot(page([],true,'a'),async()=>{
    current=false;return page([],true,'b');
  },()=>current),/superseded/);
});

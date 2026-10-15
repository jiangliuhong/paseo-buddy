import { createPaseoClient } from '@getpaseo/client';
import { startLiveAgents } from '../build/server/live-agents.js';
import { readPaseoConfig, readPaseoServerId } from '../build/server/paseo-connection.js';

// Read-only acceptance against the selected local daemon. No agent tasks or mutations.
const clients=[];
const snapshots=new Map();
let wake;
const monitor=startLiveAgents({
  config:()=>readPaseoConfig(),serverId:()=>readPaseoServerId(),
  createClient:config=>{const client=createPaseoClient(config);clients.push(client);return client;},
  publish:state=>{
    if(state.connection==='connected') {snapshots.set(clients.length,state);wake?.();}
  },
  notify:()=>{}, // Exercise lifecycle subscriptions without sending desktop notifications.
  checkIntervalMs:50,retryBaseMs:50,
});
const waitForSnapshot=async afterAttempt=>{
  const timeout=AbortSignal.timeout(20000);
  while(![...snapshots.keys()].some(attempt=>attempt>afterAttempt)) {
    await new Promise((resolve,reject)=>{
      const abort=()=>{wake=undefined;reject(Error('Local daemon snapshot timed out'));};
      wake=()=>{timeout.removeEventListener('abort',abort);wake=undefined;resolve();};
      timeout.addEventListener('abort',abort,{once:true});
      if(timeout.aborted)abort();
    });
  }
  const attempt=Math.max(...snapshots.keys());
  return {attempt,state:snapshots.get(attempt)};
};
try {
  const initial=await waitForSnapshot(0);
  await clients[initial.attempt-1].close(); // Reconnect this observer, never restart the user's daemon.
  const {state}=await waitForSnapshot(initial.attempt);
  console.log(JSON.stringify({connected:true,reconnected:true,
    agents:state.agents.length,running:state.agents.filter(a=>a.status==='running').length,
    unread:state.agents.filter(a=>a.status==='completed_unread').length,
    waiting:state.agents.filter(a=>a.status==='waiting_permission').length,
    navigationAvailable:!!state.serverId}));
} catch {
  console.error('Local daemon acceptance failed. Check the selected Paseo home, desktop session and loopback access.');
  process.exitCode=1;
} finally {await monitor.stop();}

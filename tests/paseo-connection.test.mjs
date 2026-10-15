import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readPaseoConfig,readPaseoServerId} from '../build/server/paseo-connection.js';

function fixture(t,listen,token='a'.repeat(43)) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buddy-connection-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 fs.writeFileSync(path.join(dir,'paseo.pid'),JSON.stringify({listen}));
 fs.writeFileSync(path.join(dir,'local-credential'),token+'\n');return dir;
}
test('reads loopback endpoint and re-reads rotating credentials',t=>{
 const home=fixture(t,'127.0.0.1:9876');
 assert.deepEqual(readPaseoConfig(home),{url:'ws://127.0.0.1:9876/ws',authHeader:'Bearer '+'a'.repeat(43)});
 fs.writeFileSync(path.join(home,'local-credential'),'b'.repeat(43));
 assert.equal(readPaseoConfig(home).authHeader,'Bearer '+'b'.repeat(43));
});
test('rejects public/remote/credential-bearing endpoints, paths and malformed credentials',t=>{
 for(const endpoint of ['0.0.0.0:6767','example.com:6767','user:password@127.0.0.1:6767','127.0.0.1:6767/path','unix:///tmp/paseo.sock','tcp://127.0.0.1:6767?token=bad','tcp://127.0.0.1:6767#bad'])assert.throws(()=>readPaseoConfig(fixture(t,endpoint)));
 assert.throws(()=>readPaseoConfig(fixture(t,'127.0.0.1:6767','bad-token')));
});
test('supports explicit loopback IPv6',t=>{
 assert.equal(readPaseoConfig(fixture(t,'tcp://[::1]:6767')).url,'ws://[::1]:6767/ws');
});

test('navigation identity follows the selected home and environment override without creating files',t=>{
 const home=fixture(t,'127.0.0.1:6767');
 assert.equal(readPaseoServerId(home,{}),undefined);
 assert.ok(!fs.existsSync(path.join(home,'server-id')));
 fs.writeFileSync(path.join(home,'server-id'),'srv_first\n');
 assert.equal(readPaseoServerId(home,{}),'srv_first');
 assert.equal(readPaseoServerId(home,{PASEO_SERVER_ID:' srv_override '}),'srv_override');
 fs.writeFileSync(path.join(home,'server-id'),'srv_second');
 assert.equal(readPaseoServerId(home,{}),'srv_second');
 fs.writeFileSync(path.join(home,'server-id'),'bad\nidentity');
 assert.equal(readPaseoServerId(home,{}),undefined);
 assert.equal(readPaseoServerId(home,{PASEO_SERVER_ID:'x'.repeat(257)}),undefined);
});

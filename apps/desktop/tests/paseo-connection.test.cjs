const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {readPaseoConfig} = require('../paseo-connection.cjs');

function fixture(t, listen, token = 'a'.repeat(43)) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buddy-connection-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  fs.writeFileSync(path.join(dir,'paseo.pid'),JSON.stringify({listen}));
  fs.writeFileSync(path.join(dir,'local-credential'),token+'\n');
  return dir;
}
test('reads loopback endpoint and credential from the installed daemon files',t=>{
  const home=fixture(t,'127.0.0.1:9876');
  assert.deepEqual(readPaseoConfig(home),{url:'ws://127.0.0.1:9876/ws',authHeader:'Bearer '+ 'a'.repeat(43)});
  fs.writeFileSync(path.join(home,'local-credential'),'b'.repeat(43));
  assert.equal(readPaseoConfig(home).authHeader,'Bearer '+ 'b'.repeat(43));
});
test('rejects public binding, remote hosts, URL credentials, paths and malformed credentials',t=>{
  for(const endpoint of ['0.0.0.0:6767','example.com:6767','user:password@127.0.0.1:6767','127.0.0.1:6767/path','unix:///tmp/paseo.sock']) {
    assert.throws(()=>readPaseoConfig(fixture(t,endpoint)));
  }
  assert.throws(()=>readPaseoConfig(fixture(t,'127.0.0.1:6767','bad-token')));
});
test('supports explicit loopback IPv6',t=>{
  assert.equal(readPaseoConfig(fixture(t,'tcp://[::1]:6767')).url,'ws://[::1]:6767/ws');
});

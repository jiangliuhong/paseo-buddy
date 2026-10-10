const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function readPaseoConfig(home = process.env.PASEO_HOME || path.join(os.homedir(), ".paseo")) {
  const lock = JSON.parse(fs.readFileSync(path.join(home, "paseo.pid"), "utf8"));
  if (typeof lock.listen !== "string") throw new Error("Paseo daemon is not listening");
  const endpoint = lock.listen.startsWith("tcp://") ? lock.listen : `tcp://${lock.listen}`;
  const url = new URL(endpoint);
  // Never send the daemon's local credential to a remote host, or accept URL credentials.
  if (url.protocol !== "tcp:" || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      || !url.port || url.username || url.password || url.search || url.hash
      || (url.pathname && url.pathname !== "/")) throw new Error("Unsupported local Paseo endpoint");
  const token = fs.readFileSync(path.join(home, "local-credential"), "utf8").trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Invalid Paseo local credential");
  return { url: `ws://${url.host}/ws`, authHeader: `Bearer ${token}` };
}
module.exports = { readPaseoConfig };

const fs = require("node:fs");
const path = require("node:path");
const defaults = Object.freeze({ opacity: 1, scale: 1 });

function parseDisplaySettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
      || !Number.isFinite(input.opacity) || input.opacity < 0.3 || input.opacity > 1
      || !Number.isFinite(input.scale) || input.scale < 0.75 || input.scale > 1.5) return null;
  return { opacity: input.opacity, scale: input.scale };
}
function readDisplaySettings(file) {
  if (!file) return null;
  try { return parseDisplaySettings(JSON.parse(fs.readFileSync(file, "utf8"))); }
  catch { return null; }
}
function watchDisplaySettings(file, apply) {
  if (!file) return () => {};
  let timer;
  let watcher;
  let stopped = false;
  let previous;
  const read = () => {
    if (stopped) return;
    const values = readDisplaySettings(file);
    if (values && (!previous || values.opacity !== previous.opacity || values.scale !== previous.scale)) {
      previous = values;
      apply(values);
    }
  };
  try {
    watcher = fs.watch(path.dirname(file), (_event, filename) => {
      if (filename && String(filename) !== path.basename(file)) return;
      clearTimeout(timer);
      timer = setTimeout(read, 30);
    });
    watcher.on("error", () => {});
  } catch { /* Manual launches keep defaults when no mirror exists. */ }
  // Atomic rename notifications vary by platform; stat polling also follows replaced inodes.
  fs.watchFile(file, { interval: 250, persistent: false }, read);
  read();
  return () => { stopped = true; clearTimeout(timer); watcher?.close(); fs.unwatchFile(file, read); };
}
module.exports = { defaults, parseDisplaySettings, readDisplaySettings, watchDisplaySettings };

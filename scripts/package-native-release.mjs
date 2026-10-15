import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { companionVersion, ensureCompanion } from '../build/server/desktop-companion.js';
import { nativeAssetName, nativeReleaseTag } from '../build/server/native-download.js';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url)));
if (nativeReleaseTag !== `v${pkg.version}` || !companionVersion.startsWith(`${pkg.version}-`)) throw Error('Release version mismatch');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== nativeReleaseTag) throw Error('Tag does not match plugin version');
if (process.platform !== 'darwin') throw Error('Release build requires macOS');
// Cross-compile both architectures using the selected macOS SDK. No GUI launch.
await mkdir('build/release', { recursive: true });
for (const arch of ['arm64', 'x64']) {
  const executable = await ensureCompanion({ allowBuild: true, arch, cacheRoot: path.resolve('build/native'), signal: new AbortController().signal });
  const directory = path.dirname(path.dirname(path.dirname(path.dirname(executable))));
  const name = nativeAssetName(arch);
  console.log(`Packaging ${name}`);
  await copyFile(executable, `build/release/${name}`);
  await copyFile(path.join(directory, 'build.json'), `build/release/${name}.json`);
}

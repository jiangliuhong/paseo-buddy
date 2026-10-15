import path from 'node:path';
import { companionAsset, ensureCompanion, startDesktopCompanion } from '../build/server/desktop-companion.js';
if (!companionAsset(process.platform, process.arch)) throw Error('Native companion requires macOS 13+ on arm64/x64');
const cacheRoot=path.resolve('build/native');
if(process.argv[2]==='build') {
 console.log(await ensureCompanion({allowBuild:true,arch:process.arch,cacheRoot,signal:new AbortController().signal}));
} else if(process.argv[2]==='start') {
 let failed=false;let exited=false;let startupDone=false;
 const companion=startDesktopCompanion({allowBuild:true,cacheRoot,preferencesSuite:"io.github.jiangliuhong.paseobuddy.native.development",onError:message=>{failed=true;console.error(message);},onExit:()=>{exited=true;if(startupDone)void companion.stop().then(()=>process.exit());}});
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void companion.stop().then(()=>process.exit());});
 await companion.ready;startupDone=true;
 if(failed||exited){await companion.stop();process.exitCode=1;}
} else throw Error('Use build or start');

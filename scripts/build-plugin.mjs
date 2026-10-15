import { build } from 'esbuild';
await Promise.all(['index.server.ts','index.client.tsx'].map(entry => build({
  entryPoints:[entry],bundle:true,packages:'external',platform:entry.includes('server')?'node':'neutral',
  format:'esm',outdir:'build/plugin',logLevel:'info',
})));

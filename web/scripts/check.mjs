import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function checkDirectory(dir) {
 for(const entry of readdirSync(path.join(root,dir),{withFileTypes:true})) {
  const file=path.join(dir,entry.name);
  if(entry.isDirectory())checkDirectory(file);
  else if(/\.(mjs|js)$/.test(file)) {
   const r=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
   if(r.status!==0){process.stderr.write(r.stderr);process.exit(1);}
  }
 }
}
for(const dir of ['api','lib','public','scripts'])checkDirectory(dir);
JSON.parse(readFileSync(path.join(root,'vercel.json'),'utf8'));
console.log('JavaScript syntax and Vercel configuration JSON checked.');

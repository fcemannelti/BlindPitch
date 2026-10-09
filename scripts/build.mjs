import { mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
const output=resolve('dist');
if(dirname(output)!==process.cwd()||output===process.cwd()||(existsSync(output)&&lstatSync(output).isSymbolicLink()))throw new Error('Diretório de build inválido.');
// O build deve refletir a origem: não pode continuar servindo arquivos removidos.
rmSync(output,{recursive:true,force:true});
mkdirSync('dist',{recursive:true});
cpSync('public','dist',{recursive:true});
function resources(directory, prefix='') {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?resources(join(directory,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);
}
const manifest=Object.fromEntries(resources('public').sort().map(file=>[file,createHash('sha256').update(readFileSync(join('dist',file))).digest('hex')]));
writeFileSync('dist/build-manifest.json',JSON.stringify({built_at:new Date().toISOString(),files:manifest},null,2));
console.log('Build de produção criado em dist/. API e SQLite são executados pelo servidor Node.js.');

// Conversão opcional e determinística de formato, sem editar pixels ou recriar imagens.
// Requer cwebp/dwebp locais (libwebp); não é dependência de execução/build.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pngAlphaStats } from './png-alpha.mjs';

const temporary=mkdtempSync(join(tmpdir(),'blindpitch-codec-')),report=[];
const encode=process.env.CWEBP||'cwebp',decode=process.env.DWEBP||'dwebp';
function run(executable,args) {
  const result=spawnSync(executable,args,{windowsHide:true,encoding:'utf8'});
  if(result.error||result.status!==0)throw new Error(result.error?.message||result.stderr);
}
try {
  for(const area of ['quimica','fisica','matematica','biologia','astronomia','tecnologia']) {
    const source=resolve(`public/assets/science-owls/transparent/coruja-${area}.png`),target=source.replace(/\.png$/u,'.webp'),pam=join(temporary,'decoded.pam');
    run(encode,['-quiet','-lossless','-exact','-metadata','icc','-m','6',source,'-o',target]);
    run(decode,[target,'-pam','-o',pam]);
    const original=readFileSync(source),pixels=pngAlphaStats(original,true).pixels,decoded=readFileSync(pam);
    const marker=decoded.indexOf('ENDHDR\n');assert.ok(marker>=0);
    const rgba=decoded.subarray(marker+7);assert.ok(pixels.equals(rgba),'Conversão alterou pixels: '+area);
    const encoded=readFileSync(target);assert.ok(encoded.length<original.length);
    report.push({area,original_bytes:original.length,webp_bytes:encoded.length,identical_rgba:true,rgba_sha256:createHash('sha256').update(rgba).digest('hex')});
  }
  mkdirSync('test-results',{recursive:true});writeFileSync('test-results/lossless-assets.json',JSON.stringify(report,null,2));
  const original=report.reduce((sum,item)=>sum+item.original_bytes,0),encoded=report.reduce((sum,item)=>sum+item.webp_bytes,0);
  console.log(`6 corujas: ${original} → ${encoded} bytes; redução de ${((1-encoded/original)*100).toFixed(1)}%; RGBA idêntico.`);
} finally {
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir())+sep));rmSync(temporary,{recursive:true,force:true});
}

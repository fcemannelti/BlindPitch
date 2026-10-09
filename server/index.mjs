import { openDb, initializeRealDb } from './db.mjs';
import { seed } from './seed.mjs';
import { createApp } from './app.mjs';
import { resolve } from 'node:path';

const db=openDb(process.env.DATABASE_PATH||'./data/blindpitch.sqlite');
const demo=process.env.DEMO_MODE!=='false';
if(demo) seed(db);
else if(!db.prepare('SELECT id FROM events LIMIT 1').get()) {
  if(!process.env.ADMIN_EMAIL||!process.env.ADMIN_PASSWORD||process.env.ADMIN_PASSWORD.length<12) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD (mínimo 12 caracteres) para inicializar uma base real.'); process.exit(1);
  }
  try {initializeRealDb(db,process.env.ADMIN_EMAIL,process.env.ADMIN_PASSWORD);}
  catch {console.error('Não foi possível inicializar a base real. Verifique ADMIN_EMAIL e ADMIN_PASSWORD; nenhuma edição parcial foi criada.');db.close();process.exit(1);}
}
if(!demo && db.prepare('SELECT id FROM events WHERE demo=1').get()) {
  console.error('Use um DATABASE_PATH novo para separar dados reais da demonstração.'); process.exit(1);
}
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const server=createApp(db,{secureCookie:process.env.COOKIE_SECURE==='true',publicDir:resolve(process.env.SERVE_DIST==='true'?'dist':'public')});
server.listen(port,host,()=>console.log(`BlindPitch disponível em http://${host}:${port} ${demo?'(demonstração local)':''}`));
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));

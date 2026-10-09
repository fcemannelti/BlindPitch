import { openDb } from './db.mjs';
import { seed } from './seed.mjs';
const db=openDb(process.env.DATABASE_PATH||'./data/blindpitch.sqlite');
console.log(seed(db)?'Demonstração criada com propostas fictícias detalhadas.':'Base existente preservada. Apenas propostas do seed antigo ainda intactas podem ter sido enriquecidas; edições dos usuários são mantidas.');
db.close();

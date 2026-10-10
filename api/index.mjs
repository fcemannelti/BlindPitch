// Função Node.js da Vercel.
//
// Este arquivo NÃO chama listen() e NÃO executa migrações nem seeds: o módulo
// `server/index.mjs` (que inicializa o servidor local) nunca é importado aqui.
// A função apenas obtém um pool e delega ao mesmo handler HTTP do backend local.
//
// O que a função faz no primeiro arranque de cada instância:
//   1. confere se o SCHEMA foi aplicado — pela existência das tabelas, não por
//      haver dados: um banco recém-migrado está vazio e continua pronto;
//   2. garante que exista uma edição real, criando-a uma única vez a partir de
//      ADMIN_EMAIL/ADMIN_PASSWORD. Sem edição, getEvent() não encontra nada e a
//      API responderia 404 em quase todas as rotas. Nunca semeia demonstração.
//
// Configuração necessária no projeto Vercel:
//   DATABASE_URL               -> postgresql://...  (Neon/Supabase/etc.)
//   ADMIN_EMAIL/ADMIN_PASSWORD -> apenas na primeira inicialização de uma base nova
//   NODEJS_HELPERS=0      -> o corpo é lido pelo stream, com os limites e a
//                            validação de JSON do próprio BlindPitch.
//   COOKIE_SECURE         -> opcional; assume-se ligado em produção.
import { openDatabase, ensureRealEdition } from '../server/db/index.mjs';
import { createHandler } from '../server/app.mjs';
import { resolve } from 'node:path';

let pending = null;

function build() {
  if (pending) return pending;
  pending = (async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL não configurado. Defina a variável de ambiente antes do deploy.');
    }
    const db = openDatabase({
      url,
      // Pool pequeno e reutilizado. Instâncias serverless nascem e morrem a
      // cada requisição; um pool por processo evita abrir conexões sem controle.
      max: Number(process.env.PGPOOL_MAX || 4)
    });
    // 1) Schema aplicado? Pergunta pela existência das tabelas, nunca por
    //    conteúdo. Sondar uma linha de `settings` tratava "base migrada e
    //    vazia" como "sem schema" e derrubava a API com 503 na 1ª requisição.
    if (typeof db.schemaReady === 'function' && !(await db.schemaReady())) {
      throw new Error('Schema ausente. Execute `npm run db:migrate` antes do primeiro deploy.');
    }

    // 2) Existe edição? Sem ela, getEvent() falha e quase toda rota vira 404.
    //    A criação é idempotente e protegida por trava no próprio banco, para
    //    que duas instâncias subindo juntas não dupliquem a edição inicial.
    await ensureRealEdition(db, {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD
    });
    const secureCookie = process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
    return createHandler(db, {
      secureCookie,
      publicDir: resolve(process.env.SERVE_DIST === 'true' ? 'dist' : 'public')
    });
  })();
  return pending;
}

export default async function handler(request, response) {
  try {
    const app = await build();
    return await app(request, response);
  } catch (error) {
    // Não vaza credenciais nem detalhe interno: a mensagem vai ao log do servidor.
    console.error('Falha ao inicializar a função:', error?.name, error?.message);
    if (!response.headersSent) {
      response.statusCode = 503;
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
    }
    response.end(JSON.stringify({ error: 'Serviço temporariamente indisponível.' }));
  }
}

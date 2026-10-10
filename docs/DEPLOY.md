# Publicação na Vercel (Node.js + PostgreSQL)

Guia completo, do banco ao deploy. Nenhuma etapa aqui é opcional.

## 1. Banco PostgreSQL gratuito (Neon)

1. Crie uma conta em <https://neon.tech> (plano **Free**, sem cartão exigido para o plano gratuito).
2. Crie um projeto e um branch `main`.
3. Em **Connection details**, copie a conexão pooler. Ela tem este formato:

   ```
   postgresql://USUARIO:SENHA@ep-xxx-yyy.region.aws.neon.tech/neondb?sslmode=require
   ```

4. Guarde essa URL. Ela será a variável `DATABASE_URL`.

> Se preferir outra opção gratuita: Supabase, Railway (crédito mensal) ou um
> PostgreSQL local. O código não depende de nenhum recurso específico do Neon.

## 2. Criar o schema (uma única vez)

Rode **na sua máquina**, apontando para o banco recém-criado:

```powershell
$env:DATABASE_URL="postgresql://USUARIO:SENHA@ep-xxx.region.aws.neon.tech/neondb?sslmode=require"
npm install
npm run db:migrate
```

Saída esperada:

```
Tabelas em public: 0 -> 19
schema_migrations: 6
Schema aplicado. Idempotente: pode ser executado novamente com segurança.
```

O comando é **idempotente**: pode rodar de novo sem risco. Ele cria as 19
tabelas, chaves estrangeiras e índices. Não executa seed e não apaga nada.

## 3. Publicar na Vercel

### Pela interface

1. `npm install` e confirme que o projeto está num repositório Git.
2. Na Vercel: **Add New → Project**, importe o repositório.
3. O framework é detectado como **Other**. Ajuste:
   - **Build Command**: `npm run build`
   - **Output Directory**: `public`
   - **Install Command**: `npm install`
4. Em **Environment Variables**, adicione:

   | Nome | Valor | Ambiente |
   | --- | --- | --- |
   | `DATABASE_URL` | a URL do passo 1 | Production, Preview, Development |
   | `NODEJS_HELPERS` | `0` | Production, Preview |
   | `COOKIE_SECURE` | `true` | Production |
   | `DEMO_MODE` | `false` | Production |
   | `ADMIN_EMAIL` | e-mail do organizador | Production |
   | `ADMIN_PASSWORD` | senha com **12+ caracteres** | Production |

   Sem `NODEJS_HELPERS=0` a Vercel pré-processa o corpo da requisição, e o
   BlindPitch perde a própria validação de limite de tamanho e de tipo JSON.

5. **Deploy**.

### Pela CLI

```powershell
npm i -g vercel
vercel link
vercel env add DATABASE_URL production
vercel env add NODEJS_HELPERS production   # valor: 0
vercel env add COOKIE_SECURE production    # valor: true
vercel env add DEMO_MODE production        # valor: false
vercel env add ADMIN_EMAIL production
vercel env add ADMIN_PASSWORD production
vercel --prod
```

## 4. Conferir o resultado

```powershell
curl.exe -i https://SEU-PROJETO.vercel.app/api/public
```

Esperado: **HTTP 200** com JSON contendo o nome da edição.

```powershell
curl.exe -i https://SEU-PROJETO.vercel.app/api/session
```

Esperado: **HTTP 401** com `{"error":"Entre para continuar."}`
(401 = rota existe e exige sessão; 404 significaria que o roteamento falhou).

## 5. Migrar os dados do SQLite local (opcional)

O SQLite local **não** é a fonte oficial dos dados publicados. Só importe se
você tiver certeza de que é a origem correta.

```powershell
# Simulação: mostra o que seria inserido e não escreve nada
npm run db:import -- --from ./data/blindpitch.sqlite

# Aplicação de verdade
npm run db:import -- --from ./data/blindpitch.sqlite --apply
```

Garantias da importação:

- **nada é apagado**;
- **nada é sobrescrito** — só insere linhas cujo identificador ainda não existe;
- IDs, relações e textos são preservados exatamente;
- colunas que não existem no destino são ignoradas e listadas no relatório;
- ao final imprime a contagem de cada tabela na origem e no destino;
- rodar de novo informa `Já existentes no destino` e não duplica nada.

## Variáveis de ambiente

| Variável | Necessária | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | em produção | Ativa o PostgreSQL. Sem ela, a aplicação usa SQLite. |
| `NODEJS_HELPERS` | recommended | `0` desliga o parsing de corpo da Vercel. |
| `COOKIE_SECURE` | recomendada | `true` em produção (padrão em deploy). |
| `DEMO_MODE` | recomendada | `false` para não criar a edição de demonstração. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | na 1ª execução real | Cria a conta do organizador. Senha com 12+ caracteres. |
| `PGPOOL_MAX` | opcional | Conexões por instância (padrão 4). Menor é melhor no plano grátis. |
| `BLINDPITCH_TEST_DATABASE_URL` | só em testes | Banco descartável para a suíte PostgreSQL. |

## Testes

```powershell
npm test                    # suíte completa (SQLite)
npm run test:postgres       # exige BLINDPITCH_TEST_DATABASE_URL
npm run test:vercel         # exige BLINDPITCH_TEST_DATABASE_URL
```

A suíte PostgreSQL cria um banco temporário por execução e o remove ao final.
Sem `BLINDPITCH_TEST_DATABASE_URL` ela é ignorada com um aviso explícito —
nunca falha silenciosamente.

## Como a API funciona na Vercel

- `api/index.mjs` é a **função Node.js**. Ela exporta `async (request, response)`
  e não chama `listen()` — o runtime da Vercel entrega `IncomingMessage` e
  `ServerResponse` reais.
- `vercel.json` envia todo `/api/*` para essa função:
  `{ "source": "/api/:path*", "destination": "/api/index" }`.
  É isso que resolve os `404` de `/api/public` e `/api/session`.
- `public/` é servido estáticamente pelo CDN. A navegação usa hash (`/#/dashboard`),
  então não é necessária rota de fallback para a interface.
- O pool do PostgreSQL é criado **uma vez por instância**, nunca por requisição.
  Instâncias serverless nascem e morrem; um pool por processo evita esgotar o
  plano grátis do Neon.

## Limites de tentativas entre instâncias

Contar tentativas em memória não funciona em serverless: cada instância tem a
própria memória e o limite cairia a cada mudança de instância. Com PostgreSQL,
o contador fica na tabela `rate_limits`, compartilhada por todas as instâncias.

No SQLite (desenvolvimento) o estado é em memória, o que é suficiente e rápido.

## Avisos

- A primeira requisição **não** cria tabelas nem seed. As migrações rodam
  separadamente, com `npm run db:migrate`.
- Se o schema não estiver aplicado, a função responde **503** com uma mensagem
  genérica (sem vazar credenciais) e o motivo vai para o log do deploy.
- O SQLite local e os backups em `data/backups/` continuam preservados.

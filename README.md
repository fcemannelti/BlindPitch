# BlindPitch

**Primeiro a ideia. Depois, quem a criou.**

Aplicação funcional de avaliação científica inicial anônima para o Ceará Faz Ciência 2026, tema **Ciência Delas**. Inclui cadastro, autenticação, três papéis, propostas em SQLite ou PostgreSQL, revisão da anonimização, rubrica, dashboards, comparações e exportação agregada.

A mesma base de código roda localmente em SQLite e na Vercel com PostgreSQL. O backend fala com o banco por uma camada única (`server/db/`), então os 43 endpoints da API funcionam igual nos dois motores.

## Rodar localmente

Requisito: **Node.js 24 ou superior**, com npm. Rode `npm install` uma vez (o único pacote é o driver `pg`, usado apenas quando há `DATABASE_URL`; para o SQLite puro o servidor funciona mesmo sem internet).

Na pasta do projeto:

```powershell
npm.cmd start
```

Abra **http://127.0.0.1:3000**. Em macOS/Linux, use `npm start`. `npm.cmd` funciona mesmo quando o PowerShell bloqueia `.ps1`.

O primeiro início cria `data/blindpitch.sqlite`, aplica o esquema e gera a demonstração. Os dados permanecem após reiniciar. `npm.cmd run dev` reinicia o servidor quando seu código é alterado. Atualize o navegador após editar a interface.

## Contas fictícias

Senha de todas: **`BlindPitch2026!`**.

| Perfil | E-mail |
| --- | --- |
| Organizador | `organizador@blindpitch.demo` |
| Avaliador 1 | `avaliador1@blindpitch.demo` |
| Avaliador 2 | `avaliador2@blindpitch.demo` |
| Participante 1 | `participante1@blindpitch.demo` |
| Participante 2 | `participante2@blindpitch.demo` |
| Participante 3 | `participante3@blindpitch.demo` |

O seed contém seis projetos, três participantes, dois avaliadores e avaliações pendentes, em andamento e concluídas, nas condições anônima e identificada. Resultados exibem **“Dados ilustrativos — resultados reais ainda serão coletados.”**

`npm.cmd run seed` inicializa uma base vazia e enriquece exclusivamente propostas intactas do seed antigo em edições demo. Preserva edições dos usuários, avaliações e códigos. Para outra demonstração, configure um novo `DATABASE_PATH` em vez de excluir a base atual.

As seis propostas têm planos científicos distintos com aproximadamente 5.000 caracteres, incluindo métodos, controles, cronogramas, materiais, limitações e referências. Resultados científicos não foram coletados: essa condição está explícita em cada projeto fictício. O cadastro apresenta oito campos principais e dez opcionais, um por etapa, com metodologia de até 20.000 caracteres e revisão final. Consulte [campos, migração e proteção de autoria](docs/PROPOSTAS.md).

## Roteiro da feira

1. Entre como participante ou crie uma conta. Em **Nova proposta**, avance pelas etapas, confira **Revise seu projeto** e clique em **Cadastrar projeto** para salvar um rascunho. Título e área são obrigatórios; os demais campos podem ser completados antes do envio. Não escreva dados pessoais no conteúdo científico.
2. Revise e clique em **Enviar proposta**. A API gera `BP-2026-XXXX` e bloqueia a edição.
3. Entre como organizador. Em **Projetos**, abra a proposta e revise todos os campos da **Revisão de anonimização**. Remova nomes, contatos, instituições e pistas indiretas; confirme e aprove a versão científica.
4. Em **Distribuição**, escolha a proposta revisada, o avaliador e **Anônima**; atribua a avaliação.
5. Entre como esse avaliador. Abra a proposta, confira **Avaliação anônima ativa**, preencha a rubrica e salve um rascunho ou finalize após confirmar. A finalização não pode ser repetida nem alterada.
6. Entre como organizador e acompanhe progresso, notas, médias e gráficos. Atualize a página para consultar alterações feitas em outro dispositivo.
7. Conclua todas as atribuições pendentes. Em **Edição e evento**, feche submissões e avaliações e libere resultados. A autoria pode então ser associada aos projetos exclusivamente no painel do organizador. O avaliador anônimo continua sem recebê-la.
8. O participante consulta suas notas e os comentários gerais, se liberados. Em **Exportação**, o organizador baixa CSV agregado sem nomes ou códigos individuais.

Use perfis diferentes do navegador ou dispositivos separados para sessões simultâneas. Abas do mesmo perfil compartilham o login.

## Capacidades

- Públicas: apresentação, sobre a pesquisa, cadastro e login.
- Participante: projetos próprios, criação/edição de rascunho, envio, status, resultado e consentimento opcional por edição/protocolo.
- Avaliador: atribuições próprias, conteúdo sanitizado, rubrica, rascunho, confirmação e histórico.
- Organizador: dashboard, projetos, participantes, avaliadores, distribuição, rubrica, edição, resultados, comparação, CSV e auditoria.

O organizador pode criar outras edições e consultar as anteriores. A rubrica é configurável antes da primeira atribuição. A condição identificada exige protocolo habilitado e consentimento específico; não consentir não impede a participação anônima.

## Interface e identidade

A direção visual é um instrumento científico tratado como publicação editorial: chão frio no eixo do azul-marinho (nunca um creme "gosto"), tinta quase preta, um azul para interação, roxo reservado à dimensão anônima/identificada e **ouro como a cor da medalha** — tirado das estrelas dos próprios chapéus das corujas e gasto só em progresso, ranking e na régua do cabeçalho. A estrutura vem de filetes e áreas abertas: painéis levam um filete no topo e respiro, não superfície e sombra. A profundidade é declarada uma vez, com sombra apenas no que flutua (diálogo e aviso). Nenhuma funcionalidade, texto, rota ou contrato mudou — a reestilização é inteiramente da camada visual.

- **Hero com protagonista.** As seis corujas e o ciclo de 5 segundos continuam intactos. A composição foi reconstruída: a coruja central é o sujeito principal (cerca de 1,5fr contra 1fr de cada lateral), as duas laterais são secundárias (65–75% do centro), ficam deslocadas na diagonal, levemente rotacionadas, se sobrepõem para dentro e se separam por profundidade com `z-index`. Dois anéis orbitais de 1px ficam atrás do elenco. As duas composições de trio satisfazem isso, porque a animação troca qual trio está visível.

- Duas fontes locais e sem CDN, servidas pelo próprio servidor sob a CSP já existente: **Source Sans 3** para interface e **Newsreader** como voz de display (títulos, manchetes, números). São fontes variáveis: quatro arquivos woff2 em `public/assets/fonts/` cobrem todos os pesos, com `latin` e `latin-ext` para o português. Sem elas, o navegador usa `Segoe UI` e o layout permanece íntegro.
- A página inicial mostra exclusivamente as seis corujas científicas fornecidas, em versões PNG com canal alpha real: Química/Física/Matemática e Biologia/Astronomia/Tecnologia. O trio muda a cada 5 segundos, com transição de 1,2 segundo, sem cards, legendas, controles, fundos ou mesclagem por CSS. Movimento reduzido mantém o primeiro trio estático.
- A área científica tem seletor com 11 opções e símbolos SVG próprios (frasco, átomo, geometria, microscópio, planeta, chip e símbolos das áreas existentes). Os cards de participantes e avaliadores usam o mesmo símbolo, determinado pela área efetivamente cadastrada. Áreas personalizadas e valores existentes são preservados.
- Criação e edição de rascunhos usam 19 etapas: 18 campos originais e revisão final, com progresso automático, validação, Voltar/Avançar, correção por campo e transições de 280 ms. Respostas permanecem em memória ao navegar e em falhas da API. Somente a confirmação final salva; recarregar ou sair antes de salvar descarta o preenchimento temporário. O envio para avaliação continua na tela de detalhes. Nenhuma dependência ou migração foi adicionada.
- Temas claro e escuro completos, com cores centralizadas em variáveis CSS. O botão de Sol/Lua está no cabeçalho público e no workspace.
- A primeira visita segue `prefers-color-scheme`. A escolha manual fica em `localStorage.bp_theme`, prevalece sobre o sistema e sincroniza entre abas. `theme.js` carrega antes do CSS para evitar flash e manter a CSP sem scripts inline. Se o armazenamento estiver bloqueado, a escolha funciona durante a sessão da aba.
- Login, cadastro, dashboards, estados vazios, avaliação anônima e diálogos usam exclusivamente recortes das seis corujas científicas. O SVG do mascote antigo foi removido. Arquivos e prompt de extração estão em [assets transparentes](public/assets/science-owls/transparent/README.md).
- Os indicadores formam uma única régua com divisores, em vez de quatro caixas soltas. Gradientes decorativos, alternância de cor sem significado, bordas laterais coloridas e elevação no hover foram removidos. A troca de rota não anima mais a página; restam apenas o ciclo das corujas, `spinner`, `shimmer` e as animações do diálogo de separação da identidade. Contadores usam `requestAnimationFrame` por 750 ms. Skeletons aparecem em carregamentos demorados.
- Toasts de sucesso, erro, aviso e informação têm fechamento manual/automático e pausam enquanto recebem foco ou hover. Formulários preservam conteúdo em falhas e indicam carregamento e validação.
- Confirmações e operações usam `<dialog>`, com foco contido e fundo inerte. O sucesso e o código anônimo só aparecem após a API confirmar o registro. A animação representa a separação da identidade; a revisão humana da versão científica continua obrigatória.
- Conteúdo centralizado até 1.400 px, formulários até 850 px, rubrica de configuração até 1.040 px e autenticação até 1.100 px, com card de 460 px. Breakpoints principais em 1.200, 900 e 640 px, com ajuste do seletor de edição em 1.100 px; indicadores em quatro, duas ou uma coluna; navegação horizontal em tablet/celular e tabelas com rolagem contida. `prefers-reduced-motion` mantém a alternativa sem animações.

Veja [detalhes e roteiro de validação da interface](docs/INTERFACE.md).

## Verificação

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run test:browser
npm.cmd run build
```

Execute todos os checks com `npm.cmd run check`.

Veja o [relatório da auditoria técnica e das correções](docs/AUDITORIA.md). O cadastro reutiliza uma chave de confirmação após perda de resposta, evitando duplicidade também no servidor. Todos os perfis podem consultar edições anteriores pelo seletor do cabeçalho; a navegação continua funcionando com armazenamento bloqueado. Os seis WebP transparentes são 30,4% menores que os PNG, sem perda de pixels.

- **Lint:** parser TypeScript, sintaxe e regras contra `eval`, `Function`, `debugger` e igualdade não estrita.
- **Typecheck:** TypeScript 6.0.3 verifica estaticamente o JavaScript da interface (`checkJs`), tipos DOM e variáveis não utilizadas. Backend tem validação de tipos dos payloads e testes HTTP; não está integralmente tipado estaticamente.
- **Testes:** HTTP e SQLite reais em bases isoladas; papéis, CSRF, anonimato, estados, códigos concorrentes, consentimento, pesos, notas, duplicidade, métricas, publicação, persistência e renderizadores. Incluem também tema, confirmação assíncrona, sucesso condicionado à API, movimento reduzido, contraste das paletas e entrega dos novos recursos locais.
- **E2E:** fluxo completo pela API HTTP com sessões de participante, organizador e avaliadores. Não é teste de navegador.
- **Build:** interface e manifesto de integridade em `dist/`. Autenticação, API e persistência continuam exigindo o servidor.
- **Navegador:** `npm.cmd run test:browser` usa Chrome/Chromium/Edge headless com SQLite e perfil temporários. Verifica os dois ciclos de corujas, alpha real, movimento reduzido, seletor científico, ícones dos cards, teclado, foco, formulário, revisão, falha da API, prevenção de duplicidade inclusive após perda da resposta, edição e envio real com código anônimo, anonimização/distribuição pelo organizador, notas/histórico do avaliador, troca de edições, cadastro de conta e logout. Confere landing, campos e revisão em 360, 390, 768, 1024, 1440 e 1920 px, nos dois temas. Relatório e capturas ficam em `test-results/experience/`. Configure `CHROME_PATH` se necessário. Este comando é separado do `check`, que funciona sem navegador instalado.

Validação adicional de layout: `node scripts/visual-qa.mjs` renderiza 26 telas/estados reais em Chrome/Chromium/Edge headless, nos temas claro/escuro e em 360, 390, 768, 1024, 1366, 1440 e 1920 px. O script mede overflow, eixos centrais, proporção/carregamento das imagens, alinhamento dos indicadores e limites dos diálogos. Gera screenshots e relatório em `test-results/layout/`. Se necessário, configure `CHROME_PATH`. Os dados vêm de uma API e SQLite temporários; a base local é preservada. Esses testes renderizam templates e estados visuais; não automatizam cliques nem substituem testes assistivos com usuários. Veja o [relatório do redesign](docs/REDESIGN.md).

## Produção e dados reais

Copie `.env.example` para `.env`. Para inicializar uma base **nova e separada** da demonstração:

```dotenv
DEMO_MODE=false
DATABASE_PATH=./data/blindpitch-real.sqlite
ADMIN_EMAIL=organizacao@exemplo.com
ADMIN_PASSWORD=defina-uma-senha-propria-longa
HOST=127.0.0.1
PORT=3000
COOKIE_SECURE=true
SERVE_DIST=true
```

Use uma senha própria com pelo menos 12 caracteres. Credenciais administrativas só são usadas na inicialização da base vazia. Não publique `.env` nem o banco.

```powershell
npm.cmd run build
npm.cmd start
```

Use HTTPS em frente ao servidor, preservando a origem dos pedidos. `COOKIE_SECURE=true` exige HTTPS. Para demonstração por HTTP local, mantenha `false`. Para acesso na rede da feira, configure `HOST=0.0.0.0` e abra `http://IP-DO-COMPUTADOR:3000` no outro dispositivo, conforme a rede e o firewall permitirem.

Mantenha SQLite em disco persistente, fora da pasta pública, com backups. A base real recusa inicialização se contiver edições demonstrativas. A coleta experimental real depende do protocolo e dos cuidados definidos pela organização e pelo orientador.

## Publicar na Vercel com PostgreSQL

O projeto roda na Vercel com a API em funções Node.js e PostgreSQL persistente
(Neon Free ou equivalente). O guia passo a passo — criação do banco, variáveis
de ambiente, verificação e migração opcional dos dados — está em
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

```powershell
npm run db:migrate    # cria as 19 tabelas (idempotente)
npm run db:import     # simula a importação do SQLite local
```

Sem `DATABASE_URL` a aplicação continua usando SQLite, então o
`npm start` local não mudou em nada.

## Estrutura

```text
public/                 interface, temas, estilos, favicon e seis corujas transparentes
public/styles.mobile.css camada de estilos do celular (menu, tabelas, toque)
server/                 API, autenticação, validação, métricas e seed
server/db/              drivers SQLite e PostgreSQL, esquema e migrações
api/index.mjs           função Node.js da Vercel (não chama listen)
db/schema.sql           esquema SQLite, constraints e índices
db/schema.postgres.sql  esquema PostgreSQL equivalente (19 tabelas)
tests/                  HTTP, segurança, persistência, PostgreSQL e Vercel
scripts/                lint, verificação de tipos, build, migração, importação e QA de navegador
tools/typescript/       compilador oficial offline e licença; fora do runtime
docs/                   especificação, arquitetura, aceite e publicação
data/                   banco local, ignorado no Git
dist/                   build gerado, ignorado no Git
```

Veja [arquitetura e limites](docs/ARQUITETURA.md), [publicação na Vercel](docs/DEPLOY.md), [interface no celular](docs/MOBILE.md) e [critérios de aceite](docs/ACEITE.md).

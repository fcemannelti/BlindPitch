# Arquitetura do BlindPitch

## Execução

Node.js 24+ serve interface e API na mesma origem. O SQLite nativo usa WAL, chaves estrangeiras, transações `BEGIN IMMEDIATE` e índices. Não há serviços externos, CDN ou pacotes de execução. Projetos e sessões não ficam no armazenamento do navegador.

A escolha adapta a recomendação de stack à ausência de acesso ao registro npm. O compilador TypeScript oficial foi incluído em `tools/typescript`, com licença, exclusivamente para verificar JavaScript e executar lint sem internet. O build copia a interface para `dist` e gera um manifesto SHA-256; o servidor continua necessário em produção.

## Separação dos dados

- `users` e `participant_profiles`: identidade e autenticação.
- `project_authors`: vínculo privado entre identidade e projeto.
- `projects`: conteúdo científico, código, estado e versão revisada.
- `events` e `rubric_criteria`: etapas, protocolo e rubrica por edição.
- `assignments`: um vínculo por proposta e avaliador, com condição fixa.
- `reviews` e `review_scores`: rascunhos/notas e finalização única.
- `event_consents`: consentimento associado à edição e ao texto exato do protocolo.
- `sessions`: hash de token, CSRF e expiração.
- `audit_logs`: ações administrativas e do fluxo científico.

## Contrato do avaliador

As rotas `/api/assignments` e `/api/assignments/:id` constroem um DTO por lista explícita. O objeto `project` contém apenas os 18 campos científicos e o código anônimo. Todos passam pela sanitização, inclusive referências e resultados. Não retorna ID do projeto, ID do participante, cadastro, horários de criação nem relações de autoria. A avaliação usa um UUID próprio, sem relação com a identidade. A migração aditiva versão 3 e os limites estão documentados em [PROPOSTAS.md](PROPOSTAS.md).

A condição anônima nunca inclui `author`, mesmo quando `reveal_identity` está ativo. A identificada inclui apenas nome e escola/turma autorizados e exige protocolo habilitado e consentimento específico da edição. E-mail não é retornado.

Projetos enviados passam por remoção automática de identificadores conhecidos, e-mails, links e sequências numéricas identificadoras. A atribuição exige revisão manual do organizador de todos os campos da versão científica. Essa revisão deve remover também nomes de terceiros e pistas indiretas: um filtro automático não reconhece toda informação identificável em texto livre. A versão revisada fica bloqueada após a atribuição. A API reaplica a remoção de dados conhecidos nas respostas ao avaliador, inclusive comentários próprios.

As demais rotas de projetos, participantes, resultados gerais, auditoria e exportação negam acesso ao avaliador. Participantes só acessam projetos próprios. O cadastro público sempre cria `participant`.

## Etapas e integridade

`draft → submitted → assigned → under_review → reviewed → results_available`.

O organizador pode reabrir propostas enviadas sem atribuições. O código é preservado e a anonimização deve ser revisada novamente. Arquivamento é permitido após envio sem atribuições ou após a avaliação; propostas com avaliações pendentes não podem ser arquivadas.

Códigos são alocados em transação, com sequência global por ano e restrição `UNIQUE`, inclusive entre edições. Um avaliador não recebe a mesma proposta em condições diferentes para evitar reconhecimento por memória. Rubrica é bloqueada após a primeira atribuição. Finalização bloqueia edições e envios repetidos no backend.

O cadastro de rascunhos aceita o cabeçalho opcional `Idempotency-Key` (UUID). O assistente gera uma chave por confirmação e a reutiliza em tentativas após falhas de conexão. O servidor deriva um ID interno isolado por participante/edição e verifica os campos antes de retornar o registro existente. A transação registra projeto, autoria e auditoria uma única vez. Clientes antigos sem esse cabeçalho continuam compatíveis. Não foi necessária migração; o código anônimo continua independente dessa chave.

A inicialização de uma base real valida as credenciais antes de criar a edição. Edição, rubrica, configuração e organizador são inseridos em uma única transação, com rollback integral em caso de erro.

Resultados e associação de autoria para a organização exigem submissões e avaliações fechadas e nenhuma atribuição pendente. A revelação só afeta o painel do organizador. Comentários gerais aos participantes têm configuração separada. Não há dashboard público de indivíduos.

## Pontuação e pesquisa

Total ponderado = `Σ(nota × peso)`.

Pontuação normalizada = `100 × (total − Σ(mínimo × peso)) / Σ((máximo − mínimo) × peso)`.

Média, mediana, distribuição, critérios, duração e comparação usam somente avaliações finalizadas. Tempo inclui pausas entre início e fim. Não há inferência causal ou conclusão automática de discriminação. O CSV agrega métricas por condição, sem identificadores individuais.

## Segurança e limites

Senhas usam scrypt com sal aleatório. Sessões têm tokens aleatórios de 256 bits (apenas hash SHA-256 no banco), expiração em oito horas e cookie HttpOnly/SameSite Strict. Mutações autenticadas exigem CSRF e origem compatível. Login limita tentativas por IP em memória; o limite reinicia com o processo.

São permitidas até 12 falhas de login em 15 minutos por IP; um login válido não apaga falhas anteriores. O cadastro público admite até 20 tentativas por hora por IP. Entradas antigas são removidas e o mapa é limitado. O endereço usado é o da conexão, sem confiar em `X-Forwarded-For`; um proxy compartilhado requer limitação adequada também na borda. Login, sessão, logout e lista de edições independem da edição selecionada.

O servidor valida tipos, limites, campos permitidos, papel, propriedade, condição e estado. SQL usa parâmetros. A interface escapa conteúdo ao gerar HTML. CSP proíbe scripts inline, fontes externas e frames. Erros internos não retornam SQL, senhas ou stack traces. Payloads de propostas são limitados a 1 MiB para textos longos; demais rotas mantêm 128 KiB.

Para coleta real, use base separada, credenciais próprias, HTTPS com cookie Secure, acesso restrito ao computador e backups. SQLite atende uma instância local ou servidor único; múltiplas réplicas exigem outra estratégia de banco e rate limiting. Recuperação de senha por e-mail, notificações, uploads e exclusão por autosserviço não integram este MVP.

## Camada de interface e temas

A evolução visual permanece em JavaScript/CSS nativos. `theme.js` aplica o tema antes dos estilos e persiste somente a preferência em `localStorage.bp_theme`. `app.js` mantém feedback de carregamento, diálogos acessíveis e animações condicionadas à confirmação real do servidor. Todos os perfis podem consultar edições anteriores; armazenamento bloqueado ou uma seleção obsoleta não impedem navegação/autenticação.

A aplicação usa exclusivamente as seis corujas científicas em WebP lossless com alpha. Os PNG de origem são preservados e a conversão verifica igualdade RGBA completa. Arquivos estáticos oferecem ETag e respostas 304; a API continua com `no-store`. A busca filtra os projetos já carregados. O build limpa apenas seu diretório de saída validado antes de copiar os recursos e gerar hashes, evitando servir arquivos obsoletos. Veja [a interface](INTERFACE.md) e [a auditoria](AUDITORIA.md).

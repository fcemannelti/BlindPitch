# Propostas científicas detalhadas

O formulário mantém oito campos principais: título, área científica, problema, objetivo geral, metodologia, solução proposta, impacto esperado e palavras-chave. Todos exigem pelo menos três caracteres no envio. Para salvar rascunho, apenas título e área são obrigatórios.

Dez campos complementares são opcionais: resumo, justificativa, objetivos específicos, hipótese, tecnologias/materiais, relevância social, sustentabilidade, resultados esperados, resultados obtidos e referências. No cadastro e na edição do participante, cada campo ocupa uma etapa própria. A revisão de anonimização do organizador mantém a seção expansível, aberta automaticamente quando já há conteúdo. Campos opcionais vazios são omitidos na leitura da proposta.

## Assistente de cadastro e edição

O participante preenche os oito campos principais e, depois, os dez opcionais. A etapa 19, **Revise seu projeto**, apresenta todas as respostas escapadas como texto e botões para corrigir cada campo. O indicador usa a quantidade real de etapas. Avançar e Voltar preservam os controles e um objeto de estado em memória; não há armazenamento de conteúdo científico no localStorage.

Título e área exigem ao menos três caracteres após remover espaços nas bordas. A área oferece onze opções com ícones próprios, incluindo todas as áreas anteriores e Química, Física, Matemática, Biologia, Astronomia e Tecnologia. Um campo de texto preserva áreas personalizadas e valores existentes. A seleção preenche o mesmo `scientific_area` e não altera o contrato da API. Os limites permanecem iguais aos da API. Os outros seis campos principais continuam obrigatórios apenas no envio para avaliação; é permitido avançar sem preenchê-los e salvar um rascunho incompleto. Campos opcionais vazios são aceitos.

As transições levam 280 ms (140 ms para sair e 140 ms para entrar), com direção inversa ao voltar. O foco segue para o campo seguinte ou para o título da revisão. Movimento reduzido remove a animação. Validações aparecem junto ao campo, com vínculo acessível.

**Cadastrar projeto** executa o POST existente; **Salvar alterações** executa o PUT existente. Requisições em andamento e cliques repetidos são bloqueados. Falhas preservam as respostas e a revisão para tentar novamente. Somente a confirmação final grava no banco; recarregar ou sair antes dessa confirmação descarta o preenchimento em memória. O envio, a geração do código anônimo, o bloqueio e a revisão humana de anonimização continuam nas telas e rotas originais.

Validação desta melhoria: `npm.cmd run check` e `npm.cmd run test:browser`. O teste de navegador utiliza exclusivamente dados fictícios em SQLite temporário, incluindo criação, edição, opcionais vazios, falha simulada, cliques repetidos e envio real ao backend local isolado. As capturas ficam em `test-results/experience/`.

## Limites e armazenamento

| Campo | Limite de caracteres |
|---|---:|
| Título e área | 300 cada |
| Palavras-chave | 600 |
| Resumo | 4.000 |
| Metodologia | 20.000 |
| Demais textos científicos | 12.000 cada |

Frontend e API aplicam os mesmos limites. Metodologia usa textarea de dez linhas; demais textos longos, seis linhas, redimensionáveis. Requisições de propostas têm limite de 1 MiB para acomodar todos os campos em Unicode; demais rotas mantêm 128 KiB. O limite por campo continua aplicado no servidor.

A migração SQLite versão 3 acrescenta dez colunas TEXT com valor padrão vazio. Não recria tabelas nem modifica códigos, autoria, estados, notas ou atribuições. Payloads com somente os oito campos originais continuam aceitos. PUT representa substituição integral do conteúdo científico, incluindo campos opcionais omitidos como vazios.

## Demonstração

As seis propostas preservam títulos e temas, agora com aproximadamente 5.000 caracteres cada. Cada uma tem pergunta, hipótese, unidades experimentais, comparação, coleta, cronograma, análise, recursos e limitações próprios. Quantidades e prazos são planejamento fictício, não medições realizadas. Resultados obtidos informam explicitamente que não houve coleta; notas demonstrativas não representam evidência científica.

As referências de contexto foram verificadas em fontes oficiais: [EPE — Atlas da Eficiência Energética](https://www.epe.gov.br/pt/publicacoes-dados-abertos/publicacoes/atlas-da-eficiencia-energetica-brasil), [ANA — Indicadores de qualidade](https://www.gov.br/ana/pt-br/panorama-das-aguas/qualidade-da-agua/indicadores-de-qualidade), [Embrapa — Irrigas](https://www.embrapa.br/en/web/hortalicas/busca-de-solucoes-tecnologicas/-/produto-servico/572/sistema-gasoso-de-controle-de-irrigacao-irrigas), [INMET — Normais climatológicas](https://portal.inmet.gov.br/normais), [Pesquisa Agropecuária Brasileira — Filmes de amido](https://apct.sede.embrapa.br/pab/pt_BR/article/view/18525) e [MMA — Guia técnico de qualidade do ar](https://www.gov.br/mma/pt-br/assuntos/meio-ambiente-urbano-recursos-hidricos-qualidade-ambiental/qualidade-do-ar/guia-tecnico-para-o-monitoramento-e-avaliacao-da-qualidade-do-ar.pdf). São referências de contexto, sem alegação de validação dos projetos fictícios por essas instituições.

`npm.cmd run seed` e a inicialização em modo demo também enriquecem bases antigas, exclusivamente quando edição demo, conta fictícia, título, área e todos os textos correspondem ao seed antigo. Qualquer edição no conteúdo ou na versão anônima impede a substituição. Bases reais não são enriquecidas. A operação é transacional e idempotente.

## Anonimização e verificações

Todos os 18 campos passam pela mesma validação e sanitização. O avaliador recebe somente conteúdo científico aprovado e código anônimo; autoria continua separada. Links nas referências são removidos da versão anônima pela proteção existente. A organização deve revisar também autocitações e pistas indiretas nos novos campos antes de aprovar.

Testes cobrem migração de base antiga, preservação de edições e avaliações, limites por campo, payload Unicode longo, persistência via API, compatibilidade com oito campos, conteúdo fictício e correspondência dos controles do formulário. Os testes de segurança existentes verificam PII em todos os campos do contrato ampliado.

Validação final: lint e typecheck sem erros; 24 testes aprovados; quatro testes ponta a ponta via API aprovados; build e check aprovados. A verificação de layout das cinco telas afetadas realizou 70 renderizações nos sete tamanhos de tela e dois temas, sem falhas nas medições. Capturas de desktop claro e celular escuro também foram inspecionadas.

Arquivos desta alteração: `server/demo-proposals.mjs`, `server/seed.mjs`, `server/seed-cli.mjs`, `server/db.mjs`, `server/validation.mjs`, `server/app.mjs`, `db/schema.sql`, `public/app.js`, `public/styles.css`, `tests/proposals.test.mjs`, `tests/security.test.mjs`, `tests/ui.test.mjs`, `README.md`, `docs/PROPOSTAS.md`, `docs/ARQUITETURA.md` e `docs/ACEITE.md`. A base demo local foi atualizada com cópia anterior em `data/backups/`, preservando vínculos e notas.

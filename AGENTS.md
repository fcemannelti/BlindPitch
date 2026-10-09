# BlindPitch — Instruções principais para o Codex

## Missão
Construir uma aplicação web funcional chamada **BlindPitch** para o projeto **Ceará Faz Ciência 2026**, alinhado ao tema **“Ciência Delas”**.

O BlindPitch não é um site informativo. Ele deve ser uma plataforma real para **avaliação inicial anônima de projetos e ideias científicas**, com cadastro de usuários, submissão de projetos, anonimização, avaliação por critérios, armazenamento de notas, dashboards e comparação de resultados.

Slogan do projeto:

> **Primeiro a ideia. Depois, quem a criou.**

## Regra crítica de produto
Durante uma avaliação marcada como **anônima**, o avaliador **não pode receber nem visualizar** nome, foto, gênero, turma, escola ou qualquer outro dado identificável do autor.

Essa regra deve ser aplicada também no backend/API. Não basta esconder campos apenas com CSS ou JavaScript no frontend.

## Objetivo científico
A plataforma será usada para investigar a seguinte pergunta:

> A identificação do autor de uma proposta pode influenciar a forma como sua ideia científica é avaliada?

Hipótese de trabalho:

> A ocultação temporária de informações pessoais durante a primeira etapa da avaliação pode reduzir a influência de fatores externos ao conteúdo científico e aumentar o peso dos critérios objetivos.

Não afirmar que existe discriminação nem que o sistema “elimina preconceitos”. Usar linguagem científica e cautelosa, como “investiga”, “busca reduzir possíveis vieses”, “pode contribuir” e “será analisado experimentalmente”.

---

# 1. Perfis de usuário

Implementar pelo menos três papéis:

## Participante
Pode:
- criar conta e entrar;
- criar e editar projeto enquanto ainda não enviado;
- enviar projeto;
- acompanhar status;
- visualizar resultado quando liberado;
- visualizar avaliações/comentários permitidos pelo organizador.

Não pode:
- acessar dados de outros projetos;
- visualizar identidade de outros participantes;
- alterar projeto depois de bloqueado, salvo quando o organizador reabrir.

## Avaliador
Pode:
- visualizar projetos atribuídos;
- avaliar projetos usando rubrica;
- salvar rascunho de avaliação;
- finalizar avaliação;
- consultar avaliações próprias conforme regras do sistema.

Em modo anônimo, nunca deve receber dados identificáveis do autor.

## Organizador
Pode:
- criar e configurar edição/evento;
- definir rubrica;
- cadastrar/gerenciar avaliadores;
- distribuir projetos entre avaliadores;
- abrir/fechar submissões;
- acompanhar progresso;
- revelar autoria quando apropriado;
- gerar dashboards e relatórios;
- exportar dados agregados;
- configurar modo experimental anônimo/identificado.

---

# 2. Fluxo principal

1. Participante cria conta.
2. Participante cria proposta.
3. Sistema valida campos obrigatórios.
4. Ao enviar, o sistema gera um código anônimo no formato `BP-2026-XXXX`.
5. Projeto fica bloqueado para edição normal.
6. Organizador distribui o projeto para um ou mais avaliadores.
7. Avaliador recebe uma versão sanitizada da proposta.
8. Avaliador atribui notas conforme rubrica.
9. Sistema calcula total e métricas.
10. Após encerramento da etapa, organizador pode liberar autoria e resultados.
11. Dashboard apresenta dados agregados e comparações.

---

# 3. Dados de uma proposta

Campos mínimos:
- título;
- área científica;
- problema;
- objetivo geral;
- metodologia;
- solução proposta;
- impacto esperado;
- palavras-chave;
- data de criação;
- status;
- código anônimo.

Dados pessoais do autor devem ficar separados logicamente dos dados científicos do projeto.

Preferir uma modelagem em que a entidade usada pelo avaliador não carregue dados pessoais.

---

# 4. Código anônimo

Gerar código automático legível, por exemplo:

`BP-2026-0042`

Requisitos:
- único;
- persistente;
- não derivado de nome, matrícula ou identificador pessoal;
- usado em todas as telas do avaliador;
- pesquisável pelo organizador.

---

# 5. Rubrica padrão

Criar rubrica inicial com seis critérios, configurável pelo organizador:

1. Problema
2. Inovação
3. Metodologia
4. Viabilidade
5. Impacto
6. Clareza

Escala sugerida: 0 a 10 por critério.

O sistema deve:
- impedir notas fora do intervalo;
- permitir comentário por critério ou geral;
- calcular pontuação total;
- registrar horário de início/fim ou duração aproximada da avaliação;
- impedir duplicidade de avaliação pelo mesmo avaliador para o mesmo vínculo de avaliação.

---

# 6. Estados do projeto

Usar estados claros, por exemplo:

- `draft`
- `submitted`
- `assigned`
- `under_review`
- `reviewed`
- `results_available`
- `archived`

A interface deve mostrar nomes amigáveis em português.

---

# 7. Telas obrigatórias

## Públicas
- Landing page
- Entrar
- Criar conta
- Sobre o BlindPitch

## Participante
- Dashboard
- Novo projeto
- Editar rascunho
- Detalhes do projeto
- Status da avaliação
- Resultado

## Avaliador
- Dashboard de avaliações
- Projeto a avaliar
- Formulário de rubrica
- Confirmação de envio
- Histórico das próprias avaliações

## Organizador
- Dashboard geral
- Projetos
- Participantes
- Avaliadores
- Distribuição de avaliações
- Configuração da rubrica
- Configuração da edição/evento
- Resultados
- Comparações
- Exportação
- Auditoria/logs básicos

---

# 8. Dashboard do organizador

Mostrar pelo menos:
- total de propostas;
- total de avaliadores;
- avaliações concluídas;
- avaliações pendentes;
- média geral;
- distribuição das notas;
- projetos mais bem avaliados;
- quantidade por área científica;
- progresso percentual da etapa.

Criar gráficos úteis, sem inventar resultados reais.

Quando dados de demonstração forem usados, identificar claramente:

> **Dados ilustrativos — resultados reais ainda serão coletados.**

---

# 9. Modo experimental

Implementar estrutura que permita ao organizador marcar avaliações como:
- `anonymous`
- `identified`

A plataforma deve conseguir comparar os dois modos sem expor indivíduos publicamente.

Métricas desejáveis:
- média;
- mediana;
- distribuição de notas;
- diferença média entre condições;
- nota por critério;
- tempo de avaliação;
- número de avaliadores.

A aplicação não deve concluir automaticamente que uma diferença prova preconceito ou discriminação.

---

# 10. Privacidade e ética

Requisitos:
- coletar apenas dados necessários;
- proteger informações pessoais;
- separar identidade e conteúdo científico sempre que possível;
- não expor dados individuais em dashboards públicos;
- apresentar dados científicos agregados;
- informar quando um usuário participa de uma coleta experimental;
- incluir opção de consentimento/ciência quando aplicável;
- permitir ao organizador anonimizar exportações.

---

# 11. Arquitetura técnica

Antes de implementar, inspecione o repositório e escolha a stack mais adequada.

Se o repositório estiver vazio, uma opção recomendada é:
- Frontend: React + TypeScript + Vite;
- UI: CSS moderno ou Tailwind;
- Backend: Supabase ou Node.js/Express;
- Banco: PostgreSQL;
- Autenticação: Supabase Auth ou equivalente;
- Gráficos: Recharts, Chart.js ou equivalente;
- Validação: Zod ou equivalente.

Se a stack escolhida exigir internet/serviço externo para funcionar, criar também um **modo demo local** com dados seed ou mocks para facilitar apresentação na feira.

Não trocar a stack existente sem necessidade se o projeto já tiver sido iniciado.

---

# 12. Modelagem sugerida

Entidades mínimas:

## users
- id
- name
- email
- role
- created_at

## participant_profiles
- user_id
- school_or_class (opcional)
- consent_flags

## events
- id
- name
- year
- submissions_open
- reviews_open
- reveal_identity

## projects
- id
- event_id
- participant_user_id
- anonymous_code
- title
- scientific_area
- problem
- objective
- methodology
- proposed_solution
- expected_impact
- keywords
- status
- created_at
- submitted_at

## reviewers
- user_id
- active

## assignments
- id
- project_id
- reviewer_user_id
- review_mode
- status

## rubric_criteria
- id
- event_id
- name
- description
- min_score
- max_score
- weight
- order_index

## reviews
- id
- assignment_id
- reviewer_user_id
- project_id
- total_score
- general_comment
- started_at
- submitted_at

## review_scores
- id
- review_id
- criterion_id
- score
- comment

## audit_logs
- id
- actor_user_id
- action
- entity_type
- entity_id
- created_at

---

# 13. Segurança

Obrigatório:
- autenticação;
- autorização por papel no servidor/backend;
- validação de payloads;
- nenhuma rota do avaliador deve retornar PII em modo anônimo;
- não confiar apenas no frontend;
- proteger rotas administrativas;
- impedir acesso horizontal a projetos de outros usuários;
- sanitizar entradas;
- tratar erros sem vazar dados sensíveis;
- registrar ações administrativas importantes.

Criar testes específicos para verificar que um avaliador não consegue obter a identidade do autor em uma avaliação anônima, inclusive inspecionando respostas da API.

---

# 14. UX e identidade visual

Estilo:
- tecnológico;
- científico;
- jovem;
- profissional;
- acessível.

Cores sugeridas:
- azul escuro;
- azul;
- roxo;
- magenta apenas como destaque.

Usar:
- cards;
- dashboards;
- tabelas legíveis;
- gráficos;
- estados vazios;
- mensagens de sucesso/erro;
- indicadores de status;
- layout responsivo.

Destacar no painel do avaliador:

> **Avaliação anônima ativa**

Evitar visual excessivamente decorativo ou infantil.

---

# 15. Acessibilidade

Implementar:
- navegação por teclado;
- labels em formulários;
- contraste adequado;
- foco visível;
- textos alternativos quando necessário;
- sem dependência exclusiva de cor para comunicar estado;
- responsividade para celular, tablet e desktop.

---

# 16. MVP obrigatório

O primeiro marco funcional deve conter:

1. cadastro/login;
2. papéis de usuário;
3. cadastro de projeto;
4. envio de projeto;
5. código anônimo automático;
6. painel do avaliador sem PII;
7. rubrica de avaliação;
8. salvamento das notas;
9. painel básico do organizador;
10. dashboard de resultados;
11. opção de revelar autoria somente para organizador;
12. dados seed para demonstração.

Não considerar o MVP concluído se for apenas uma interface estática.

---

# 17. Critérios de aceite

Antes de declarar conclusão, verificar:

- [ ] Participante consegue criar conta e entrar.
- [ ] Participante consegue criar um rascunho.
- [ ] Participante consegue enviar a proposta.
- [ ] Sistema gera `BP-2026-XXXX` automaticamente.
- [ ] Projeto enviado não é alterado sem autorização.
- [ ] Organizador consegue atribuir projeto a avaliador.
- [ ] Avaliador visualiza o conteúdo científico.
- [ ] Avaliador NÃO recebe PII em modo anônimo.
- [ ] Rubrica salva notas corretamente.
- [ ] Total é calculado corretamente.
- [ ] Avaliação finalizada não é enviada duas vezes.
- [ ] Organizador vê o progresso das avaliações.
- [ ] Dashboard calcula métricas a partir do banco.
- [ ] Dados demonstrativos estão marcados como ilustrativos.
- [ ] Autoria não é revelada antes da configuração adequada.
- [ ] Permissões são aplicadas no backend.
- [ ] Fluxos principais possuem testes.
- [ ] Projeto possui instruções claras de execução.

---

# 18. Testes mínimos

Implementar testes para:
- login e autorização;
- criação/envio de projeto;
- geração de código anônimo;
- sanitização de resposta para avaliador;
- cálculo de notas;
- permissões por papel;
- estados inválidos do projeto;
- dashboard básico;
- fluxo principal ponta a ponta quando viável.

Executar lint, typecheck, testes e build antes de finalizar.

Corrigir erros encontrados.

---

# 19. Dados de demonstração

Criar seed/demo com:
- 1 organizador;
- 2 avaliadores;
- 3 ou mais participantes;
- 5 ou mais projetos;
- avaliações em diferentes estados.

Usar nomes e dados fictícios.

Toda visualização de resultados deve exibir claramente que são dados de demonstração.

---

# 20. Projeto demonstrativo sugerido

Pode existir um projeto fictício:

Código: `BP-2026-017`

Título: **Sistema inteligente para reduzir desperdício de energia na escola**

Problema: equipamentos permanecem ligados mesmo quando as salas estão vazias.

Solução: sistema com sensores para detectar ausência de pessoas e reduzir consumo desnecessário.

Pontuações ilustrativas podem ser usadas apenas no seed.

---

# 21. Entregáveis esperados

Ao final, o repositório deve conter:
- aplicação funcional;
- código organizado;
- README atualizado;
- arquivo de ambiente de exemplo (`.env.example`) quando necessário;
- migrações/esquema do banco;
- seed/demo;
- testes;
- instruções para rodar localmente;
- instruções para criar build de produção.

---

# 22. Forma de trabalhar

Ao receber uma tarefa ampla como “construa o BlindPitch”:

1. Leia este `AGENTS.md` por completo.
2. Inspecione os arquivos existentes.
3. Leia `docs/ESPECIFICACAO.md` e, se útil, o PDF em `docs/`.
4. Defina a arquitetura sem pedir confirmação para decisões triviais.
5. Implemente em etapas pequenas e funcionais.
6. Execute testes frequentemente.
7. Corrija erros antes de continuar.
8. Não pare em wireframes ou mockups.
9. Entregue aplicação executável.
10. Atualize a documentação ao final.

Se alguma instrução conflitar com segurança, privacidade ou integridade dos dados, priorize segurança.

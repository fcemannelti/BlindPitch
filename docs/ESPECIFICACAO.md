# BlindPitch — Especificação funcional

## Visão geral

O BlindPitch é uma aplicação web para avaliação inicial anônima de ideias e projetos científicos.

A proposta é simples: durante a primeira etapa, o avaliador analisa apenas a qualidade científica da proposta. Informações pessoais ficam separadas e ocultas. Após o encerramento da avaliação, o organizador pode liberar a autoria conforme as regras do evento.

O sistema também pode ser utilizado como ferramenta de pesquisa para comparar avaliações anônimas e identificadas de forma ética e agregada.

## Problema

Processos de avaliação podem sofrer influência de fatores externos ao conteúdo da proposta. O BlindPitch investiga se uma etapa anônima ajuda a tornar a avaliação mais centrada no problema, método, inovação, viabilidade, impacto e clareza.

## Usuários

### Participante
Cria conta, cadastra proposta, envia projeto e acompanha o status.

### Avaliador
Recebe propostas atribuídas e aplica a rubrica. Em modo anônimo, não tem acesso a dados identificáveis do autor.

### Organizador
Configura o evento, gerencia projetos e avaliadores, distribui avaliações, acompanha resultados e controla quando a identidade pode ser revelada.

## Fluxo do participante

Cadastro → Login → Novo projeto → Rascunho → Revisão → Enviar → Código anônimo → Acompanhar status → Resultado.

## Fluxo do avaliador

Login → Projetos atribuídos → Abrir `BP-2026-XXXX` → Ler proposta → Preencher rubrica → Revisar notas → Finalizar.

## Fluxo do organizador

Login → Dashboard → Configurar evento → Criar rubrica → Gerenciar avaliadores → Distribuir projetos → Acompanhar avaliações → Encerrar etapa → Analisar resultados → Revelar autoria quando permitido.

## Conteúdo exibido ao avaliador anônimo

Pode ver:
- código anônimo;
- título;
- área científica;
- problema;
- objetivo;
- metodologia;
- solução;
- impacto;
- palavras-chave.

Não pode ver:
- nome;
- foto;
- gênero;
- turma;
- escola, se identificadora;
- e-mail;
- matrícula;
- qualquer identificador pessoal.

## Rubrica inicial

- Problema: 0–10
- Inovação: 0–10
- Metodologia: 0–10
- Viabilidade: 0–10
- Impacto: 0–10
- Clareza: 0–10

O organizador pode alterar critérios, pesos e limites.

## Dashboard

Indicadores principais:
- propostas enviadas;
- avaliações concluídas;
- avaliações pendentes;
- avaliadores ativos;
- média geral;
- média por critério;
- distribuição de notas;
- progresso da etapa.

## Modo científico/experimental

A aplicação pode registrar avaliações em dois modos:

### Anônimo
Identidade não é disponibilizada ao avaliador.

### Identificado
Identidade pode ser exibida conforme protocolo experimental aprovado pelo orientador.

A análise compara dados agregados, sem rotular indivíduos como preconceituosos ou discriminatórios.

## Requisitos não funcionais

- responsivo;
- acessível;
- seguro;
- rastreável;
- simples de demonstrar em feira;
- capaz de funcionar com dados de demonstração localmente;
- arquitetura organizada;
- interface moderna.

## Identidade visual

Nome: **BlindPitch**

Slogan: **Primeiro a ideia. Depois, quem a criou.**

Estética: tecnologia + ciência + confiança + neutralidade.

Sugestão de paleta: azul escuro, azul, roxo e pequenos destaques em magenta.

## Demonstração de feira

Cenário ideal:

1. Um participante envia uma proposta.
2. A tela mostra o código anônimo gerado.
3. Um avaliador abre o projeto em outro dispositivo.
4. Nenhum dado pessoal aparece.
5. O avaliador preenche a rubrica.
6. O organizador acompanha a avaliação no dashboard.
7. O sistema atualiza gráficos e métricas.

## Resultado esperado

O projeto deve produzir:

### Resultado tecnológico
Uma aplicação web funcional para avaliação anônima.

### Resultado científico
Uma ferramenta capaz de coletar e comparar dados sobre diferentes modos de avaliação, sem inventar conclusões antes da pesquisa.

# Identidade científica e revisão de layout

A identidade visual atual usa exclusivamente as seis corujas científicas fornecidas, em PNG com alpha real. O mascote vetorial anterior foi removido. A região direita da landing contém somente os trios, alternados a cada 5 segundos; login, cadastro e áreas internas usam recortes dessas mesmas ilustrações. Consulte `INTERFACE.md` para a implementação atual.

## Problemas encontrados e correções

- Regras duplicadas para sidebar, cabeçalho, cards e autenticação faziam as proporções dependerem da ordem de sobrescritas. O CSS foi consolidado.
- Paddings e larguras distintos entre páginas foram substituídos por containers e uma escala compartilhada de 4, 8, 12, 16, 24, 32, 48 e 64 px.
- O login tinha marca/mascote pequenas, texto promocional dominante e colunas sem equilíbrio vertical. Agora a identidade ocupa uma coluna centralizada e o formulário tem largura limitada.
- Grupos de três indicadores ficavam comprimidos no celular. Todos os grupos passam a uma coluna até 640 px e mantêm ícone, número e descrição na mesma ordem.
- Formulários extensos usavam toda a largura disponível. Proposta, configuração e exportação agora compartilham uma faixa central; rubrica e anonimização têm limite próprio para conteúdo longo.
- A sidebar deixava pouco espaço útil em tablets. Até 900 px, vira navegação horizontal rolável com itens de 44 px.
- Um rótulo acessível absoluto no cabeçalho da tabela de projetos escapava do container e criava overflow em 360/390 px. Posicionar a região rolável contém o rótulo, sem removê-lo.
- Um ornamento elíptico da landing, após a rotação, excedia a área disponível em algumas larguras. Sua proporção foi reduzida para conter o desenho sem ocultar conteúdo.
- O ícone de sol tinha dois comandos de caminho incompletos, formando uma linha atravessada. O desenho do ícone foi corrigido.

## Medidas padronizadas

| Elemento | Medida |
| --- | --- |
| Conteúdo geral | Até 1400 px; gutter de 16–32 px; margens automáticas |
| Sidebar desktop | 232 px |
| Cabeçalho | Mínimo de 80 px no desktop; 72 px em tablet/celular |
| Formulários comuns | Até 850 px |
| Configuração da rubrica e anonimização | Até 1040 px |
| Login/cadastro | Composição até 1100 px; card até 460 px |
| Cards e grids | Padding/gap de 24 px; gap de 16 px no celular |
| Indicadores | 4 colunas no desktop, 2 até 1200 px, 1 até 640 px |
| Gráficos | Área de 208 px; barras contidas no card |
| Tabelas | Mínimo de 640 px com rolagem local; células de 16 px |
| Diálogos | Até 460 px; viewport menos 32 px de largura/altura |
| Mascote | 152–224 px na autenticação; 56–72 px em avisos; 120 px em estados vazios |

Os grupos que contêm três indicadores usam três colunas no desktop. Cards da mesma linha são esticados pelo grid e os números usam algarismos tabulares. Os breakpoints de layout são somente 1200, 900 e 640 px.

## Telas abrangidas

Landing, sobre, login e cadastro; dashboard/projetos do participante, criação e detalhes; dashboard, histórico e rubrica do avaliador; dashboard geral, projetos, participantes, avaliadores, distribuição, configuração da rubrica, edição/evento, resultados, comparações, exportação e auditoria do organizador. Também foram abrangidos estados vazios, confirmação, envio em andamento, sucesso e revisão da anonimização.

## Arquivos

- `public/assets/science-owls/transparent/`: seis corujas fornecidas com transparência real.
- `public/styles.css`: layout consolidado, proporções, temas e responsividade.
- `public/app.js`: somente apresentação: wrappers de largura, composição do login e SVG do ícone de sol.
- `scripts/visual-qa.mjs`: renderização e medição de layout offline, em base temporária.
- `README.md`, `docs/INTERFACE.md`, `docs/ACEITE.md`, `docs/REDESIGN.md`: documentação e roteiro de verificação.

Nenhum arquivo da API, autenticação, permissões, SQLite, esquema, seed ou cálculo de avaliações foi alterado. Os testes existentes foram mantidos.

## Verificação

Os comandos solicitados são executados separadamente e também pelo agregador:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run check
node scripts/visual-qa.mjs
```

O script visual utiliza Chrome, Chromium ou Edge instalado. Para outro caminho, configure `CHROME_PATH`. `QA_PAGES` permite uma lista de telas separada por vírgula para repetir apenas uma área durante a correção. Sem filtro, são 26 telas/estados, sete larguras (360, 390, 768, 1024, 1366, 1440 e 1920 px) e dois temas.

As capturas e as medidas ficam em `test-results/layout/`, incluindo `report.json`. A renderização usa templates reais com dados vindos de HTTP/SQLite em memória; o banco existente não é modificado. O script mede dimensões renderizadas, não apenas expressões no CSS. As capturas pausam animações nas fixtures, enquanto os testes funcionais verificam movimento reduzido e confirmação assíncrona.

Os testes E2E existentes cobrem o fluxo completo pela API. A renderização de layout não automatiza cliques, navegação assistiva ou interações de ponta a ponta no navegador. Esses limites permanecem explícitos no roteiro de `docs/INTERFACE.md`.

## Resultado final

Verificação em 07/10/2026, Node.js 24.21.0:

| Comando | Resultado |
| --- | --- |
| lint | 16 arquivos, zero erros |
| typecheck | Zero erros |
| test | 20 testes aprovados, zero falhas |
| test:e2e | 4 testes HTTP/API aprovados |
| build | Recursos e manifesto gerados em dist/ |
| check | Lint, typecheck, testes e build aprovados |
| visual-qa | 26 telas/estados, 364 renders, zero falhas de layout |

Foram inspecionadas capturas de mascote nos dois fundos, landing, login desktop/mobile, dashboard completo, projetos no celular, configuração da rubrica, anonimização, avaliação, estados vazios e diálogos. A matriz completa mede cada uma das sete larguras nos dois temas. Não foi detectado overflow global nas combinações finais; tabelas e navegação móvel mantêm sua rolagem local intencional.

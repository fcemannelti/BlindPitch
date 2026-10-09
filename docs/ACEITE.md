# Verificação do MVP

Verificação local em 07/10/2026, Node.js 24. Os checks usam HTTP e SQLite reais; não usam mocks de persistência nem dependem de serviços externos.

| Critério do AGENTS.md | Situação e evidência |
| --- | --- |
| Criar conta e entrar | Atendido — cadastro e sessão exercitados no fluxo completo HTTP. |
| Criar rascunho | Atendido — criação, edição e consulta persistidas. |
| Enviar proposta | Atendido — validação dos oito campos principais, dez complementares opcionais e transição de estado. |
| Código automático `BP-2026-XXXX` | Atendido — formato, persistência ao reabrir e unicidade concorrente entre edições. |
| Bloquear projeto enviado | Atendido — alteração e novo envio negados pela API; reabertura restrita ao organizador. |
| Organizador atribui projeto | Atendido — exige anonimização aprovada, avaliador ativo e etapa aberta. |
| Avaliador lê conteúdo científico | Atendido — contrato explícito com 18 campos científicos e código. |
| Avaliador anônimo não recebe PII | Atendido nos cenários automatizados — campos conhecidos, contatos, links e IDs não retornados; rotas laterais negadas; proteção preservada após revelação. Revisão humana obrigatória cobre pistas indiretas em texto livre. |
| Salvar notas | Atendido — rascunho parcial, recarga e finalização exercitados. |
| Calcular total | Atendido — seis notas 8 totalizam 48 e 80/100; rubrica com pesos/limites diferentes normaliza corretamente. |
| Impedir finalização duplicada | Atendido — segundo envio retorna conflito; vínculo e avaliação têm constraints únicas. |
| Organizador acompanha progresso | Atendido — métricas refletem avaliações concluídas e pendentes. |
| Dashboard calcula do banco | Atendido — estatísticas consultam projetos, vínculos, avaliações e notas finalizadas. |
| Marcar dados demonstrativos | Atendido — banner nas telas de resultados e identificação no CSV. |
| Revelar autoria no momento adequado | Atendido — fechamento das etapas e conclusão das atribuições exigidos. A condição anônima mantém seu contrato. |
| Permissões no backend | Atendido — testes por papel, propriedade, atribuição, CSRF e expiração. |
| Testar fluxos principais | Atendido — 24 testes automatizados agrupam cenários HTTP, segurança, migração, propostas extensas, persistência e renderização. |
| Instruções claras | Atendido — README inclui execução offline, contas, roteiro, checks, build e base real. |

## Checks executados

- `npm.cmd run lint`: parser TypeScript, sintaxe e regras de segurança.
- `npm.cmd run typecheck`: verificação estática do JavaScript da interface pelo TypeScript 6.0.3.
- `npm.cmd test`: 24 testes, zero falhas.
- `npm.cmd run test:e2e`: quatro testes HTTP/API, incluindo a jornada completa com múltiplos perfis; zero falhas.
- `npm.cmd run build`: recursos de produção e manifesto recursivo em `dist/`.
- `npm.cmd run check`: lint, typecheck, 24 testes e build; zero falhas.

## Limite da verificação

No redesign, a ferramenta integrada de navegador permaneceu indisponível, mas a renderização offline com Chrome headless funcionou. O script `scripts/visual-qa.mjs` mede layouts reais de 26 telas/estados nas sete larguras solicitadas e nos dois temas, além de gerar capturas para inspeção. Os testes funcionais usam HTTP/SQLite reais e verificam contraste dos tokens principais. Não houve automação de cliques nem testes assistivos em dispositivos físicos.

O anonimato de texto livre exige que o organizador faça a revisão prevista antes da atribuição. A aplicação impede pular essa etapa e exclui estruturalmente a identidade do cadastro das respostas anônimas. A pesquisa real exige protocolo e consentimento adequados, sem inferências automáticas sobre discriminação.

## Evolução da interface

Implementados temas claro/escuro, preferência persistente, seis corujas científicas fornecidas em PNG com alpha real, feedback de formulários/carregamento, toasts, diálogos acessíveis, contadores e transições com movimento reduzido. Os oito novos testes cobrem tema, falha de armazenamento, carregamento antes do CSS, confirmação assíncrona, sucesso somente após API, erro sem falso sucesso, redução de movimento, contraste de tokens e entrega HTTP de assets. Os renderizadores existentes verificam também a presença de um único controle de tema em cada tela.

No redesign anterior, API, esquema e seed foram preservados. A mascote foi redesenhada do zero e o stylesheet foi consolidado em três breakpoints. Na ampliação das propostas, o contrato científico passou a 18 campos, com migração aditiva e enriquecimento seguro do seed. A nova verificação das cinco telas afetadas (nova proposta, anonimização, detalhes, avaliação e painel do participante) realizou 70 renderizações, sem falhas de layout, nas larguras 360, 390, 768, 1024, 1366, 1440 e 1920 px em claro/escuro. Testes manuais de interação e leitor de tela permanecem no [roteiro de verificação](INTERFACE.md). Veja [propostas detalhadas](PROPOSTAS.md) e o [relatório do redesign](REDESIGN.md).

## Corujas transparentes e ícones científicos

O mascote vetorial antigo foi excluído dos assets e de todas as telas. A aplicação usa exclusivamente os seis recortes PNG RGBA fornecidos, com transparência real verificada por decodificação de alpha. A região direita da landing contém apenas os trios, com troca a cada 5 segundos e transição de 1,2 segundo. O seletor oferece 11 áreas com ícones; cards usam o símbolo correspondente à área cadastrada. Áreas personalizadas, o cadastro em 19 etapas, as permissões e os contratos de anonimização foram preservados.

Validação final: lint, typecheck e build aprovados; 27 testes automatizados, quatro testes de API, nove verificações no Chrome e 140 renderizações de dez telas em sete larguras e dois temas, sem falhas. Incluídos cadastro/edição/envio reais em SQLite temporário, prevenção de duplicidade, teclado, contornos com alpha, ausência de imagens quebradas e erros de console. Relatórios: `test-results/experience/report.json` e `test-results/layout/report.json`. Nenhum dado real foi alterado. O gerador de layout reutiliza os PNG locais, evitando duplicação das imagens em cada fixture.

# Interface do BlindPitch

## Implementação

A arquitetura existente permanece: JavaScript/CSS nativos, navegação por hash, API Node.js e SQLite. Esquema, seed, autenticação, autorização e contratos de anonimização foram preservados. O servidor reconhece `image/webp`, `image/png` e `font/woff2` na entrega de arquivos estáticos. Não foram adicionadas dependências.

### Tipografia

Duas fontes locais, sem requisição externa e sem CDN: **Source Sans 3** (peso 200–900) para interface, corpo e dados, e **Newsreader** (peso 200–800) como voz de display. Os arquivos woff2 ficam em `public/assets/fonts/`, servidos pelo próprio servidor sob a mesma CSP que já bloqueava origens externas. As fontes são variáveis, então quatro arquivos cobrem todos os pesos: `latin` e `latin-ext` para cada família (≈ 307 KB no total). Sem webfont, o navegador cai em `Segoe UI` e o layout permanece íntegro.

A serifa conduz títulos, manchetes, números de indicador e o total da rubrica; a sans conduz rótulos, navegação, tabelas e formulários. `--font-display` centraliza a escolha. O `h1` usa medida curta (`max-width` em `ch`) e entrelinha 1,06–1,2 para dar corpo à manchete sem efeito de slogan gigante.

### Direção visual

Um instrumento científico editorial: papel quente, tinta navy, um azul para interação e roxo reservado à dimensão anônima/identificada, onde a cor carrega significado. A estrutura vem de filetes e espaço negativo, não de caixas empilhadas.

- **Profundidade declarada uma vez.** Painéis e cartões usam apenas borda de 1px; sombra aparece no que realmente flutua — diálogo e aviso. Antes, cada cartão carregava borda *e* sombra larga ao mesmo tempo (o "cartão fantasma").
- **Indicadores como régua.** Os quatro cartões de métrica viraram um único contêiner com divisores: uma linha de dados, não quatro caixas soltas. Os divisores se reorganizam em 2 e 1 coluna sem laçar o último item errado.
- **Cores sem decoração.** O gradiente da barra de progresso e o gradiente da faixa da edição foram removidos. As barras e colunas usam uma cor só; o comprimento carrega o dado. A alternância `nth-child(2n)` entre azul e roxo não informava nada e sumiu.
- **Raios reduzidos e consistentes.** Três valores (5/8/12 px) em vez de doze. Pílulas ficaram apenas onde são rótulos de estado.
- **Sem bordas laterais coloridas.** Avisos, erros de formulário e o item ativo do menu abandonaram `border-left` espesso; o estado vem de fundo, tinta e peso. O item ativo usa um traço de 2px na cor do texto.
- **Marca e ícones.** O símbolo de área científica perdeu a moldura: era um retângulo dentro de outro. Os números de sequência (`01`, `02`, `03`) saíram do monoespaçado decorativo para algarismos tabulares discretos, porque ali a ordem importa.

### Movimento

Movimento apenas onde comunica estado. Transições de 140–160 ms em cor, borda e fundo. Não há mais entrada animada a cada troca de rota, fade escalonado por linha de tabela, elevação no hover de cartões ou botões, nem halo colorido no anel de proteção da identidade. Permanecem: ciclo das corujas (5 s), que é a assinatura da marca; `spinner` durante operações; `shimmer` do skeleton como indicador de progresso; e as animações do diálogo de separação da identidade. `prefers-reduced-motion` continua desligando tudo.

### Corujas científicas na página inicial

Seis recortes em WebP lossless com alpha ficam em `public/assets/science-owls/transparent/`, junto aos PNG RGBA de origem. Os grupos são Química/Física/Matemática e Biologia/Astronomia/Tecnologia. A coruja central tem proporção ligeiramente maior. A região contém somente imagens e contêineres de layout, sem card, legenda, botão ou fundo. Os arquivos têm transparência real; não se usam máscaras ou mesclagem CSS. A conversão reduz 30,4% dos bytes preservando exatamente os pixels decodificados.

A animação CSS tem ciclo de 10 segundos, com troca de trio a cada 5 segundos. A transição leva 1,2 segundo (600 ms para sair e 600 ms para entrar), de modo sequencial para manter no máximo três corujas visíveis. Não há deslocamento ou flutuação. Com `prefers-reduced-motion`, aparece somente o primeiro trio estático. A região possui nome acessível com as seis áreas; as ilustrações não geram anúncios repetidos.

### Cadastro de projetos por etapas

O formulário do participante mostra um campo por vez, com progresso automático e revisão final (19 etapas atualmente). Os campos e seus limites reutilizam o mesmo renderizador da revisão de anonimização. As respostas ficam nos controles e em estado de memória durante a navegação. O foco avança para o campo seguinte, as transições duram 280 ms e o modo de movimento reduzido é respeitado. A revisão permite corrigir qualquer campo; só a confirmação final chama a API. As regras de rascunho incompleto e envio para avaliação permanecem iguais. Veja [detalhes do cadastro](PROPOSTAS.md#assistente-de-cadastro-e-edição).

O teste `npm.cmd run test:browser` cobre interação real, teclado, validação, erros, persistência e duplicidade em perfil/SQLite temporários, além de screenshots em desktop e celular. Ele não depende de bibliotecas externas e requer Chrome/Chromium/Edge instalado (`CHROME_PATH` permite configurar o caminho).

### Temas

O `public/theme.js` é um script clássico bloqueante no head, antes do stylesheet. Ele aplica `data-theme="light|dark"` no elemento HTML. A CSP segue exigindo scripts locais, sem inline. O CSS define cores de fundo, superfície, texto, borda, ações, feedback, foco e sombras para os dois temas. `color-scheme` também adapta controles nativos.

A chave `bp_theme` contém somente `light` ou `dark`. Sem escolha manual válida, o tema acompanha `matchMedia('(prefers-color-scheme: dark)')`, inclusive mudanças do sistema. Escolhas manuais prevalecem. O evento `storage` sincroniza abas. Em armazenamento bloqueado, a alternância continua funcionando na aba, sem persistência após recarregar.

O controle possui ícones de Sol/Lua, tooltip, nome acessível dinâmico, `aria-pressed` e suporte nativo ao teclado. A interface não armazena projetos nem sessões no localStorage.

### Ilustrações internas e ícones científicos

O mascote vetorial anterior foi excluído. Login/cadastro usam a coruja de Biologia, boas-vindas usam Tecnologia, estados vazios usam Astronomia, avaliação anônima usa Física e operações usam Química. Todas são as mesmas ilustrações fornecidas, recortadas com alpha e proporção 1:1. As imagens de apoio são decorativas; as mensagens permanecem em texto.

O seletor de área oferece 11 botões nativos com `aria-pressed`, símbolos SVG e indicação de seleção por fundo, peso e marca de confirmação. Preserva o campo `scientific_area`, os valores antigos e texto livre para outras áreas. Os cards usam a mesma função de mapeamento por nome normalizado; uma área desconhecida recebe um ícone de documento, sem atribuição aleatória. A seleção funciona com Tab e Enter e não altera o banco ou contrato da API.

### Feedback e transições

- Entrada de páginas: sem animação. A troca de rota é instantânea e o conteúdo já está visível.
- Cartões e botões: mudam borda e fundo no hover; nada se desloca nem se eleva. Foco visível por contorno de 2px.
- Menu: estado ativo por fundo, peso e um traço de 2px; tabelas: hover e foco de linha por fundo.
- Contadores: um ciclo de `requestAnimationFrame` de 750 ms por página; o ciclo anterior é cancelado. O valor final permanece disponível a leitores de tela durante a animação.
- Gráficos: as barras e colunas aparecem já dimensionadas, sem animação de escala, para que o eixo não pareça crescer enquanto a pessoa lê o rótulo.
- Skeletons: exibidos quando uma navegação leva mais de 180 ms; não substituem formulários enquanto uma operação de salvamento está em curso.
- Formulários: hover/foco/erro/sucesso discreto, mensagens vinculadas por `aria-describedby`, `aria-invalid` e preservação dos campos após erro. Botões ficam ocupados e desabilitados durante a requisição. Acesso por HTTP na rede local não depende de APIs criptográficas do navegador para validar campos.
- Toasts: success/error/warning/info, máximo de quatro visíveis, entrada/saída suaves, botão fechar e timeout pausado por foco/hover.
- Diálogos de confirmação: padrão visual compartilhado, foco inicial em Voltar, cancelamento com Escape e restauração de foco.

### Operações importantes

Envio, aprovação da anonimização e avaliação finalizada possuem acompanhamento visual. Enquanto a API está pendente, aparece “Aguardando confirmação do servidor”. A sequência visual de aproximadamente 1,25 s começa depois da resposta de sucesso. O código exibido é o retornado pela submissão ou o código persistente da proposta cuja revisão foi aprovada. Nenhum código fictício é mostrado como resultado.

A representação usa apenas rótulos genéricos (Nome, Escola, Turma); não consulta nem injeta identidade no diálogo. O texto esclarece que a revisão do organizador continua necessária. Falhas removem o acompanhamento, preservam a tela e apresentam erro. A API mantém os bloqueios de estado e duplicidade.

### Responsividade e acessibilidade

O stylesheet foi consolidado, removendo as antigas camadas de sobrescritas. Os principais breakpoints são 1200, 900 e 640 px; o seletor de edição permite quebra de linha abaixo de 1100 px. O conteúdo usa `min(100% - 2 × gutter, 1400px)`, com gutter de 16–32 px e margens automáticas. Cabeçalho e rodapé seguem os mesmos eixos; a sidebar tem 232 px e passa a navegação horizontal até 900 px.

Formulários comuns ficam em uma faixa central de até 850 px; configuração da rubrica e anonimização admitem até 1040 px. Login/cadastro usam uma composição até 1100 px, com card até 460 px e identidade centralizada na outra coluna. Em celular, mascote/marca/slogan precedem o formulário. Os indicadores usam quatro colunas no desktop, duas até 1200 px e uma até 640 px (grupos de três usam três no desktop). Painéis de gráficos usam duas colunas quando há espaço, com altura de gráfico de 208 px.

Cards compartilham padding, radius e gaps. Tabelas têm células alinhadas, largura mínima de 640 px e rolagem dentro de uma região posicionada, inclusive para conter os rótulos acessíveis absolutos. Formulários usam minmax(0,1fr), campos sem largura mínima implícita e fonte de 16 px no celular. Diálogos usam margens automáticas e largura/altura limitadas pela viewport.

Os controles têm foco visível, campos maiores e mensagens sem dependência exclusiva da cor. Tokens principais de texto/ações/feedback são testados para contraste mínimo de 4,5:1. `prefers-reduced-motion: reduce` remove animações, transições, blur e contadores animados; os valores finais permanecem visíveis. Diálogos nativos tornam o fundo inerte e contêm o foco.

## Verificação automatizada

Executar:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run test:e2e
npm.cmd run build
npm.cmd run check
```

Os testes existentes continuam verificando HTTP/SQLite, identidade ausente das respostas anônimas, permissões, estados, rubricas, resultados e persistência. Os novos testes verificam tema, storage bloqueado, ordem do carregamento, confirmação assíncrona, bloqueio de cliques repetidos, ausência de sucesso antecipado/falso, erros da API, movimento reduzido, contraste dos tokens e entrega HTTP de tema/SVG. Os testes da experiência usam DOM controlado, sem simular medidas visuais. O typecheck cobre os dois arquivos JavaScript públicos. O build inclui hashes de todos os recursos públicos, inclusive assets aninhados.

## Verificação de layout e roteiro de interação

A ferramenta integrada de navegador e o helper de Computer Use estavam indisponíveis. A renderização offline com Chrome headless funcionou: `node scripts/visual-qa.mjs` gera 364 combinações (26 telas/estados × sete larguras × dois temas), relatório geométrico e capturas em `test-results/layout/`. Ela usa os renderizadores reais contra uma API/SQLite em memória. Iframes de viewport exata evitam a largura mínima de 500 px da janela nativa do Chrome. As animações são pausadas somente nas fixtures de captura para estabilizar a medição.

As verificações cobrem overflow global, limites de cards/campos/tabelas, centralização de conteúdo/formulários, alturas dos cards da mesma linha, posição dos números, carregamento/proporção da mascote e centralização/altura dos diálogos. O estado de sucesso visual é uma fixture baseada no template real; o comportamento assíncrono continua testado por `tests/experience.test.mjs`. A navegação por cliques e a avaliação com leitor de tela permanecem no roteiro manual abaixo; não foram simuladas como concluídas.

Use uma base separada para QA, sem modificar a base atual:

```powershell
$env:DATABASE_PATH='./data/blindpitch-ui-qa.sqlite'
$env:DEMO_MODE='true'
npm.cmd start
```

1. Em 360, 390, 768, 1024, 1366, 1440 e 1920 px, percorra landing/sobre/login/cadastro, participante, avaliador e todas as áreas do organizador. Confira cabeçalhos, cards, tabelas, rubrica, edição, gráficos e diálogos nos dois temas.
2. Sem `bp_theme`, altere a preferência do sistema e recarregue. Escolha o tema manualmente e confirme persistência, prioridade, sincronização entre abas e ausência de flash.
3. Cadastre uma pessoa fictícia; entre; crie e edite um rascunho; teste um envio inválido e depois um válido; confirme o código real após a resposta; confira o bloqueio de edição.
4. Como organizador, revise a versão científica, observe a coruja científica e o código persistente, distribua avaliações anônima/identificada conforme consentimento e teste configurações, exportação e auditoria.
5. Como avaliador, confirme conteúdo científico e ausência de identidade do autor nas respostas anônimas da aba Network. Salve rascunho, finalize e confira o histórico. Finalização repetida deve continuar negada pela API.
6. Termine as atribuições, feche etapas e libere resultados; confirme resultados do participante e regras de revelação para organizador.
7. Navegue somente com teclado: alternador, menu, tabelas, formulários, toasts e diálogos. Teste Escape/Voltar/Confirmar, foco inicial/restauração e leitor de tela.
8. Ative movimento reduzido; confirme valores finais imediatos e ausência de movimento não essencial. Simule servidor indisponível: nenhum sucesso/código deve ser fabricado.
9. Saia da conta e confirme que sessão e permissões continuam protegidas.

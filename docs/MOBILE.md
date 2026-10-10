# Interface no celular

Como a interface se adapta ao telefone, e como isso é verificado.

## O problema que motivou a mudança

Com doze destinos no menu do organizador, a barra lateral virava uma faixa de
rolagem horizontal no celular. Em 320 px apareciam três itens e nada indicava que
existiam os outros nove. As tabelas de participantes, atribuições, resultados e
auditoria seguiam o mesmo caminho: rolagem horizontal cortando e-mail, nome e
nota, sem nenhuma pista de que dava para arrastar.

Nada disso quebrava a página — não havia rolagem horizontal acidental. O
problema era o conteúdo ficar escondido.

## O que mudou

### Menu recolhível

A partir de 900 px a barra lateral vira um botão **Menu** ao lado da marca.
Fechado, ocupa só uma linha; aberto, revela todos os destinos empilhados, com
48 px de altura cada. Nada foi removido do menu.

- Botão com `aria-expanded` e `aria-controls`;
- `Escape` fecha e devolve o foco ao botão;
- clicar fora também fecha;
- navegar fecha o menu;
- `Enter` abre pelo teclado.

Os ouvintes ficam no `document` e são registrados **uma única vez**: `bind()`
roda a cada tela e um ouvinte por renderização acumularia execuções duplicadas.

### Tabelas como cartões

Abaixo de 700 px cada linha da tabela vira um cartão, e cada célula repete o
rótulo da coluna que substitui. Nenhum dado some: o cabeçalho continua no DOM,
recortado para leitores de tela.

Os rótulos são derivados do próprio `<thead>` em `enhancePage()`, e não escritos
à mão em cada template. Assim uma coluna nova ou uma tabela nova já aparece
corretamente no celular sem tocar em marcação.

### Alvos de toque

Piso de 44 px para links do cabeçalho, marcas, botões de tema, `summary`,
escolhas e rótulos de opção. O alvo de um checkbox é o rótulo inteiro, não o
quadradinho de 18 px.

### Legibilidade

Piso de 11 px para todo texto até 900 px. Antes, etiquetas de 9 px e 10 px
desapareciam em tela pequena.

### Formulários

Todos os campos passam a 16 px no celular. Abaixo disso o iOS aplica zoom ao
focar. As regras do assistente, das notas e do seletor de edição têm
especificidade maior que a regra geral, então precisaram ser reaffirmadas.

Diálogos de confirmação ganham altura limitada à tela, rolagem interna e botões
de ação grudados no rodapé — o teclado virtual não pode empurrar a confirmação
para fora da vista.

### Cabeçalho público

Duas linhas em vez de três quebradas: marca, ação principal e tema na primeira;
links numa faixa rolável na segunda. Em telas abaixo de 400 px a marca cede um
ponto de fonte para que os três caibam juntos.

## Onde está

`public/styles.mobile.css` — a camada do celular, separada de `styles.css` e
organizada por preocupação (navegação, tabelas, toque, legibilidade,
cabeçalho, formulários), não por tela. Carregado depois de `styles.css` em
`index.html`, então sobrepõe apenas o que ainda não estava resolvido.

As media queries antigas continuam valendo: esta camada completa o que faltava.

## Como verificar

```powershell
npm run test:responsive    # 32 telas x 7 larguras = 224 medições
npm run test:touch         # menu, foco, teclado, campos e tabelas
npm run shots -- 320,390   # capturas directed (--full para página inteira)
```

`responsive-qa` mede no navegador renderizado, em Chrome headless:

- rolagem horizontal acidental;
- elementos que vazem da viewport;
- alvos de toque pequenos;
- texto abaixo de 11 px.

Ele cobre 320, 360, 390, 430, 768, 1024 e 1440 px nas telas públicas e nos
três papéis, e **primeiro se autotesta**: injeta um elemento largo conhecido e
confirma que o instrumento o acusa. Um auditor que nunca falha pode estar
quebrado.

`touch-qa` verifica o comportamento, não só a aparência: abrir e fechar o menu,
os doze destinos presentes, `Escape`, retorno de foco, navegação por teclado,
fonte mínima dos campos e a conversão da tabela em cartão.

Ambos encerram com código 1 quando encontram problema, para poderem entrar em
verificação automática.

## Limitações conhecidas

- `scripts/visual-qa.mjs` renderiza por `srcdoc`, sem servidor. Imagens com
  caminho absoluto não carregam ali, então ele acusa "coruja não carregou" em
  todos os renders. **Não há nenhum problema de layout** nos 364 renders: as
  154 falhas são só as imagens. Para conferir imagens de verdade use
  `scripts/shots.mjs` e `responsive-qa`, que sobem o servidor.
- O botão de tema só aparece no celular; no desktop o menu já está visível e o
  botão seria redundante.

# Corujas científicas com transparência

Os seis arquivos PNG RGBA são recortes das seis corujas fornecidas em `BlindPitch_6_Corujas_Leve.zip`. A extração foi feita com a ferramenta integrada de edição de imagens (image_gen), com `transparent_background=true`, sem criar novos personagens. A aplicação utiliza agora as conversões WebP lossless destes recortes, com alpha real. Os PNG transparentes e os WebP originais da pasta superior permanecem como referência.

Arquivos: `coruja-quimica.png`, `coruja-fisica.png`, `coruja-matematica.png`, `coruja-biologia.png`, `coruja-astronomia.png` e `coruja-tecnologia.png`.

Prompt aplicado separadamente a cada original:

> Use case: background-extraction. Edit target: the provided original BlindPitch scientist owl image. Remove ONLY the cream background and ground shadow, replacing them with actual transparent alpha. Keep exactly the same provided owl, pose, feather edges, face, costume, accessories, scientific objects, colors, proportions and square canvas. Keep light/white clothing opaque. Cut out empty gaps between accessories and limbs. Preserve delicate feathers and thin scientific accessories with clean antialiased edges and no cream fringe. Do not redraw, restyle, invent or add any mascot, object, text, background or frame. Deliver one transparent PNG cutout for use directly on a dark website background.

Verificação: `tests/wizard.test.mjs` decodifica os PNG e verifica alpha, cantos transparentes, corpo opaco e contornos com antialiasing. O teste no navegador confirma os pixels transparentes dos arquivos carregados e ausência de CSS de mesclagem ou máscaras.

## Conversão de formato sem alteração dos pixels

`scripts/encode-owls.mjs` usa `cwebp -lossless -exact -metadata icc -m 6` e decodifica com `dwebp -pam`. Compara todos os bytes RGBA com os PNG de origem; os seis arquivos são idênticos após decodificação. Total: 10.390.844 → 7.235.264 bytes (30,4% menor), preservando resolução e contornos. Não houve nova geração ou edição visual nesta conversão.

Para reproduzir, instale as ferramentas oficiais libwebp ou configure `CWEBP` e `DWEBP` com os caminhos dos executáveis, depois execute `node scripts/encode-owls.mjs`. Elas são opcionais e não participam da execução ou do build. O relatório de hashes fica em `test-results/lossless-assets.json`. O Chrome pode arredondar a pré-multiplicação de RGB semitransparente diferentemente entre PNG e WebP; o teste de navegador exige alpha idêntico e diferença visual máxima de 2/255, além da comparação binária independente feita pelo conversor.

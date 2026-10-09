# BAINHA — Colina das Costuras · WebGL

Um platformer 3D colorido para navegador, com saltos entre plataformas, caminhos elevados, carretéis para coletar e uma fita luminosa que cria pontes e lança a personagem. Three.js renderiza o mundo em **WebGL 2** e Rapier calcula as colisões. A direção de jogo segue a clareza e o ritmo de plataformas 3D de câmera automática; Iri, o cenário e os mecanismos são originais. Esta entrega contém uma fase fixa jogável.

## Jogar

A versão estática fica em `../prototipo/`. No GitHub Pages deste repositório, sua rota é `/roblox/prototipo/` depois de uma publicação bem-sucedida.

Para testar no computador sem servidor, gere o arquivo único:

```sh
npm run build:html
```

Abra `../prototipo/BAINHA.html` com Chrome ou Edge. O HTML incorpora código, estilos, física WASM e avisos de licença; não precisa de internet. Requer WebGL2 e WebAssembly disponíveis no navegador. No celular, prefira o link publicado, pois alguns gerenciadores de arquivos abrem HTML em uma prévia sem JavaScript.

- PC: **WASD/setas** para mover, **Espaço** para saltar, **E** para costurar/tensionar/liberar, **Esc** para cancelar a seleção ou pausar.
- Celular: na área circular inferior, **arraste** para mover; durante o movimento, **empurre mais para cima** para saltar sem tirar o polegar. Retorne à região central do controle antes de repetir o gesto. Um toque rápido também salta; **segure parado e solte** para usar a fita. Durante a pressão, arrastar para baixo cancela. Os botões de salto e costura oferecem outra forma de jogar.
- Gamepad: analógico esquerdo, botão inferior para salto e gatilho direito para costura. Mapeamento implementado; hardware físico ainda não verificado.

## Percurso

1. Corra pelo gramado e salte entre os dois degraus suspensos até chegar ao pomar. Carretéis amarelos indicam o percurso; as bobinas azuis ficam em desvios elevados.
2. No anel dourado ao fim do pomar, teça uma ponte de fita e atravesse até a próxima ilha.
3. Aproxime-se do Tesourisco, teça outra fita e tensione. Quando ele errar o bote, libere a tensão para capturá-lo e abrir a passagem.
4. Salte até a plataforma da flor. Teça e tensione a raiz. Quando a flor acender, libere para voar até o jardim mais alto. Chegue à grande flor para concluir.

Quedas devolvem ao último apoio e preservam mecanismos já resolvidos. O menu de pausa permite reiniciar. O alvo de costura é contextual para esta fase: a demonstração não implementa seleção livre entre vários pares.

## Arquitetura WebGL

- `src/game.ts`: simulação independente da cena, controlador cinemático Rapier, colisões, saltos, coletáveis, checkpoints e estados da fita.
- `src/view.ts`: apresentação Three.js, geometria original, iluminação, animação e câmera automática. Malhas estáticas são agrupadas por material para reduzir chamadas de desenho.
- `src/main.ts`: normalização das entradas de teclado, controle e toque; integração da simulação em passos fixos de 1/60 s; atualização da interface DOM. Segurar a costura desacelera a simulação.
- `index.html` / `src/style.css`: interface responsiva em português, com área central livre para ver os pousos.
- `scripts/standalone.mjs`: incorpora o build, estilos, física WASM e licenças em um HTML único, sem recursos externos.

## Desenvolvimento

Use Node.js 24 e npm. A instalação usa um lockfile:

```sh
cd /workspace/roblox/bainha
npm --cache /workspace/.npm-cache ci --no-audit --no-fund
npm run dev
```

Para verificar e gerar os arquivos servidos pelo Pages:

```sh
npm test
npm run build
```

O build substitui apenas a pasta gerada `../prototipo/`. Não armazene conteúdo manual nesse diretório. Os arquivos do MonoBlock na raiz são independentes.

Para conferir a versão de produção em múltiplos arquivos, sirva a raiz do repositório por HTTP e abra o subdiretório `prototipo/`. Essa versão usa recursos externos relativos; para abrir diretamente por `file://`, use o arquivo único `BAINHA.html` gerado por `npm run build:html`.

```sh
python3 -m http.server 8001 --bind 127.0.0.1 --directory /workspace/roblox
```

Os testes de navegador usam Python Playwright e `/usr/bin/chromium`, quando disponíveis:

```sh
python3 tests/browser-smoke.py
```

Consulte o cabeçalho desse script para suas opções e destino das evidências. Capturas e resultados não devem ser publicados junto ao jogo.

Para verificar o arquivo único com a rede desabilitada:

```sh
BAINHA_URL=file:///workspace/roblox/prototipo/BAINHA.html BAINHA_OFFLINE=1 BAINHA_ARTIFACTS=/workspace/onboarding/bainha-html python3 tests/browser-smoke.py
```

Se o navegador gerenciado bloquear navegação `file://`, valide o conteúdo exato como fixture HTML offline, sem alterar políticas do navegador:

```sh
BAINHA_HTML_FILE=/workspace/roblox/prototipo/BAINHA.html BAINHA_OFFLINE=1 BAINHA_ARTIFACTS=/workspace/onboarding/bainha-html python3 tests/browser-smoke.py
```

Esse segundo modo comprova funcionamento sem recursos externos, mas não comprova a abertura direta por `file://` naquele navegador.

## Escopo e limitações

- Uma fase fixa de demonstração, sem geração procedural ou campanha completa.
- Uma fita ativa, colisão por cápsula Rapier, saltos com tolerância de borda e antecipação de comando, coletáveis, checkpoints, inimigo, portões, lançamento e conclusão.
- Personagem animada, nuvens, árvores e cenário compostos de geometrias originais; arte estilizada de protótipo.
- Câmera automática e controles de retrato. Emulação não comprova ergonomia, desempenho térmico ou compatibilidade em todos os aparelhos.
- Sem contas, telemetria, serviços de terceiros ou armazenamento de progresso entre visitas.
- Não há instaladores nativos nem código Unity nesta demonstração. O jogo nesta pasta usa o navegador como plataforma de execução.

## Dependências

Three.js e Rapier são distribuídos sob licenças permissivas. Consulte `THIRD_PARTY_NOTICES.txt` no projeto e no diretório publicado para os avisos de licença incluídos na distribuição.

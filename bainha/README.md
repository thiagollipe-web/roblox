# BAINHA — Colina das Costuras · 2,5D WebGL

Um jogo de plataforma lateral **2,5D** para navegador: personagem e cenário em 3D, movimento da esquerda para a direita e câmera acompanhando de lado. Há saltos entre plataformas, caminhos elevados, carretéis para coletar e uma fita luminosa que cria pontes e lança a personagem. Three.js renderiza o mundo em **WebGL 2** e Rapier calcula as colisões. Iri, o cenário e os mecanismos são originais. Esta entrega contém uma fase fixa jogável, com enquadramento pensado para tela horizontal.

## Jogar

A versão estática fica em `../prototipo/`. No GitHub Pages deste repositório, sua rota é `/roblox/prototipo/` depois de uma publicação bem-sucedida.

Para testar no computador sem servidor, gere o arquivo único:

```sh
npm run build:html
```

Abra `../prototipo/BAINHA.html` com Chrome ou Edge. O HTML incorpora código, estilos, física WASM e avisos de licença; não precisa de internet. Requer WebGL2 e WebAssembly disponíveis no navegador. No celular, prefira o link publicado, pois alguns gerenciadores de arquivos abrem HTML em uma prévia sem JavaScript.

- PC: **A/D ou ←/→** para andar, **Espaço, W ou ↑** para saltar, **E** para costurar/tensionar/liberar, **Esc** para cancelar a seleção ou pausar.
- Celular: prefira a tela deitada. Na área circular inferior, **arraste para os lados** para mover; durante o movimento, **empurre mais para cima** para saltar sem tirar o polegar. Retorne à região central do controle antes de repetir o gesto. Um toque rápido também salta; **segure parado e solte** para usar a fita. Durante a pressão, arrastar para baixo cancela. Os botões de salto e costura à direita também funcionam com o segundo dedo. A tela vertical continua utilizável.
- Gamepad: analógico esquerdo para os lados, botão inferior para salto e gatilho direito para costura. O eixo vertical não move a personagem em profundidade. Mapeamento implementado; hardware físico ainda não verificado.

## Arte e fluidez

O menu de pausa oferece **Gráficos → Automáticos / Mais detalhes / Mais desempenho**. O automático começa com sombras simples e um orçamento de até 1280 × 720 pixels, mesmo em monitores grandes ou com alta densidade de pixels. Se a lentidão persistir, reduz a resolução em etapas, sem alterar a física, a câmera ou a nitidez da interface HTML. O modo Mais detalhes ativa sombras dinâmicas e um orçamento de até 1920 × 1080 pixels; Mais desempenho mantém sombras simples e resolução fixa dentro do orçamento menor. A preferência vale para a sessão atual.

O cenário usa objetos repetidos em lotes, iluminação com sombras seletivas e geometrias de fita preparadas antecipadamente. A personagem balança braços e pernas na corrida, muda a postura no salto, comprime o corpo ao pousar e acena após um tempo em repouso. Árvores, flores, nuvens e coletáveis também se movimentam. Os shaders são preparados durante a abertura para reduzir engasgos na primeira interação.

Os lotes de árvores, flores, nuvens, colinas, coletáveis e anéis enviam apenas as instâncias próximas à janela da câmera. A seleção considera a paralaxe, o tamanho dos objetos e uma margem fora do quadro, incluindo sombras próximas. Objetos distantes deixam de exigir atualizações de matrizes e voltam antes de entrar na tela; nenhum item é removido da simulação.

A direção de arte combina um jardim de tecido com terra em camadas: bordas costuradas, pedras arredondadas, copas com variações de cor e uma trama procedural discreta nas roupas e fitas. As plataformas finas dos caminhos extras têm acabamento coral para diferenciá-las do chão sólido. Olhos, cabelo e mochila de Iri foram desenhados para continuar legíveis na câmera lateral. Todos esses detalhes são gerados no próprio jogo, sem baixar imagens ou modelos externos.

## Percurso

1. Avance para a direita pelo gramado e salte entre os dois degraus suspensos até chegar ao pomar. Carretéis amarelos indicam o percurso; as bobinas azuis ficam em plataformas elevadas. As plataformas finas dos caminhos extras permitem saltar por baixo e pousar por cima.
2. No anel dourado ao fim do pomar, teça uma ponte de fita e atravesse até a próxima ilha.
3. Aproxime-se do Tesourisco, teça outra fita e tensione. Quando ele errar o bote, libere a tensão para capturá-lo e abrir a passagem.
4. Salte até a plataforma da flor. Teça e tensione a raiz. Quando a flor acender, libere para voar até o jardim mais alto. Chegue à grande flor para concluir.

Quedas devolvem ao último apoio e preservam mecanismos já resolvidos. O menu de pausa permite reiniciar. O alvo de costura é contextual para esta fase: a demonstração não implementa seleção livre entre vários pares.

## Arquitetura WebGL

- `src/game.ts`: simulação independente da cena, controlador cinemático Rapier, colisões, saltos, coletáveis, checkpoints e estados da fita.
- `src/view.ts`: apresentação Three.js, geometria original, iluminação, animação e câmera automática. Malhas estáticas são agrupadas por material para reduzir chamadas de desenho.
- `src/main.ts`: normalização das entradas, simulação em passos fixos de 1/60 s e interface DOM atualizada quando seu estado muda. A pausa suspende os desenhos WebGL.
- `src/motion.ts`: interpola a posição visual entre passos da física para manter movimento contínuo em telas de diferentes frequências. Reinícios, quedas e mudanças de apoio redefinem a interpolação.
- `src/quality.ts`: limita a quantidade de pixels renderizados e adapta a resolução após lentidão contínua, distinguindo pausas e travadas isoladas de uma sequência de quadros lentos.
- `index.html` / `src/style.css`: interface responsiva em português, com área central livre para ver os pousos.
- `scripts/standalone.mjs`: incorpora o build, estilos, física WASM e licenças em um HTML único, sem recursos externos.

Teclado, toque e gamepad passam pela mesma conversão: direita na tela corresponde ao sentido positivo de Z no mundo. A câmera fica no lado negativo de X; a física limita a personagem ao plano X=0, preservando os saltos em Y. Cenário e personagens continuam tridimensionais. As plataformas bônus possuem colisão apenas no pouso por cima, mantendo livre o caminho principal.

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

O padrão verifica desktop e celular em tela horizontal. Use `BAINHA_DEVICE=desktop` ou `BAINHA_DEVICE=mobile` para repetir somente um perfil; `BAINHA_DEVICE=portrait` exercita a adaptação vertical. Use `BAINHA_ARTIFACTS` para escolher a pasta de evidências. Capturas e resultados não devem ser publicados junto ao jogo.

Para verificar especificamente as direções de tela e a animação ao longo do tempo:

```sh
python3 tests/controls-animation-smoke.py
```

Esse teste projeta o deslocamento pela câmera real, verifica controles laterais e arrastos, testa os atalhos de salto e captura poses de repouso, corrida e salto. A cobertura de gamepad usa uma entrada emulada, sem substituir o teste em um controle físico.

Para verificar cancelamento de comandos, repetição de teclas, botões com dois dedos, foco dos menus e recuperação após perda do contexto gráfico:

```sh
python3 tests/input-recovery-smoke.py
```

Esse teste requer a versão servida por HTTP para conferir o recarregamento real após a restauração de WebGL. Use `BAINHA_URL` para indicar outro endereço e `BAINHA_ARTIFACTS` para salvar as evidências. O gamepad é emulado; a perda e a restauração gráfica usam a extensão nativa `WEBGL_lose_context`.

Para verificar o arquivo único com a rede desabilitada:

```sh
BAINHA_URL=file:///workspace/roblox/prototipo/BAINHA.html BAINHA_OFFLINE=1 BAINHA_ARTIFACTS=/workspace/onboarding/bainha-html python3 tests/browser-smoke.py
```

Se o navegador gerenciado bloquear navegação `file://`, valide o conteúdo exato como fixture HTML offline, sem alterar políticas do navegador:

```sh
BAINHA_HTML_FILE=/workspace/roblox/prototipo/BAINHA.html BAINHA_OFFLINE=1 BAINHA_ARTIFACTS=/workspace/onboarding/bainha-html python3 tests/browser-smoke.py
```

Esse segundo modo comprova funcionamento sem recursos externos, mas não comprova a abertura direta por `file://` naquele navegador.

## Medição de desempenho

`tests/performance-smoke.py` compara a mesma cena em desktop e retrato, contando comandos WebGL e triângulos, além de registrar intervalos entre quadros e tempo do código por quadro. Use o modo `high` para comparar versões com a mesma resolução. A comparação rejeita diferenças no tamanho real do buffer de desenho.

```sh
python3 tests/performance-smoke.py --help
```

As medições com Chromium/SwiftShader neste ambiente são comparações de software, não previsões de FPS no computador ou celular do jogador. Os testes de jogabilidade continuam sendo executados separadamente, com entradas reais de teclado e toque emulado.

## Escopo e limitações

- Uma fase fixa de demonstração, sem geração procedural ou campanha completa.
- Uma fita ativa, colisão por cápsula Rapier, saltos com tolerância de borda e antecipação de comando, coletáveis, checkpoints, inimigo, portões, lançamento e conclusão.
- Personagem animada, nuvens, árvores e cenário compostos de geometrias originais; arte estilizada de protótipo.
- Câmera lateral automática, movimento em um plano e interface para tela horizontal, com adaptação em retrato. Emulação não comprova ergonomia, desempenho térmico ou compatibilidade em todos os aparelhos.
- Sem contas, telemetria, serviços de terceiros ou armazenamento de progresso entre visitas.
- Não há instaladores nativos nem código Unity nesta demonstração. O jogo nesta pasta usa o navegador como plataforma de execução.

## Dependências

Three.js e Rapier são distribuídos sob licenças permissivas. Consulte `THIRD_PARTY_NOTICES.txt` no projeto e no diretório publicado para os avisos de licença incluídos na distribuição.

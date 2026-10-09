# BAINHA — demonstração de navegador

Uma pequena fase 3D dos Jardins de Porcelana, com quatro ilhas, três trechos de travessia e uma fita luminosa. É uma demonstração da mecânica em Three.js e Rapier, não um projeto Unity nem a campanha de 75 fases.

## Jogar

A versão estática fica em `../prototipo/`. No GitHub Pages deste repositório, sua rota é `/roblox/prototipo/` depois de uma publicação bem-sucedida.

- PC: **WASD/setas** para mover, **Espaço** para saltar, **E** para costurar/tensionar/liberar, **Esc** para cancelar a seleção ou pausar.
- Celular: na área circular inferior, **arraste** para mover, **toque** para saltar, **segure e solte** para usar a fita. Durante a pressão, arrastar para baixo cancela. Os botões laterais oferecem uma alternativa acessível.
- Gamepad: analógico esquerdo, botão inferior para salto e gatilho direito para costura. Mapeamento implementado; hardware físico ainda não verificado.

## Percurso

1. Teça a primeira passagem e caminhe pelo centro da fita.
2. Na segunda ilha, teça outra fita e tensione. Espere o Tesourisco errar o bote; libere a tensão para capturá-lo e abrir o portão.
3. Na terceira ilha, entre no círculo dourado. Teça e tensione a raiz. Quando o joelho estiver apoiado (indicação na tela), libere para voar até o terraço. Alcance a fonte para concluir.

Quedas devolvem ao último apoio e preservam mecanismos já resolvidos. O menu de pausa permite reiniciar. O alvo de costura é contextual para esta fase: a demonstração não implementa seleção livre entre vários pares.

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

Para conferir a versão de produção, sirva a raiz do repositório por HTTP e abra o subdiretório `prototipo/`. Abrir o HTML diretamente por `file://` não é suportado por módulos JavaScript/WASM.

```sh
python3 -m http.server 8001 --bind 127.0.0.1 --directory /workspace/roblox
```

Os testes de navegador usam Python Playwright e `/usr/bin/chromium`, quando disponíveis:

```sh
python3 tests/browser-smoke.py
```

Consulte o cabeçalho desse script para suas opções e destino das evidências. Capturas e resultados não devem ser publicados junto ao jogo.

## Escopo e limitações

- Uma fase fixa de demonstração, sem geração procedural ou campanha completa.
- Uma fita ativa, colisão por cápsula Rapier, estados frouxa/tensa, pulso limitado, inimigo, portões, lançamento e conclusão.
- Personagem e cenário compostos de formas geométricas originais; arte de protótipo.
- Câmera automática e controles de retrato. Emulação não comprova ergonomia, desempenho térmico ou compatibilidade em todos os aparelhos.
- Sem contas, telemetria, serviços de terceiros ou armazenamento de progresso entre visitas.
- Não há instaladores nativos nem código Unity nesta demonstração. A versão de produção em Unity permanece uma etapa separada.

## Dependências

Three.js e Rapier são distribuídos sob licenças permissivas. Consulte `THIRD_PARTY_NOTICES.txt` no projeto e no diretório publicado para os avisos de licença incluídos na distribuição.

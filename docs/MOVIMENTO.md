# Movimento por scroll

Toda a coreografia fica em `motion.js`, com as bibliotecas **GSAP + ScrollTrigger** (animações ligadas ao scroll) e **Lenis** (rolagem suave), carregadas por CDN com versão fixa no final do `index.html`.

## Cenas

| Seção | O que acontece (desktop) | Celular |
|---|---|---|
| Hero | Camadas em profundidade (brilhos e símbolos `</>`, `{ }`, `01`, `AI`), título que sobe palavra por palavra, cartão 3D que cresce enquanto o texto sai (tela fixa curta) | Mesmas camadas e entrada, sem tela fixa |
| Antes e depois | Tela fixa: os papéis soltos voam até o quadro "Operação organizada", que se preenche | Cartões entram em sequência |
| Soluções | Tela fixa com trilho horizontal: o scroll vertical desliza os cartões para o lado, com barra de progresso | Cartões empilhados com entrada suave |
| Projetos | Cartões entram em perspectiva e a ilustração desliza dentro da moldura | Entrada suave |
| Processo | A linha se preenche e cada etapa acende quando a linha chega nela | Idem, na vertical |
| Sobre | Tela fixa: o retrato atravessa a tela, vira mosaico de pixels com separação de cores RGB e uma varredura de scanner, e se recompõe do outro lado enquanto o texto troca de lado | O rosto se recompõe de pixels ao entrar na tela |
| Diferenciais | Cartões e ícones entram em sequência | Idem |
| Contato | Uma rota tracejada se desenha até um ponto brilhante e o convite aparece | Idem |
| Cabeçalho | Barra de progresso de leitura | Idem |

Os rótulos pequenos das seções (ex.: "SOBRE") "decodificam" ao entrar na tela.

## Segurança de uso

- **Melhoria progressiva:** sem JavaScript, sem as bibliotecas (CDN fora do ar) ou com "reduzir movimento" ligado no aparelho, nada disso roda e o site aparece completo, no estado final.
- **Celular (menos de 861 px):** sem cenas fixas e com menos efeitos.
- O questionário de orçamento e o menu do celular pausam a rolagem suave enquanto estão abertos.

## Ajustes comuns

- **Duração de uma cena fixa:** valor `end` do `scrollTrigger` (ex.: `'+=170%'` no retrato = 1,7 telas de rolagem).
- **Suavidade da rolagem:** `lerp` do Lenis no início de `motion.js` (0,1 padrão; menor = mais "macio").
- **Intensidade do efeito de pixels do retrato:** `block: 46` na cena `sobre`.
- **Depuração:** abra o site com `?debug-motion` na URL para expor `window.__lenis` no console (útil para testar posições de scroll).

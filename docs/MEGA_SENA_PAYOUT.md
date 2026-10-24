# Mega-Sena — gerador "Prêmio máximo" (anti-rateio)

## O que é e o que não é

A Mega-Sena é sorteio uniforme sem reposição. A análise de 3.073 concursos (1996–2026) não encontrou sinal explorável na frequência, paridade, sequências, soma, repetição do concurso anterior ou autocorrelação; estratégias "quente/frio" ficam dentro do ruído (ex.: acertos médios 0,60 ± 0,014 contra 0,60 esperado).

Logo, **nenhum gerador altera a probabilidade de acertar** (1 em 50.063.860 para a sena). O que é otimizável é o **valor esperado condicional a ganhar**: o prêmio é rateado entre os ganhadores, e os apostadores concentram jogos em certas dezenas (datas, "números da sorte"). Jogos com dezenas menos populares dividem o prêmio com menos pessoas.

## Modelo de popularidade (`mega-popularity-v1`)

- Resposta: `log(ganhadores_da_quadra / arrecadação)` por concurso, com efeito fixo por ano (preço e volume mudam).
- Preditores: as 6 dezenas sorteadas. Como o sorteio é exógeno, o coeficiente de cada dezena mede quanto ela é apostada.
- Ajuste: ridge (λ=30) sobre 2.004 concursos com dados de premiação.
- Validação: R² fora da amostra 0,69 (split par/ímpar); correlação 0,95 entre os coeficientes da primeira e da segunda metade do histórico; a inclinação da quina sobre a quadra (1,25) bate com a teoria (5/6 ÷ 4/6).
- Achado principal: dezenas ≤31 são sistematicamente mais apostadas (5, 13, 7, 3, 10, 17 no topo); 40, 50, 41, 30, 52, 31 são as menos apostadas.
- Índice de rateio: `exp(1,74·Σpeso) / E_uniforme`, estimativa de primeira ordem. 1,00 = jogo aleatório; os lotes gerados ficam perto de 0,25–0,35 (extrapolação além da faixa mais comum do histórico — tratar como ordem de grandeza, não garantia).

Reajuste: `node scripts/fitMegaSenaPopularity.mjs [baseUrl]` imprime os pesos para `src/generator/megaSenaPopularity.ts`.

## Algoritmo (`mega-sena-payout-v1`)

1. Núcleo compartilhado (`fixedCount`) = dezenas fixadas + completar por amostragem inclinada para dezenas pouco apostadas.
2. Pool de 20.000 jogos únicos amostrados com probabilidade ∝ `exp(-1,5·1,74·peso)` (seed reproduzível), respeitando excluídas e filtros estruturais.
3. Seleção gulosa por menor índice de rateio com sobreposição máxima ≤ 2 entre jogos (relaxa até 5 só se inviável; nunca abaixo do tamanho do núcleo).

Auditoria em `generatorOptions.payout`: estratégia, modelo, concurso limite do ajuste, índice por jogo, sobreposição máxima. Restrito à Mega-Sena com 6 dezenas por jogo.

## Limites conhecidos

- O modelo descreve comportamento do público, que pode mudar; reajustar periodicamente.
- O modelo foi ajustado com concursos até 3073; não usa resultados para prever sorteios futuros.
- Bolões e "surpresinha" diluem o sinal; o efeito é de magnitude, não de garantia.

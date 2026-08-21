# Análises 2.0

A área de Análises do Loto Lab separa **descrição histórica**, **baseline matemático** e **validação fora da amostra**.

A regra central permanece:

> Histórico, atraso, frequência e estrutura descrevem o que aconteceu. Eles não mudam a probabilidade matemática individual de uma dezena ou combinação válida no próximo sorteio.

## Objetivos

A tela deve responder, nesta ordem:

1. **O que o ranking atual está dizendo?**
2. **Por que uma dezena ocupa essa posição?**
3. **A posição está estável ou mudou recentemente?**
4. **A estrutura observada é diferente do que a combinatória já faria aparecer naturalmente?**
5. **Associações entre dezenas sobrevivem à correção pelo número de hipóteses testadas?**
6. **O ranking mostrou separação mensurável quando calculado sem olhar o futuro?**

## Modos da interface

### Ranking

Mantém `strong`, `balanced` e `cold`, mas acrescenta:

- posição atual;
- posição há 1, 5, 10 e 20 concursos;
- movimento do ranking;
- decomposição do score por janela;
- frequência bruta em histórico, ano, mês, 10 e 20 concursos;
- atraso atual e percentil do próprio histórico de atrasos;
- sequência atual de aparições;
- robustez do grupo e da posição quando os pesos são perturbados;
- comparação lado a lado entre duas dezenas.

A robustez dos pesos executa todas as combinações de multiplicadores `0.9`, `1.0` e `1.1` sobre os cinco pesos, normalizando-os depois. São **243 cenários**. Isso mede sensibilidade do ranking; não escolhe automaticamente novos pesos.

### Estrutura

Para cada concurso são calculados, quando aplicáveis:

- repetição em relação ao concurso anterior;
- pares/ímpares;
- soma;
- faixa baixa/alta;
- maior sequência consecutiva;
- linhas e colunas da Lotofácil;
- moldura da Lotofácil.

Sempre que existe distribuição combinatória exata, a UI mostra:

- valor atual;
- média histórica observada;
- média matematicamente esperada;
- desvio do resultado atual;
- percentil histórico;
- distribuição teórica.

Os baselines de repetição, paridade, faixa baixa e moldura usam distribuição hipergeométrica, porque o sorteio é uma amostra sem reposição.

A soma usa a média e a variância exatas da soma de uma amostra sem reposição de uma população consecutiva.

Sequências consecutivas permanecem **descritivas** nesta versão. Não é exibido um baseline inventado quando o motor ainda não implementa um modelo exato para a métrica.

### Validador da estrutura metodológica

O motor mede a cobertura combinatória exata das faixas explicitamente usadas pela metodologia:

- Mega-Sena: repetição `0–2`, ímpares `2–4`;
- Lotofácil: repetição ampla `7–11`, preferencial `8–10`, ímpares `6–9`;
- Dia de Sorte: repetição ampla `0–3`, preferencial `1–2`, ímpares `3–4`.

A contagem do universo é feita por programação dinâmica. Nenhuma enumeração de milhões de cartões é necessária.

A tela compara:

- `% do universo combinatório que passa`;
- `% dos resultados históricos que passou`.

Soma, linhas, colunas e outras regras sem faixa rígida definida na metodologia não entram silenciosamente neste filtro.

### Dinâmica

A aba mostra:

- maiores altas e quedas do ranking em 10 concursos;
- estabilidade de grupo;
- atraso em contexto de percentil histórico;
- ciclo descritivo até todas as dezenas aparecerem;
- dezenas ainda não vistas no ciclo atual;
- heatmap binário dos últimos 30 concursos.

`Atraso` e `ciclo` são visualizações descritivas. O sistema não converte atraso alto em aumento de probabilidade.

### Combinações

Para duques e trincas, o motor compara a quantidade observada com a quantidade esperada sob sorteios uniformes.

Para um par fixo em uma loteria com universo `N` e sorteio de `k` dezenas:

```text
P(par) = k(k-1) / [N(N-1)]
```

Para uma trinca fixa:

```text
P(trinca) = k(k-1)(k-2) / [N(N-1)(N-2)]
```

O motor calcula:

- ocorrências observadas;
- ocorrências esperadas;
- `lift = observado / esperado`;
- z-score aproximado;
- p-value bilateral aproximado;
- p-value corrigido por Bonferroni.

A correção é importante porque procurar centenas ou milhares de combinações produz extremos por acaso. O resultado é tratado como **exploratório**, nunca como previsão automática.

A tela também mostra concursos históricos mais parecidos com o atual, priorizando interseção de dezenas e usando distância estrutural como desempate.

### Validação

A validação rolling usa até os últimos 500 concursos elegíveis.

Para cada concurso-alvo:

1. corta o histórico imediatamente antes do alvo;
2. recalcula o ranking `strong / balanced / cold`;
3. congela os grupos;
4. somente então observa o resultado-alvo;
5. conta quantas dezenas vieram de cada grupo.

Isso preserva a regra anti-leakage.

A interface agrega janelas de 100, 300 e 500 rodadas e compara:

- taxa observada do grupo;
- taxa esperada pelo tamanho do grupo;
- diferença em pontos percentuais;
- z-score usando variância hipergeométrica;
- p-value corrigido para os três grupos.

Uma diferença histórica isolada não vira regra de geração. O resultado precisa ser estável entre períodos e sobreviver à incerteza estatística.

## Contrato HTTP

O endpoint existente continua sendo:

```http
GET /api/v1/analysis/:lottery
```

Os campos antigos são preservados. A resposta agora acrescenta:

```json
{
  "advanced": {
    "model": {},
    "ranking": {},
    "structure": {},
    "dynamics": {},
    "combinations": {},
    "similarity": {},
    "validation": {}
  }
}
```

Isso mantém compatibilidade com consumidores existentes.

## Performance

A análise avançada é calculada no backend e nunca duplicada no navegador.

Como a view principal e o módulo lazy podem consultar o mesmo endpoint em sequência durante a montagem, o serviço mantém um cache curto por loteria e revisão dos dados. O cache só evita recomputação imediata e expira rapidamente; mudança no número/data do último concurso invalida a assinatura.

## Interpretação correta

O Loto Lab deve ser capaz de dizer explicitamente:

- `dentro do esperado`;
- `fora do centro histórico, mas matematicamente natural`;
- `sinal exploratório que não sobrevive à correção`;
- `diferença que merece investigação fora da amostra`;
- `nenhuma separação estatisticamente relevante detectada`.

Essas respostas são preferíveis a rótulos como “está para sair”, “garantida”, “dupla quente” ou “atrasada com maior chance”.

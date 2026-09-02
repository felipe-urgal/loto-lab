# Análises 2.0

A área de Análises do Loto Lab separa **descrição histórica**, **baseline matemático** e **validação fora da amostra**.

A regra central permanece:

> Histórico, atraso, frequência e estrutura descrevem o que aconteceu. Eles não mudam a probabilidade matemática individual de uma dezena ou combinação válida no próximo sorteio.

## Benchmarks funcionais consultados

A taxonomia de ferramentas foi confrontada com páginas públicas da MazuSoft para as três loterias suportadas:

- Mega-Sena: <https://www.mazusoft.com.br/mega/tabelas.php>
- Lotofácil: <https://www.mazusoft.com.br/lotofacil/tabelas.php>
- Dia de Sorte: <https://www.mazusoft.com.br/dia-de-sorte/tabelas.php>

Essas referências ajudam a mapear amplitude de exploração — frequência, ciclos, sequências/atrasos, paridade, repetição, soma, linhas/colunas, moldura, duques/trincas e visualizações binárias. O Loto Lab **não herda interpretações que transformem atraso, sequência ou frequência em aumento/diminuição da probabilidade futura**. Esses conceitos permanecem descritivos até que exista uma hipótese formal e uma validação apropriada.

## Objetivos

A tela deve responder, nesta ordem:

1. **O que o ranking atual está dizendo?**
2. **Por que uma dezena ocupa essa posição?**
3. **A posição está estável ou mudou recentemente?**
4. **A estrutura observada é diferente do que a combinatória já faria aparecer naturalmente?**
5. **Associações entre dezenas sobrevivem à correção pelo número de hipóteses testadas?**
6. **O ranking mostrou separação mensurável quando calculado sem olhar o futuro?**

## Qualidade do histórico

Antes de interpretar métricas sequenciais, o motor verifica a continuidade dos números dos concursos e também se a base começa no concurso `#1`.

`advanced.dataQuality` informa, entre outros campos:

- quantidade de concursos ausentes;
- últimas lacunas detectadas;
- quantidade de concursos do trecho contínuo mais recente;
- primeiro concurso armazenado;
- se o histórico é **censurado à esquerda** (`leftCensored`).

O motor **não atravessa uma lacuna fingindo que os dois registros armazenados eram concursos consecutivos** e não trata o início de uma base parcial como se fosse o início real da loteria.

Por isso:

- repetição do concurso anterior vira indisponível quando o predecessor real está faltando;
- posições há `1`, `5`, `10` e `20` concursos procuram o **número real do concurso**; se a referência estiver ausente, o movimento é `null`;
- estabilidade recente usa apenas o trecho contínuo mais recente;
- atrasos históricos só usam intervalos totalmente observados;
- atraso/sequência atuais ficam indisponíveis quando a resposta exata depender de atravessar uma lacuna ou a borda esquerda desconhecida;
- ciclos são reiniciados após lacunas;
- quando a base começa depois do concurso `#1`, o primeiro ciclo observado apenas restabelece uma fronteira conhecida e não é tratado como duração completa;
- a validação rolling usa somente o trecho contínuo mais recente.

A UI exibe um aviso explícito quando essas proteções estão ativas.

## Modos da interface

### Ranking

Mantém `strong`, `balanced` e `cold`, mas acrescenta:

- posição atual;
- posição há 1, 5, 10 e 20 concursos reais;
- movimento do ranking;
- decomposição do score por janela;
- frequência bruta em histórico, ano, mês, 10 e 20 concursos;
- atraso atual e percentil do próprio histórico de atrasos;
- sequência atual de aparições;
- robustez do grupo e da posição quando os pesos são perturbados;
- comparação lado a lado entre duas dezenas.

A robustez dos pesos executa todas as combinações de multiplicadores `0.9`, `1.0` e `1.1` sobre os cinco pesos, normalizando-os depois. São **243 cenários**. Isso mede sensibilidade do ranking; não escolhe automaticamente novos pesos.

Sem histórico, o motor não fabrica uma robustez artificial a partir de empates: o campo é marcado como indisponível.

### Estrutura

Para cada concurso são calculados, quando aplicáveis:

- repetição em relação ao concurso anterior;
- pares/ímpares;
- soma;
- faixa baixa/alta;
- maior sequência consecutiva;
- linhas e colunas da Lotofácil;
- moldura da Lotofácil.

A comparação entre **resultado atual** e **histórico observado** exclui o próprio concurso atual do resumo histórico. Assim, “histórico anterior” significa de fato concursos anteriores ao concurso de referência.

Sempre que existe distribuição combinatória exata, a UI mostra:

- valor atual;
- média dos concursos anteriores;
- média matematicamente esperada;
- desvio do resultado atual;
- percentil em relação ao histórico anterior;
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

Há **dois baselines distintos**, que não devem ser misturados:

1. **Próximo concurso · universo**: cobertura combinatória condicionada ao último concurso armazenado. Responde “qual fração dos jogos possíveis do próximo concurso passa pelas regras atuais?”.
2. **Histórico esperado**: para cada transição contínua `N-1 → N`, o motor recalcula a cobertura combinatória condicionada ao próprio `N-1` e depois agrega esses baselines. Esse valor é comparável à taxa de transições históricas que efetivamente passaram.

A diferença histórica exibida é:

```text
cobertura histórica observada - cobertura histórica esperada comparável
```

Ela **não** usa mais o baseline do último concurso para julgar todo o passado. Isso evita atribuir à metodologia diferenças que podem ser explicadas apenas pela composição do concurso de referência, especialmente pela interação entre repetição e paridade.

Sem concurso de referência, a cobertura do próximo concurso é `indisponível`, não `0%`.

Soma, linhas, colunas e outras regras sem faixa rígida definida na metodologia não entram silenciosamente neste filtro.

### Dinâmica

A aba mostra:

- maiores altas e quedas do ranking em relação ao concurso de número exatamente `N-10`;
- estabilidade de grupo dentro do trecho contínuo recente;
- atraso em contexto de percentil histórico;
- ciclo descritivo até todas as dezenas aparecerem;
- dezenas ainda não vistas no ciclo atual, quando o início do ciclo é conhecido;
- heatmap binário dos últimos 30 concursos.

`Atraso` e `ciclo` são visualizações descritivas. O sistema não converte atraso alto em aumento de probabilidade.

Quando uma lacuna ou o início parcial da base impede saber o valor exato, a UI mostra a métrica como indisponível em vez de assumir ausência ou zero.

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
- z-score como medida descritiva de desvio padronizado;
- **p-value binomial bilateral exato**;
- p-value exato corrigido por Bonferroni.

A significância **não** usa a aproximação normal para eventos raros. Isso é especialmente importante para trincas da Mega-Sena, cuja quantidade esperada por combinação pode ser pequena mesmo com milhares de concursos.

A correção de múltiplas comparações é aplicada **separadamente à família de pares e à família de trincas**. Essa separação é documentada explicitamente na UI; ambas continuam explorações e não viram regras de geração automaticamente.

Com menos de **20 concursos**, associações e destaques ficam indisponíveis em vez de exibir rankings arbitrários de zeros.

A tela também mostra concursos históricos mais parecidos com o atual, priorizando interseção de dezenas e usando distância estrutural como desempate.

### Validação

A validação rolling usa até os últimos 500 alvos elegíveis do **trecho contínuo mais recente**.

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
- p-value corrigido pela família de **9 leituras expostas na UI: 3 grupos × 3 janelas**.

A correção é Bonferroni e, portanto, deliberadamente conservadora.

O p-value continua sendo calculado quando há poucos alvos, mas o produto **não classifica a evidência como fraca/moderada antes de haver pelo menos 30 alvos válidos**. A UI mostra “amostra insuficiente para classificar evidência”. Essa trava separa cálculo estatístico de interpretação de produto.

Uma diferença histórica isolada não vira regra de geração. O resultado precisa ser estável entre períodos e sobreviver à incerteza estatística.

## Contrato HTTP e degradação graciosa

O contrato básico continua independente e compatível:

```http
GET /api/v1/analysis/:lottery
```

Ele retorna `latestContest`, pesos, grupos e ranking básico **sem depender do worker avançado**.

O workspace Análises 2.0 usa uma rota separada:

```http
GET /api/v1/analysis/:lottery/advanced
```

A resposta contém:

```json
{
  "lottery": "mega-sena",
  "advanced": {
    "dataQuality": {},
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

A view básica é renderizada primeiro. Se o cálculo avançado falhar, estiver ocupado ou atingir o limite operacional, a visão básica permanece utilizável e recebe apenas um aviso. Uma falha opcional não transforma Análises em uma tela totalmente indisponível.

## Ownership do frontend

A implementação funcional avançada pertence a `web/src/features/analysisV2.ts`. O arquivo público `web/analysis-v2.js` é somente um boundary de asset compatível que importa o JavaScript emitido pelo build TypeScript.

Os DTOs que a interface consome ficam explícitos em `web/src/features/analysisV2/types.ts`. O módulo usa diretamente:

- `web/src/core/api.ts` para o contrato HTTP;
- `web/src/core/viewLifecycle.ts` para view atual, render e cleanup de navegação;
- `web/src/shared/escaping.ts` para conteúdo dinâmico interpolado em markup.

Análises não mantém parsing próprio de `location.hash` nem depende de `web/runtime.js`. A migração é arquitetural, não visual: os cinco modos, a degradação para a visão básica, o diálogo modal, teclado/foco e os contratos estatísticos permanecem inalterados.

## Lifecycle, snapshot e execução pesada

O navegador **não mantém cache permanente por loteria**. Cada render oficial consulta novamente a rota avançada, evitando que uma sincronização automática no servidor deixe a tela presa ao concurso anterior.

No backend, Análises usa uma consulta de histórico enxuta com apenas `lottery`, número do concurso, data e dezenas. Rateios, arrecadação e demais campos financeiros não são carregados para esse caminho.

A revisão analítica é identificada por **SHA-256 do conteúdo histórico relevante**. O hash inclui número do concurso, data e dezenas; por isso tanto a entrada de um novo concurso quanto uma correção retroativa invalidam o snapshot.

O cálculo pesado de uma revisão nova roda em `worker_threads`, fora do event loop HTTP. O worker avançado possui:

- limite de **15 segundos**;
- término explícito com `worker.terminate()` em timeout;
- limites de memória do worker;
- memoização por revisão do histórico;
- deduplicação interna de execuções em andamento para a mesma loteria/revisão.

Depois de concluído, o snapshot fica memoizado enquanto a assinatura do histórico permanecer idêntica.

## Acessibilidade e lifecycle do detalhe

As cinco áreas usam semântica de `tablist/tab/tabpanel` e suportam:

- setas esquerda/direita;
- `Home`/`End`;
- foco visível.

O detalhe da dezena usa `<dialog>` aberto com `showModal()`. Assim o conteúdo externo fica modal/inativo pela própria plataforma do navegador. O painel:

- recebe foco ao abrir;
- fecha com `Escape` ou botão explícito;
- devolve o foco ao elemento de origem quando aplicável;
- remove o scroll lock mesmo se o usuário navegar para outra tela sem fechar o drawer manualmente;
- possui backdrop próprio e ocupa no máximo a viewport em mobile.

O Chrome E2E valida a área tanto em desktop quanto em viewport móvel de `390×844`, inclusive o cenário de **navegar para fora de Análises com o diálogo ainda aberto**.

## Interpretação correta

O Loto Lab deve ser capaz de dizer explicitamente:

- `dentro do esperado`;
- `fora do centro histórico, mas matematicamente natural`;
- `sinal exploratório que não sobrevive à correção`;
- `amostra insuficiente para classificar evidência`;
- `diferença que merece investigação fora da amostra`;
- `nenhuma separação estatisticamente relevante detectada`;
- `histórico insuficiente, descontínuo ou censurado para esta métrica`.

Essas respostas são preferíveis a rótulos como “está para sair”, “garantida”, “dupla quente” ou “atrasada com maior chance”.

# Geração de jogos

O Loto Lab separa **análise**, **composição**, **diversificação**, **restrições** e **auditoria do lote**.

A geração organiza escolhas. Ela não prevê o próximo sorteio e não aumenta a probabilidade matemática individual de uma combinação válida.

## Fluxo da tela

A página **Gerar Jogos** foi organizada para responder, nesta ordem:

1. **Análise** — quais dados e qual concurso-alvo estão sendo usados?
2. **Núcleo fixo** — quais dezenas serão compartilhadas entre os jogos?
3. **Variáveis** — como o restante do lote ganha cobertura e diversidade?
4. **Restrições** — quais faixas estruturais foram aplicadas?
5. **Auditoria** — qual foi o núcleo, a amplitude e a sobreposição do lote resultante?

A interface mantém os controles avançados existentes, mas explica por que cada etapa existe e o que ela **não** significa.

## Score v2

O gerador operacional usa `score-v2` por padrão.

O Score v2 preserva as cinco janelas da metodologia:

- histórico total;
- ano atual;
- mês atual;
- últimos 10 concursos do sufixo contínuo mais recente;
- últimos 20 concursos do sufixo contínuo mais recente.

Pesos iniciais:

| Janela | Peso |
| --- | ---: |
| Ano atual | 30% |
| Últimos 20 | 25% |
| Mês atual | 20% |
| Histórico | 15% |
| Últimos 10 | 10% |

Em vez de normalizar automaticamente menor e maior frequência para `0` e `100`, o Score v2 compara a frequência observada com a esperada sob sorteios uniformes e considera o tamanho da amostra.

```text
frequência observada
        ↓
comparação com frequência esperada
        ↓
desvio padronizado pelo tamanho da amostra
        ↓
escala centrada em 50
```

`50` representa aproximadamente o comportamento esperado da janela. Valores acima ou abaixo representam desvio histórico, não probabilidade futura.

### Continuidade das janelas recentes

`recent10` e `recent20` não atravessam lacunas internas da base.

Exemplo:

```text
#100
#101
#103
#104
#105
```

Para uma análise em `#105`, a janela recente contínua começa em `#103`; `#101` não é puxado artificialmente para completar 10 ou 20 concursos.

Se só existirem 3 concursos consecutivos depois da lacuna, as duas janelas usam uma amostra de 3. O Score v2 já reduz a força do desvio por causa do tamanho efetivo da amostra.

## Grupos strong / balanced / cold

O `score-v1` dividia o ranking em terços e sempre produzia grupos `strong` e `cold`, mesmo quando as diferenças eram pequenas.

O Score v2 não força essa divisão.

Uma dezena só entra em `strong` quando existe comportamento positivo em pelo menos duas janelas e o score agregado fica acima da faixa neutra. `cold` segue a lógica simétrica. As demais permanecem `balanced`.

As cinco janelas são **sobrepostas**, não independentes. Portanto, esses grupos descrevem consistência entre horizontes; não representam múltiplas confirmações estatísticas independentes.

Os rótulos são descritivos. Eles não significam “mais provável”, “menos provável” ou “está para sair”.

## Modelos comparáveis

O core mantém três variantes:

- `score-v2` — modelo operacional ajustado pelo tamanho da amostra;
- `score-v1` — modelo legado min/max;
- `no-score` — controle estrutural com todas as dezenas neutras.

### Neutralidade do `no-score`

Um score neutro não pode significar “prefira o menor ID”.

Antes do hardening, empates terminavam em `a.number - b.number`, o que fazia um controle neutro tender a escolher dezenas como `01`, `02`, `03`.

No `no-score`, os desempates agora usam uma ordem pseudoaleatória **estável e reproduzível**, derivada do contexto histórico. A mesma entrada produz a mesma ordem, mas nenhuma dezena ganha preferência só por ter número menor.

Essa ordem é aplicada de forma consistente em:

- escolha do núcleo;
- formação do pool de candidatos;
- shortlist;
- desempate do portfólio.

Assim o experimento `score-v1 × score-v2 × no-score` compara o efeito do ranking sem introduzir um viés artificial por ID.

## Núcleo fixo

Padrões operacionais:

| Loteria | Núcleo padrão |
| --- | ---: |
| Mega-Sena | 3 |
| Lotofácil | 8 |
| Dia de Sorte | 3 |

As variantes de tamanho de núcleo permanecem disponíveis no Laboratório.

O núcleo combina perfis complementares das janelas e respeita dezenas fixadas ou excluídas manualmente.

## Variáveis e cobertura estratificada

Mega-Sena e Dia de Sorte deixam de formar o pool variável exclusivamente pelo topo do ranking.

O pool reserva aproximadamente:

- 50% `strong`, quando disponíveis;
- 35% `balanced`;
- 15% `cold`;
- vagas restantes preenchidas pela ordenação geral.

A finalidade é cobertura controlada, não pressuposição de reversão à média.

## Política explícita do gerador

As penalizações heurísticas ficam centralizadas em `GENERATION_POLICY` e controlam:

- distância da meta de pares/ímpares;
- excesso ou distância da meta de repetição;
- distância de soma no Dia de Sorte;
- sobreposição de dezenas variáveis entre cartões.

Centralizar não transforma esses valores em parâmetros validados; apenas os torna auditáveis e testáveis.

## Otimização global do lote

A geração não escolhe um cartão definitivo e depois tenta compensar nos seguintes.

Para cada posição do lote o motor:

1. constrói combinações elegíveis;
2. calcula o score local;
3. preserva uma fronteira compacta que combina score e diversidade;
4. combina as shortlists em **beam search de portfólio**;
5. avalia a soma dos scores locais menos a sobreposição de variáveis;
6. seleciona o melhor portfólio determinístico ou um portfólio de topo ponderado no modo diversificado.

O objetivo é aumentar dezenas e variáveis únicas e reduzir sobreposição desnecessária sem abandonar as metas estruturais de cada cartão.

## Shortlist e performance

A shortlist precisa preservar candidatos fortes sem ordenar novamente um vetor crescente para cada combinação examinada.

`topRankedCandidates` usa um heap limitado ao tamanho `K` da fronteira. O custo de manter o Top-K passa a ser aproximadamente:

```text
O(N log K)
```

em vez de ordenar o conjunto Top-K a cada candidato.

Quando há **mais de um cartão**, Mega-Sena, Lotofácil e Dia de Sorte examinam uma fronteira mais ampla antes de fechar as 24 alternativas de cada posição. `buildPortfolioShortlist` escolhe essas 24 considerando score local e reutilização de variáveis, para que o beam search não receba apenas candidatos quase idênticos.

Quando há **um único jogo**, não existe objetivo de diversidade entre cartões. Nesse caso o motor mantém o caminho mais barato de Top 24 local.

A fronteira final continua compacta; ampliar a exploração não significa carregar milhares de combinações para o beam search.

A otimização de performance não altera a função objetivo final do portfólio. Há testes para:

- equivalência do heap com ordenação completa;
- preservação de uma alternativa disjunta com score local um pouco menor;
- diversidade efetiva em lotes de Mega-Sena, Lotofácil e Dia de Sorte.

## Auditoria do lote

O `GenerationBatchAudit` informa:

- núcleo compartilhado;
- dezenas únicas;
- variáveis únicas;
- sobreposição média, mínima e máxima;
- espaço combinatório elegível.

## Filtros estruturais

Paridade, repetição e soma servem para definir o tipo de cobertura desejada.

Restringir o universo não torna uma combinação individual mais provável.

## Modo determinístico e diversificado

### Determinístico

Usado em backtests e Laboratório. Mesma entrada produz exatamente a mesma saída.

### Diversificado

Usado na experiência de geração real.

O motor:

1. calcula a análise;
2. seleciona o núcleo;
3. forma pools;
4. ranqueia combinações;
5. mantém shortlists diversas;
6. otimiza o portfólio completo;
7. escolhe ponderadamente entre portfólios de topo usando uma seed.

A mesma seed, histórico e configuração reproduzem o lote.

## Ownership do frontend

A implementação funcional do Generator 2.0 pertence a `web/src/features/generationV2.ts`. O arquivo público `web/generation-v2.js` é somente um boundary de asset compatível que importa o JavaScript emitido pelo build TypeScript.

Os contratos consumidos pela interface ficam explícitos em `web/src/features/generationV2/types.ts`, incluindo plano, baseline, espaços do algoritmo, auditoria, preview/save, jogo gerado, filtros e estado da UI. O módulo consome diretamente:

- `web/src/core/api.ts` para `/generation/plan`, `/generation/preview` e `/generation/save`;
- `web/src/core/viewLifecycle.ts` para view atual, montagem e cleanup de navegação;
- `web/src/shared/escaping.ts` para conteúdo dinâmico interpolado em markup.

A feature não mantém mais client HTTP próprio nem parsing próprio de `location.hash`. A migração é arquitetural: o fluxo `plano → prévia congelada → save exato`, seed/Preview ID, seleção manual, filtros estruturais, modo diversificado e rejeição de histórico stale permanecem com o mesmo contrato. `generation-explainability.js` e `generation-readiness.js` continuam camadas aditivas, sem tomar ownership funcional do Gerador.

## Explicabilidade na página

A tela mostra:

- **Por que este lote será gerado assim?**;
- Análise → Núcleo → Variáveis → Restrições → Auditoria;
- **Como ler este jogo** em cada cartão;
- **Por que este lote foi aceito?**;
- avisos separados sobre previsão, score e cobertura estrutural;
- atalho para o Laboratório.

> O usuário deve conseguir gerar sem estudar estatística, mas deve conseguir auditar cada decisão quando quiser aprofundar.

## Regra de segurança conceitual

O Loto Lab pode dizer:

- “esta dezena ficou acima do esperado na amostra”;
- “este lote possui maior diversidade entre os cartões”;
- “esta estratégia apresentou determinada evidência contra controles aleatórios”.

Não deve dizer:

- “esta dezena tem mais chance no próximo sorteio”;
- “esta dezena está para sair”;
- “este jogo é mais provável de ser sorteado”.

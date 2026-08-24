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
- últimos 10 concursos;
- últimos 20 concursos.

Os pesos continuam configurados como hipótese inicial:

| Janela | Peso |
| --- | ---: |
| Ano atual | 30% |
| Últimos 20 | 25% |
| Mês atual | 20% |
| Histórico | 15% |
| Últimos 10 | 10% |

A diferença está na leitura de cada janela. Em vez de transformar automaticamente o menor valor em `0` e o maior em `100`, o Score v2 compara a frequência observada com a frequência esperada para uma dezena sob sorteios uniformes e considera o tamanho da amostra.

Em termos operacionais:

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

## Grupos strong / balanced / cold

O modelo anterior (`score-v1`) dividia o ranking em terços e, portanto, sempre produzia grupos `strong` e `cold`, mesmo quando as diferenças eram pequenas.

O Score v2 deixa de forçar essa divisão.

Uma dezena só entra em `strong` quando existe sinal positivo em pelo menos duas janelas e o score agregado também fica acima da faixa neutra. `cold` segue a lógica simétrica. As demais permanecem `balanced`.

Isso aproxima o código da metodologia funcional: forte em múltiplas janelas, intermediária quando os sinais são mistos e fria quando várias janelas ficam abaixo da referência.

Os rótulos continuam descritivos. Eles não significam “mais provável”, “menos provável” ou “está para sair”.

## Modelos comparáveis

O core mantém três variantes explícitas:

- `score-v2` — modelo operacional, ajustado pelo tamanho da amostra;
- `score-v1` — modelo legado baseado em normalização min/max;
- `no-score` — controle estrutural com todas as dezenas neutras.

O Laboratório compara as três no mesmo recorte histórico e também mede a qualidade preditiva do ranking via AUC. Assim uma mudança no score pode ser medida antes de ser tratada como melhoria.

## Núcleo fixo

Padrões operacionais:

| Loteria | Núcleo padrão |
| --- | ---: |
| Mega-Sena | 3 |
| Lotofácil | 8 |
| Dia de Sorte | 3 |

As variantes de tamanho de núcleo permanecem disponíveis no Laboratório.

O núcleo combina perfis complementares das janelas, além de respeitar dezenas fixadas ou excluídas manualmente pelo usuário.

## Variáveis e cobertura estratificada

Mega-Sena e Dia de Sorte deixam de formar o pool variável exclusivamente pelo topo do ranking.

O pool passa a reservar espaço para os três perfis:

- aproximadamente 50% `strong` quando disponíveis;
- aproximadamente 35% `balanced`;
- aproximadamente 15% `cold`;
- o restante é preenchido pela ordenação geral quando um grupo não possui candidatos suficientes.

O objetivo é evitar que a geração contradiga a própria metodologia, que permite dezenas intermediárias e eventualmente frias como instrumento de diversificação.

Isso **não** pressupõe reversão à média no próximo sorteio. A finalidade é cobertura controlada do lote.

## Política explícita do gerador

As penalizações heurísticas foram centralizadas em `GENERATION_POLICY`.

Hoje elas controlam:

- distância da meta de pares/ímpares;
- excesso ou distância da meta de repetição;
- distância de soma no Dia de Sorte;
- sobreposição de dezenas variáveis entre cartões do mesmo lote.

Centralizar esses valores não os transforma em parâmetros validados. O ganho é torná-los visíveis e testáveis como política do gerador, em vez de números espalhados pelo código.

## Otimização global do lote

A geração não escolhe mais um cartão definitivo e depois tenta compensar a reutilização nos cartões seguintes.

Para cada posição do lote o motor:

1. constrói combinações que respeitam as restrições;
2. calcula o score local daquela posição — incluindo a meta própria de paridade, repetição, soma e demais regras aplicáveis;
3. mantém uma shortlist de candidatos fortes;
4. combina as shortlists em um **beam search de portfólio**;
5. avalia o conjunto pela soma dos scores locais menos a penalidade de sobreposição entre as dezenas variáveis;
6. seleciona o melhor portfólio determinístico, ou um dos portfólios de topo de forma ponderada quando a geração é diversificada.

A função `selectPortfolioCandidates` otimiza, portanto, uma função de objetivo do lote inteiro. O beam search limita o custo computacional sem voltar ao comportamento puramente sequencial.

O objetivo é aumentar:

- dezenas únicas no lote;
- variáveis únicas;
- amplitude entre cartões;

reduzindo sobreposição desnecessária, sem sacrificar as metas estruturais de cada posição.

O `GenerationBatchAudit` informa:

- núcleo compartilhado;
- dezenas únicas no lote;
- variáveis únicas;
- sobreposição média, mínima e máxima;
- espaço combinatório elegível.

## Filtros estruturais

Paridade, repetição e soma continuam desligados por padrão na experiência avançada e mostram o baseline matemático condicionado às escolhas manuais.

O usuário pode ativá-los conscientemente.

Restringir o universo não faz uma combinação individual ficar mais provável. Esses filtros servem para definir o tipo de cobertura desejada.

## Modo determinístico e diversificado

### Determinístico

Usado em backtests e Laboratório.

Mesma entrada produz a mesma saída. Isso é necessário para comparação reproduzível.

### Diversificado

Usado na experiência de geração real.

O motor:

1. calcula a análise;
2. seleciona o núcleo;
3. forma os pools de candidatos;
4. ranqueia combinações pelas regras da metodologia;
5. mantém uma shortlist por posição do lote;
6. otimiza o portfólio completo por score e diversidade;
7. escolhe de forma ponderada entre os melhores portfólios usando uma seed.

A mesma seed, com o mesmo histórico e a mesma configuração, reproduz o mesmo lote.

## Explicabilidade na página

A tela mostra explicitamente:

- **Por que este lote será gerado assim?** antes da geração;
- a sequência Análise → Núcleo → Variáveis → Restrições → Auditoria;
- **Como ler este jogo** em cada cartão gerado;
- **Por que este lote foi aceito?** depois da prévia;
- avisos separados sobre previsão, score e cobertura estrutural;
- atalho para validar hipóteses no Laboratório.

A regra de produto é simples:

> O usuário deve conseguir gerar sem estudar estatística, mas deve conseguir auditar cada decisão quando quiser aprofundar.

## Regra de segurança conceitual

Nunca interpretar a geração como previsão.

O Loto Lab pode dizer:

- “esta dezena ficou acima do esperado na amostra”;
- “este lote possui maior diversidade entre os cartões”;
- “esta estratégia ficou no percentil X contra controles aleatórios”.

Não deve dizer:

- “esta dezena tem mais chance no próximo sorteio”;
- “esta dezena está para sair”;
- “este jogo é mais provável de ser sorteado”.

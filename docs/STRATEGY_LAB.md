# Laboratório de Estratégias

O Laboratório compara variações da metodologia sobre exatamente o mesmo recorte histórico.

A finalidade é medir hipóteses de composição, não prever sorteios.

## Princípio

> Algoritmo calcula; IA interpreta.

Toda comparação é reproduzível pelo core. O resultado do concurso alvo nunca é entregue ao gerador antes da geração daquele round.

## Experimentos

### Núcleo fixo

É o experimento original do Laboratório.

#### Mega-Sena

- sem núcleo fixo: 0 fixas + 6 variáveis;
- núcleo reduzido: 2 fixas + 4 variáveis;
- metodologia principal: 3 fixas + 3 variáveis.

A metodologia principal continua sendo 3 fixas. As demais configurações existem para experimento/backtest.

#### Lotofácil

- 8 fixas + 7 variáveis;
- 9 fixas + 6 variáveis;
- 10 fixas + 5 variáveis.

O padrão operacional continua 8 fixas, salvo evidência histórica que justifique outra configuração.

#### Dia de Sorte

- sem núcleo fixo: 0 fixas + 7 variáveis;
- núcleo reduzido: 2 fixas + 5 variáveis;
- metodologia principal: 3 fixas + 4 variáveis.

A escolha do Mês da Sorte continua separada da composição das dezenas.

### Regras externas da Mega-Sena

A Mega-Sena possui um segundo experimento, separado do tamanho do núcleo, para validar regras publicadas por Guilhermino Ferreira em entrevista ao Terra.

Fonte de referência:

`https://www.terra.com.br/economia/loterias/ele-ganhou-70-vezes-na-loteria-e-diz-que-pode-te-ensinar,7a4241e2282bd410VgnVCM10000098cceb0aRCRD.html`

O artigo cita um grupo histórico de 26 dezenas e recomenda também evitar dezenas consecutivas e na mesma coluna vertical, usar a mesma quantidade de pares e ímpares e selecionar dezenas de quadrantes diferentes.

O Loto Lab **não trata essas recomendações como verdade matemática**. Elas entram como filtros experimentais reproduzíveis.

O experimento compara:

- score atual, sem filtro externo;
- grupo das 26, mínimo 2 dezenas;
- grupo das 26, mínimo 3 dezenas;
- sem dezenas consecutivas;
- sem repetir coluna vertical do volante;
- paridade exata 3 pares / 3 ímpares;
- representação dos 4 quadrantes do volante;
- pacote completo do artigo com grupo 2+;
- pacote completo do artigo com grupo 3+.

Grupo histórico de 26 dezenas usado no experimento:

`04 05 07 12 13 16 17 23 24 29 30 32 33 37 38 41 42 43 47 49 50 51 53 54 58 59`

Para isolar o efeito dessas regras, todas as variantes desse experimento usam `fixedCount = 0`. O experimento de núcleo continua disponível separadamente. Assim uma melhora ou piora não é atribuída indevidamente ao núcleo de 3 fixas.

#### Formalização do volante

- coluna vertical: números com a mesma posição em cada linha de 10 dezenas, por exemplo `01, 11, 21, 31, 41, 51`;
- quadrantes: o volante 6 × 10 é dividido entre as 3 linhas superiores/inferiores e as 5 colunas da esquerda/direita;
- “todos os 4 quadrantes” significa que o jogo possui pelo menos uma dezena em cada quadrante;
- “paridade exata” significa 3 pares e 3 ímpares.

Essas definições tornam as regras testáveis e auditáveis. Se outra interpretação do artigo for desejada no futuro, ela deve entrar como uma nova variante, não substituir silenciosamente a existente.

## Controle aleatório

Toda execução do Laboratório também calcula um **controle aleatório reproduzível** como benchmark separado do ranking das estratégias.

O controle:

- usa a mesma loteria, o mesmo período e a mesma quantidade de jogos por concurso;
- escolhe as dezenas uniformemente sem reposição dentro de cada jogo;
- não consulta score, frequência, núcleo ou regras experimentais;
- não recebe o resultado do concurso alvo antes da geração;
- usa seed estável para que a comparação seja reproduzível;
- passa pelo mesmo checker financeiro e estatístico das estratégias.

A resposta inclui a melhor estratégia do ranking comparada ao controle pela mesma métrica principal (`ROI` quando a cobertura financeira é suficiente, caso contrário taxa de premiação).

O campo `benchmark.delta` é a diferença entre a melhor estratégia e o controle. `benchmark.beatsRandom` indica apenas se a estratégia ficou acima daquele controle reproduzível no recorte analisado.

Uma única amostra aleatória **não é prova estatística**. O benchmark existe como referência mínima e como base para evoluções futuras com múltiplas seeds, intervalos de confiança e validação walk-forward.

## Recorte histórico

A interface usa os últimos 100 concursos por padrão.

É possível comparar outros horizontes pela própria tela. O backend aceita até 5.000 concursos no `lookbackContests`.

Todos os presets e o controle de uma execução recebem:

- a mesma quantidade de jogos por concurso;
- o mesmo aquecimento (`warmupContests`);
- o mesmo concurso inicial/final;
- a mesma base histórica disponível antes de cada alvo quando a estratégia usa histórico;
- o mesmo tamanho de bloco para a série temporal.

## Ranking

O laboratório não escolhe uma estratégia apenas por um resultado isolado.

Se todas as variantes e o controle tiverem pelo menos 80% de cobertura financeira no período, o ranking principal usa:

1. ROI;
2. taxa de premiação;
3. média de acertos por jogo;
4. tamanho do núcleo como último desempate determinístico quando aplicável.

Se a cobertura financeira estiver incompleta, o ranking evita privilegiar um ROI parcial e usa:

1. taxa de premiação;
2. média de acertos por jogo;
3. melhor número de acertos;
4. tamanho do núcleo como desempate quando aplicável.

O controle não ocupa posição no ranking: ele aparece como benchmark separado para não mudar a semântica do “vencedor” entre as estratégias testadas.

A cobertura financeira continua visível na tabela.

## Série histórica

Os rounds são agrupados em blocos (25 concursos por padrão). Para cada bloco são calculados novamente:

- média de acertos por jogo;
- média de acertos do núcleo quando o experimento usa núcleo;
- taxa de premiação;
- ROI;
- cobertura financeira;
- resultado líquido.

Isso permite verificar consistência e evitar concluir que uma estratégia é superior apenas por causa de um pico isolado.

No experimento de regras externas, a tabela mantém todas as variantes e o gráfico mostra o Top 3 do ranking atual mais o controle aleatório para preservar legibilidade.

## API

```http
POST /api/v1/lab/compare
Content-Type: application/json
```

Exemplo de núcleo:

```json
{
  "lottery": "lotofacil",
  "experiment": "fixed-core",
  "gameCount": 4,
  "warmupContests": 20,
  "lookbackContests": 200,
  "bucketSize": 25
}
```

Exemplo das regras externas:

```json
{
  "lottery": "mega-sena",
  "experiment": "external-rules",
  "gameCount": 2,
  "warmupContests": 20,
  "lookbackContests": 200,
  "bucketSize": 25
}
```

`external-rules` é aceito apenas para Mega-Sena.

Também podem ser enviados `startContest` e `endContest`. Quando `startContest` é informado, ele substitui o início calculado pelo `lookbackContests`.

A resposta contém:

- experimento executado;
- período efetivo;
- critério usado no ranking;
- vencedor do período entre as estratégias;
- resumo completo de cada variante;
- regras aplicadas quando existirem;
- pontos temporais por blocos;
- `benchmark`, contendo o controle aleatório, a melhor estratégia, o delta e se ela superou o controle.

## Interface

Com a aplicação iniciada:

```text
http://127.0.0.1:3000/lab
```

A tela oferece:

- seleção da loteria;
- seletor de experimento para Mega-Sena;
- horizonte histórico;
- quantidade de jogos;
- aquecimento;
- tamanho dos blocos;
- ranking das variantes;
- card de benchmark com vantagem/desvantagem contra o aleatório;
- controle aleatório na tabela comparativa;
- controle aleatório como linha tracejada no gráfico;
- gráfico alternável entre acertos, taxa de premiação, ROI e resultado líquido;
- indicação da cobertura histórica/financeira da base.

## Próxima etapa: validação fora da amostra

O benchmark aleatório é a fundação para a próxima evolução: otimização de parâmetros com validação walk-forward.

Pesos de score, metas de repetição, paridade e penalidades não devem ser promovidos apenas porque melhoraram o mesmo período em que foram escolhidos. O fluxo correto é selecionar parâmetros em uma janela de treino e medir o resultado em uma janela posterior que não participou da escolha.

## Interpretação correta

Resultados históricos não mudam a probabilidade matemática individual de uma combinação válida e não tornam uma dezena "devida".

O laboratório mede o comportamento das regras de composição no histórico disponível. Quanto mais variantes e períodos forem testados, maior o risco de overfitting; por isso os resultados devem ser avaliados em múltiplos horizontes e com critérios definidos antes da leitura do resultado.

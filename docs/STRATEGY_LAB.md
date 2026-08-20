# Laboratório de Estratégias

O Laboratório compara variações da metodologia sobre exatamente o mesmo recorte histórico.

A finalidade é medir hipóteses de composição, não prever sorteios.

## Princípio

> Algoritmo calcula; IA interpreta.

Toda comparação é reproduzível pelo core. O resultado do concurso alvo nunca é entregue ao gerador antes da geração daquele round.

## Presets iniciais

### Mega-Sena

- sem núcleo fixo: 0 fixas + 6 variáveis;
- núcleo reduzido: 2 fixas + 4 variáveis;
- metodologia principal: 3 fixas + 3 variáveis.

A metodologia principal continua sendo 3 fixas. As demais configurações existem para experimento/backtest.

### Lotofácil

- 8 fixas + 7 variáveis;
- 9 fixas + 6 variáveis;
- 10 fixas + 5 variáveis.

O padrão operacional continua 8 fixas, salvo evidência histórica que justifique outra configuração.

### Dia de Sorte

- sem núcleo fixo: 0 fixas + 7 variáveis;
- núcleo reduzido: 2 fixas + 5 variáveis;
- metodologia principal: 3 fixas + 4 variáveis.

A escolha do Mês da Sorte continua separada da composição das dezenas.

## Recorte histórico

A interface usa os últimos 100 concursos por padrão.

É possível comparar outros horizontes pela própria tela. O backend aceita até 5.000 concursos no `lookbackContests`.

Todos os presets de uma execução recebem:

- a mesma quantidade de jogos por concurso;
- o mesmo aquecimento (`warmupContests`);
- o mesmo concurso inicial/final;
- a mesma base histórica disponível antes de cada alvo;
- o mesmo tamanho de bloco para a série temporal.

## Ranking

O laboratório não escolhe uma estratégia apenas por um resultado isolado.

Se todas as variantes tiverem pelo menos 80% de cobertura financeira no período, o ranking principal usa:

1. ROI;
2. taxa de premiação;
3. média de acertos por jogo;
4. tamanho do núcleo como último desempate determinístico.

Se a cobertura financeira estiver incompleta, o ranking evita privilegiar um ROI parcial e usa:

1. taxa de premiação;
2. média de acertos por jogo;
3. melhor número de acertos;
4. tamanho do núcleo como desempate.

A cobertura financeira continua visível na tabela.

## Série histórica

Os rounds são agrupados em blocos (25 concursos por padrão). Para cada bloco são calculados novamente:

- média de acertos por jogo;
- média de acertos do núcleo;
- taxa de premiação;
- ROI;
- cobertura financeira;
- resultado líquido.

Isso permite verificar consistência e evitar concluir que uma estratégia é superior apenas por causa de um pico isolado.

## API

```http
POST /api/v1/lab/compare
Content-Type: application/json
```

Exemplo:

```json
{
  "lottery": "lotofacil",
  "gameCount": 4,
  "warmupContests": 20,
  "lookbackContests": 200,
  "bucketSize": 25
}
```

Também podem ser enviados `startContest` e `endContest`. Quando `startContest` é informado, ele substitui o início calculado pelo `lookbackContests`.

A resposta contém:

- período efetivo;
- critério usado no ranking;
- vencedor do período;
- resumo completo de cada variante;
- pontos temporais por blocos.

## Interface

Com a aplicação iniciada:

```text
http://127.0.0.1:3000/lab
```

A tela oferece:

- seleção da loteria;
- horizonte histórico;
- quantidade de jogos;
- aquecimento;
- tamanho dos blocos;
- ranking das três variantes;
- tabela comparativa;
- gráfico alternável entre acertos, taxa de premiação, ROI e resultado líquido;
- indicação da cobertura histórica/financeira da base.

## Interpretação correta

Resultados históricos não mudam a probabilidade matemática individual de uma combinação válida e não tornam uma dezena "devida".

O laboratório mede o comportamento das regras de composição no histórico disponível. Quanto mais variantes e períodos forem testados, maior o risco de overfitting; por isso os resultados devem ser avaliados em múltiplos horizontes e com critérios definidos antes da leitura do resultado.

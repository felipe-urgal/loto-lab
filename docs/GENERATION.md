# Modos de geração

O Loto Lab separa geração para uso real de geração para experimentos históricos.

## Princípio

A metodologia continua calculando score, núcleo, repetição, paridade, soma e demais filtros. A diversidade não substitui essas regras por sorteio puro.

## Modo determinístico

Usado por padrão no core, backtests, CLI histórica e Laboratório.

Mesma entrada produz exatamente a mesma saída.

Isso é obrigatório para:

- comparar estratégias de forma justa;
- reproduzir um backtest;
- investigar uma regressão;
- garantir que o resultado do experimento não dependa de sorte interna do gerador.

Exemplo direto no core:

```ts
const games = generateMegaSenaGames(history, {
  gameCount: 2,
  generationMode: "deterministic",
});
```

## Modo diversificado

É o padrão do endpoint `POST /api/v1/games/generate`, usado pela tela **Gerar jogos**.

O processo é:

1. calcula a análise normalmente;
2. calcula o núcleo normalmente;
3. gera e ranqueia as combinações variáveis com as mesmas regras da metodologia;
4. considera somente um pequeno grupo das melhores combinações do ranking;
5. escolhe de forma ponderada dentro desse grupo, favorecendo as posições mais altas;
6. aplica a penalização de reutilização normalmente entre os jogos do lote.

Assim, clicar em **Gerar novamente** pode produzir outro lote sem abandonar os critérios metodológicos.

## Seed

Toda geração diversificada tem uma `seed`.

A seed é salva em `generated_game_batches.generator_options` junto com `generationMode`.

Exemplo de configuração persistida:

```json
{
  "gameCount": 2,
  "generationMode": "diversified",
  "seed": "c71352d0-3d39-4a98-86ca-6ee947fbd950"
}
```

A mesma seed, com o mesmo histórico e configuração, reproduz exatamente o mesmo lote.

Exemplo pela API sem persistir novamente:

```http
POST /api/v1/games/generate
Content-Type: application/json

{
  "lottery": "mega-sena",
  "gameCount": 2,
  "targetContestNumber": 3047,
  "generationMode": "diversified",
  "seed": "c71352d0-3d39-4a98-86ca-6ee947fbd950",
  "persist": false
}
```

## Núcleo fixo

No modo diversificado, o núcleo não é sorteado aleatoriamente a cada clique.

Para o mesmo histórico e a mesma estratégia, ele continua sendo calculado pelo método de seleção do núcleo. A variação acontece principalmente nas dezenas variáveis.

Isso preserva a ideia de **núcleo compartilhado + cobertura diversificada**.

## Proteção contra lotes repetidos

Quando a API gera um lote diversificado e persistido sem seed fornecida pelo usuário, ela consulta os lotes recentes da mesma loteria e concurso-alvo.

Se o conjunto de jogos já existir, uma nova seed é gerada e a seleção é repetida, até um limite de tentativas.

A proteção vale para novas gerações. Lotes idênticos criados antes deste mecanismo continuam no histórico, porque podem fazer parte de auditoria ou de apostas reais.

## Backtests e Laboratório

Backtests e Laboratório não usam esse sorteio ponderado.

Eles continuam chamando os geradores no modo determinístico. Portanto, a introdução da geração diversificada para uso real não muda retroativamente resultados de backtest nem torna comparações não reproduzíveis.

## Probabilidade

Diversificar lotes não altera a probabilidade matemática individual de uma combinação específica ser sorteada.

A finalidade é evitar que a aplicação apresente sempre o mesmo lote quando existem várias combinações de qualidade metodológica semelhante e permitir melhor cobertura entre apostas escolhidas pelo usuário.

# Laboratório usando o contrato principal de loteria

Issue: #60

Branch: `refactor/60-lab-main-context`

## Objetivo

Remover do Laboratório a redefinição local de `LotteryId` e o predicate duplicado de validação, reutilizando o owner tipado já existente em `web/src/core/mainContext.ts`.

## Mudança

`web/src/features/lab.ts` passa a importar:

- `LotteryId` como identidade canônica das três loterias suportadas;
- `isLotteryId` como validação canônica de valores vindos do select e do `localStorage`.

O mapa local `lotteries` continua sendo owner de labels, quantidade padrão de jogos e copy específica do Laboratório. Identidade global e apresentação continuam com responsabilidades separadas.

## Guardrails

- nenhuma rota, UI ou interação muda;
- payloads de `/lab/compare` permanecem idênticos;
- seleção salva em `loto-lab:lottery` preserva o mesmo comportamento;
- experimentos, benchmark, AUC, walk-forward e controles aleatórios não são alterados;
- `mainContext.ts` não recebe copy nem configuração funcional do Laboratório;
- teste arquitetural impede que a union e o predicate locais retornem.

## Resultado arquitetural

O Laboratório passa a compartilhar a mesma identidade de loteria já usada por outras superfícies, reduzindo duplicação sem iniciar refactor horizontal de `lab.ts` e sem misturar a mudança com jornada ou redesign.

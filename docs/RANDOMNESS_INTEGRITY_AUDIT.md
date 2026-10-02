# Auditoria de aleatoriedade e integridade

## Objetivo

A auditoria responde se o histórico armazenado é **compatível com um baseline uniforme sem reposição sob os testes executados**.

Ela não prevê concursos, não certifica aleatoriedade e não conclui sobre causa, fraude ou manipulação. Um sinal estatístico indica somente que os dados e a metodologia merecem investigação adicional.

## Escopo inicial

A superfície de Análises executa a auditoria sobre o componente numérico principal das famílias planas já suportadas:

- Mega-Sena
- Lotofácil
- Quina
- Lotomania
- Dia de Sorte
- +Milionária
- Timemania

Campos secundários não entram nesta primeira versão. Modalidades de colunas e modalidades com dois sorteios por concurso permanecem fora da superfície atual.

## Proteção de período

A auditoria usa o segmento contínuo e com cardinalidade atual mais recente.

- gaps interrompem métricas sequenciais;
- mudança detectável no tamanho do sorteio cria novo segmento;
- concursos anteriores ao segmento são declarados como excluídos;
- menos de 50 concursos comparáveis resulta em `insufficient-evidence`, nunca em zero ou compatibilidade.

## Testes globais

A versão `randomness-integrity-v1` executa seis famílias de estatísticas:

1. **Uniformidade global** — desvio agregado das frequências por dezena.
2. **Entropia das frequências** — concentração da distribuição empírica.
3. **Runs da soma** — alternância da soma em torno da média teórica.
4. **Autocorrelação da soma** — dependência linear lag-1.
5. **Autocorrelação de paridade** — dependência lag-1 na quantidade de ímpares.
6. **Sobreposição consecutiva** — repetição média entre concursos adjacentes.

Os p-values globais são calibrados por históricos sintéticos gerados com sorteio uniforme sem reposição e seed persistível. A família global usa Bonferroni.

## Frequência por dezena

Cada dezena usa teste binomial exato com:

- número de trials = concursos analisados;
- probabilidade marginal = `drawSize / universeSize`;
- Bonferroni aplicado à família completa de dezenas.

A dependência entre dezenas dentro do mesmo concurso é tratada no teste global via baseline sintético; o teste por dezena avalia apenas a marginal individual.

## Status

Cada teste é apresentado separadamente:

- `compatible`: não houve desvio relevante após a correção configurada;
- `investigate`: houve desvio estatístico que merece inspeção de dados/metodologia;
- `insufficient-evidence`: o período comparável é pequeno demais.

Não existe score agregado de “quão aleatória” é a modalidade.

## Reprodutibilidade

O resultado registra:

- versão do algoritmo;
- seed;
- quantidade de simulações;
- resolução do p-value empírico;
- período efetivamente analisado;
- quantidade de concursos excluídos;
- método de correção múltipla.

A mesma entrada, versão, seed e configuração deve produzir o mesmo baseline.

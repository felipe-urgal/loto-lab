# Metodologia de geração de jogos

Este documento é a especificação funcional do motor do Loto Lab.

> A metodologia organiza e testa escolhas. Ela não altera a probabilidade matemática individual de uma combinação válida.

## Princípios

Antes de gerar um jogo, o sistema deve trabalhar somente com informações disponíveis até o concurso anterior ao concurso-alvo.

As janelas principais são:

- histórico total;
- ano atual;
- mês atual;
- últimos 10 concursos;
- últimos 20 concursos.

As dezenas são classificadas em `strong`, `balanced` e `cold`. Nenhuma dezena deve ser considerada garantida ou "obrigada a sair".

## Score inicial

O primeiro modelo usa pesos configuráveis:

| Janela | Peso inicial |
| --- | ---: |
| Ano atual | 30% |
| Últimos 20 | 25% |
| Mês atual | 20% |
| Histórico | 15% |
| Últimos 10 | 10% |

Esses pesos são uma hipótese inicial. O módulo de backtest deverá medir versões alternativas sem usar informação futura.

## Mega-Sena

Cada jogo tem 6 dezenas.

Regra do lote:

- 3 dezenas fixas compartilhadas;
- 3 dezenas variáveis por jogo;
- preferir variáveis diferentes entre jogos do mesmo lote.

As três fixas devem representar perfis complementares, e não simplesmente as três maiores frequências:

1. uma forte no ano;
2. uma forte na combinação histórico + ano;
3. uma forte recentemente/mês.

Filtros auxiliares:

- normalmente 0 a 2 dezenas repetidas do concurso anterior;
- variar 3/3, 4/2 e 2/4 em pares/ímpares entre jogos;
- soma é filtro secundário, nunca regra rígida.

O grupo histórico de 26 dezenas já estudado pode ser usado como referência secundária, mas não como grupo preditivo. Em 2026 ele se comportou próximo do esperado pelo tamanho do próprio grupo.

## Lotofácil

Cada jogo tem 15 dezenas entre 25.

Regra do lote:

- 8 a 10 dezenas fixas compartilhadas;
- padrão atual: 8 fixas para maior cobertura;
- variar as demais dezenas entre os jogos.

Repetição do concurso anterior é estruturalmente importante:

- preferir 8 a 10 repetidas;
- 7 a 11 é faixa ampliada aceitável.

Ao gerar vários jogos, diversificar pares/ímpares, por exemplo:

- 8/7;
- 7/8;
- 9/6;
- 6/9.

Não exigir linhas `3-3-3-3-3`. Distribuições assimétricas são normais. Também não excluir sequências consecutivas automaticamente.

## Dia de Sorte

Cada jogo tem 7 dezenas entre 31.

Regra do lote:

- 3 dezenas fixas compartilhadas;
- 4 dezenas variáveis por jogo.

As fixas devem combinar preferencialmente:

1. força no ano;
2. força histórica;
3. força recente/mensal.

Filtros auxiliares:

- preferir 1 ou 2 repetidas do concurso anterior;
- usar principalmente 3/4 ou 4/3 em pares/ímpares;
- escolher Mês da Sorte separadamente e diversificar entre jogos.

## Processo pós-sorteio

Após cada resultado oficial:

1. conferir todos os jogos;
2. registrar acertos e eventual prêmio;
3. medir quantos acertos vieram do núcleo fixo;
4. medir quantos vieram das variáveis;
5. registrar repetição, pares/ímpares, soma e demais estruturas;
6. não alterar toda a estratégia por causa de um único resultado.

## Regra de interpretação das análises

Toda evolução da área de Análises deve separar três conceitos:

1. **observado**: o que apareceu no histórico real;
2. **esperado**: o que a combinatória/estatística prevê para sorteios uniformes quando existe um modelo implementado;
3. **validado**: o que continua diferente quando a hipótese é testada sem usar informação futura e levando em conta a incerteza estatística.

Uma estrutura comum não deve ser chamada de especial apenas porque aparece muitas vezes. Primeiro é obrigatório perguntar se essa concentração já é consequência natural do tamanho do universo e da quantidade de dezenas sorteadas.

Exemplos tratados com baseline matemático exato quando aplicáveis:

- repetição entre concursos consecutivos;
- pares/ímpares;
- faixas de dezenas;
- moldura da Lotofácil;
- soma do concurso.

Quando o motor não possui ainda um modelo matemático implementado para uma métrica, ela permanece **descritiva**. Não criar um valor "esperado" arbitrário para sequências, ciclos ou qualquer outro padrão.

### Atraso e ciclos

Atraso pode ser mostrado como:

- quantidade atual de concursos sem aparecer;
- distribuição histórica de atrasos da própria dezena;
- percentil do atraso atual;
- sequência atual de aparições.

Ciclos podem mostrar quantos concursos foram necessários para todas as dezenas aparecerem e quais ainda não apareceram no ciclo atual.

Nenhuma dessas métricas autoriza frases como:

- "está para sair";
- "ficou mais provável";
- "deve compensar o atraso".

Elas descrevem o histórico, não mudam a probabilidade matemática do próximo sorteio.

### Combinações e múltiplas comparações

Duques, trincas e outras combinações podem ser explorados, mas o sistema deve comparar:

- ocorrências observadas;
- ocorrências esperadas para uma combinação fixa;
- magnitude do desvio;
- incerteza estatística;
- correção pelo número de combinações examinadas.

O fato de o maior entre centenas ou milhares de pares parecer extremo não é evidência suficiente. A ferramenta deve controlar falsos sinais produzidos pela busca em massa e manter a interpretação como exploratória.

### Sensibilidade dos pesos

Os pesos do score podem ser perturbados para medir robustez do ranking. Essa análise responde perguntas como:

- a dezena continua no mesmo grupo quando os pesos mudam pouco?
- a posição permanece em uma faixa estreita?
- o rótulo `strong` depende fortemente de uma configuração específica?

Sensibilidade mede fragilidade do modelo. Ela não escolhe automaticamente novos pesos e não deve ser usada para otimizar os pesos olhando o resultado futuro.

## Validação rolling do ranking

Antes de interpretar `strong`, `balanced` e `cold` como grupos com comportamento diferente, a classificação deve ser avaliada fora da amostra.

Para cada concurso histórico alvo:

1. usar somente concursos anteriores;
2. recalcular todas as janelas e o score;
3. congelar os grupos;
4. revelar o concurso alvo;
5. contar quantas dezenas sorteadas pertenciam a cada grupo;
6. comparar o observado com o esperado pelo tamanho de cada grupo;
7. repetir o processo em muitas rodadas.

A leitura deve considerar diferentes janelas históricas e correção estatística. Um pequeno excesso em uma janela isolada não justifica alteração na geração.

A conclusão correta pode ser, inclusive:

> **Nenhuma separação estatisticamente relevante foi detectada entre os grupos.**

Esse resultado é útil: impede que uma classificação visualmente convincente seja confundida com capacidade preditiva.

## Backtest

O backtest é obrigatório antes de afirmar que uma regra é melhor que outra.

Para cada concurso histórico alvo:

1. usar apenas concursos anteriores ao alvo;
2. calcular as janelas;
3. gerar os jogos;
4. revelar o resultado real somente depois da geração;
5. medir acertos, custo, premiação e desempenho do núcleo;
6. comparar estratégias alternativas.

A regra arquitetural central é:

> **Algoritmo calcula; IA interpreta.**

A IA pode explicar resultados e sugerir hipóteses, mas frequência, score, geração e backtest precisam ser reproduzíveis por código.

A especificação detalhada da nova área de análise está em [`ANALYSES.md`](ANALYSES.md).

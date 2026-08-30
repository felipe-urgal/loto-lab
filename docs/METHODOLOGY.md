# Metodologia de geração de jogos

Este documento é a especificação funcional da metodologia atual do Loto Lab.

> A metodologia organiza e testa escolhas. Ela não altera a probabilidade matemática individual de uma combinação válida.

## Regra central

Antes de gerar ou avaliar um concurso-alvo, o sistema usa somente informação disponível **antes** desse alvo.

As janelas principais do `score-v2` são:

- histórico total;
- ano atual;
- mês atual;
- últimos 10 concursos do trecho contínuo mais recente;
- últimos 20 concursos do trecho contínuo mais recente.

Pesos operacionais:

| Janela | Peso |
| --- | ---: |
| Ano atual | 30% |
| Últimos 20 | 25% |
| Mês atual | 20% |
| Histórico | 15% |
| Últimos 10 | 10% |

Esses pesos continuam sendo uma hipótese de metodologia, não uma verdade probabilística. Sensibilidade e Strategy Lab medem sua robustez/valor histórico.

## Score v2

O modelo compara a frequência observada com a frequência esperada sob sorteios uniformes e considera o tamanho da amostra.

`50` representa aproximadamente comportamento esperado da janela. Acima/abaixo de 50 significa desvio histórico, não aumento/diminuição automática da chance futura.

O projeto também mantém:

- `score-v1` — modelo legado min/max para comparação;
- `no-score` — controle estrutural neutro.

`no-score` usa desempate pseudoaleatório estável/reproduzível para não favorecer números menores apenas por ID.

## Grupos

`strong`, `balanced` e `cold` representam consistência do modelo em janelas **sobrepostas**.

Esses grupos são descritivos. Eles não significam “mais provável”, “atrasado” ou “está para sair”.

## Mega-Sena

Cada jogo tem 6 dezenas.

Padrão operacional:

- 3 fixas;
- 3 variáveis;
- diversidade entre jogos do lote;
- repetição/paridade/soma como estrutura de composição, não previsão.

O grupo histórico de 26 dezenas pode ser usado apenas como hipótese experimental controlada no Laboratório.

## Lotofácil

Cada jogo tem 15 dezenas entre 25.

Padrão operacional:

- 8 fixas por padrão;
- 9 e 10 disponíveis para experimentos;
- repetição preferencial 8–10;
- guardrail ampliado 7–11 quando não há filtro explícito;
- diversificação de paridade/estrutura;
- nenhuma exigência automática de linhas `3-3-3-3-3`;
- sequências consecutivas não são eliminadas por crença probabilística.

## Dia de Sorte

Cada jogo tem 7 dezenas entre 31.

Padrão operacional:

- 3 fixas;
- 4 variáveis;
- repetição e paridade como parâmetros estruturais;
- Mês da Sorte selecionado separadamente e diversificado entre jogos quando aplicável.

## Política de geração

Heurísticas de composição ficam centralizadas e auditáveis. Elas controlam, entre outros pontos:

- paridade;
- repetição;
- soma quando aplicável;
- sobreposição entre cartões;
- diversidade do portfólio.

O fato de um parâmetro estar centralizado não significa que esteja estatisticamente validado. A validação pertence a backtests/Laboratório.

## Portfólio e diversidade

A geração avalia o lote como conjunto, não apenas cada cartão isoladamente.

O objetivo é preservar candidatos fortes sob a função de score e reduzir sobreposição desnecessária entre cartões, sem declarar que diversidade aumenta a chance individual de uma combinação.

Modo determinístico é usado em experimentos/replay. Modo diversificado usa seed auditável.

Detalhes de implementação: [`GENERATION.md`](GENERATION.md).

## Regra de interpretação das análises

Toda análise deve separar:

1. **observado**;
2. **esperado** quando existe baseline matemático válido;
3. **validado** fora da amostra/sem leakage.

Não inventar baseline para métrica sem modelo implementado.

### Estruturas

Podem possuir baseline exato quando aplicável:

- repetição;
- paridade;
- faixas de dezenas;
- moldura da Lotofácil;
- soma.

Sequências/ciclos permanecem descritivos quando não há modelo exato implementado.

### Atraso e ciclos

Podem ser exibidos como histórico/percentil/estado atual, mas nunca autorizam linguagem de “compensação” ou “maior chance”.

### Combinações

Duques/trincas devem considerar:

- observado;
- esperado;
- magnitude do desvio;
- incerteza;
- correção por múltiplas comparações.

Um extremo selecionado entre muitas hipóteses não é evidência suficiente por si só.

### Sensibilidade dos pesos

Perturbar pesos mede fragilidade/robustez. Não deve escolher pesos olhando o resultado futuro.

## Validação rolling

Para cada alvo histórico:

1. usar somente concursos anteriores;
2. recalcular análise/grupos;
3. congelar o estado;
4. revelar o resultado alvo;
5. medir comportamento;
6. comparar ao esperado;
7. repetir em muitos alvos elegíveis.

A validação deve respeitar continuidade real de concursos e nunca atravessar lacuna como se fosse sequência contínua.

Uma conclusão válida pode ser simplesmente:

> Nenhuma separação estatisticamente relevante foi detectada.

Esse resultado protege contra transformar uma classificação visualmente convincente em alegação preditiva.

## Testes históricos

O backtest é obrigatório para comparar regras.

```text
histórico < alvo
    ↓
calcular/generar
    ↓
congelar saída
    ↓
revelar resultado alvo
    ↓
medir acertos/financeiro
```

## Strategy Lab

O Laboratório já está implementado e compara famílias de hipóteses no mesmo recorte, com controles aleatórios reproduzíveis, correção por múltiplas comparações e guardrails de resolução/amostra.

Ele cobre atualmente:

- `fixed-core`;
- `score-model`;
- `external-rules` para Mega-Sena.

Detalhes: [`STRATEGY_LAB.md`](STRATEGY_LAB.md).

## Processo pós-sorteio

Após resultado oficial:

1. conferir jogos;
2. registrar acertos/prêmio quando aplicável;
3. medir núcleo/variáveis;
4. reconciliar aposta real se ela tiver sido registrada antes do resultado;
5. atualizar histórico/agenda/notificações;
6. não alterar metodologia por causa de um único sorteio.

## Segurança conceitual

O produto pode dizer:

- “ficou acima do esperado nesta amostra”;
- “o lote teve mais diversidade”;
- “a hipótese superou controles neste recorte sob estes critérios”.

Não deve dizer:

- “tem mais chance no próximo sorteio”;
- “está para sair”;
- “é garantida”;
- “esse jogo é mais provável”.

Análises detalhadas: [`ANALYSES.md`](ANALYSES.md).
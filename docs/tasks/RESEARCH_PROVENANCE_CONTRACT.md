# Contrato mínimo de proveniência científica

Issue: #66

Status: contrato de desenho concluído; nenhuma migration nesta fatia.

## Objetivo

Definir como o Loto Lab pode evoluir para a jornada explícita

```text
hipótese → experimento → evidência → decisão → aplicação → resultado real
```

sem criar uma segunda taxonomia de IDs, sem copiar payloads que já possuem owner e sem misturar interpretação de IA com evidência calculada.

## O que já possui identidade auditável

O schema atual já cobre grande parte da cadeia:

| Artefato | Identidade/versão existente | Papel de proveniência |
| --- | --- | --- |
| estratégia | `strategies.id` + `strategy_versions.id/version` | configuração/metodologia imutável usada por experimento/aplicação |
| backtest | `backtest_runs.id` + `strategy_version_id` | evidência histórica persistida |
| trabalho assíncrono | `analysis_jobs.id` + `kind/status/input/result` | execução auditável de backtest ou Strategy Lab |
| preview do Gerador | `generation_previews.preview_id` + `seed`, `history_signature`, `config_signature`, `game_fingerprint` | reprodução da prévia congelada |
| lote salvo | `generated_game_batches.id` + `strategy_version_id` + `generation_key` quando presente | aplicação materializada |
| aposta real | `real_bets.id` + `batch_id` + concurso | resultado real ligado ao lote aplicado |
| interpretação de IA | `ai_insights.id` + `evidence` + `evidence_hash` | interpretação persistida de evidência, nunca fonte primária do cálculo |

Esses IDs devem ser reutilizados. Uma futura feature de pesquisa não deve inventar `experiment_id`, `evidence_id` ou cópias de estratégia apenas para renomear registros que já existem.

## Lacunas reais

Hoje faltam dois conceitos de produto, não uma nova cópia dos artefatos técnicos:

1. **Hipótese de pesquisa** — a pergunta/afirmação que motiva um ou mais experimentos e possui identidade estável.
2. **Decisão auditável** — o estado conclusivo atual da hipótese (`inconclusiva`, `rejeitada`, `mantida para novo teste`, `aplicada experimentalmente`, ou vocabulário equivalente a ser fechado na implementação), acompanhado de justificativa e data.

Experimento, evidência, aplicação e resultado real já podem continuar apontando para os owners existentes.

## Invariants obrigatórios

### Reutilizar identidade existente

- estratégia experimental referencia `strategy_versions.id`;
- backtest referencia `backtest_runs.id`;
- Strategy Lab assíncrono referencia `analysis_jobs.id` com `kind = 'strategy-lab'`;
- preview referencia `generation_previews.preview_id`;
- aplicação salva referencia `generated_game_batches.id`;
- resultado real referencia `real_bets.id`;
- interpretação referencia `ai_insights.id`.

Não serializar uma cópia completa desses objetos dentro da hipótese como fonte de verdade.

### Algoritmo calcula; IA interpreta

Um `ai_insight` pode explicar evidência já calculada/persistida, mas não pode:

- virar a única evidência de uma hipótese;
- alterar score, estratégia, seed ou jogos;
- selecionar dezenas;
- converter ausência de evidência em conclusão positiva;
- substituir IDs/hash da evidência de origem por texto livre.

### Anti-leakage explícito

Toda evidência histórica ligada a uma hipótese precisa preservar o contrato temporal do artefato original. A camada de pesquisa não pode reclassificar como válido um backtest/Lab que tenha usado informação posterior ao target.

Se uma futura relação precisar guardar janela temporal, ela deve referenciar o run/job que já possui o input/result auditável, não recalcular uma janela silenciosamente na UI.

### Reprodução antes de conveniência

Quando a hipótese chega à aplicação, preservar:

- `strategy_version_id` quando aplicável;
- `preview_id`/seed/fingerprints enquanto a prévia existir;
- identidade do lote salvo;
- concurso-alvo;
- vínculo posterior com aposta real.

Não criar ação “usar o melhor resultado” que esconda qual versão/configuração foi escolhida.

### Desconhecido continua diferente de zero

Ausência de resultado financeiro, prêmio ainda não oficial ou evidência ainda não produzida permanece `null`/desconhecida. A entidade de pesquisa não pode converter estado incompleto em zero ou decisão negativa.

## Direção de schema futuro

A primeira migration, quando houver uma fatia vertical aprovada, deve adicionar **somente a raiz ausente** (`research_hypotheses`, nome final a confirmar) e a menor forma de decisão necessária para a UI escolhida.

Campos conceituais mínimos da raiz:

- ID estável;
- título curto;
- descrição/pergunta da hipótese;
- loteria opcional quando a hipótese for específica;
- estado de lifecycle;
- decisão atual e justificativa quando existir;
- timestamps.

Não colocar score, números gerados, resultado de backtest ou resposta de IA como colunas da hipótese.

### Relações com evidência

Evitar uma tabela genérica `entity_type + entity_id` sem integridade referencial. Quando a primeira fatia precisar persistir links, preferir relações com FKs explícitas para os artefatos realmente suportados naquele fluxo.

Exemplo de rollout seguro:

1. hipótese ↔ `backtest_runs`/`analysis_jobs` para evidência experimental;
2. hipótese ↔ `generated_game_batches` para aplicação;
3. resultado real é alcançado pelo vínculo `real_bets.batch_id`, sem nova cópia;
4. interpretação de IA referencia a evidência/hypótese somente depois de existir proveniência verificável.

Adicionar todos os tipos de relação antecipadamente produziria schema especulativo e deve ser evitado.

## Contrato de API futuro

Quando a persistência existir:

- endpoints de hipótese devem retornar IDs dos artefatos relacionados, não blobs duplicados como owner;
- leitura pode compor summaries de backtest/job/lote/aposta para UX, mas o ID original permanece canônico;
- escrita deve validar loteria e compatibilidade da estratégia/version com o artefato relacionado;
- links inválidos devem falhar de forma explícita, não ser ignorados;
- decisões devem registrar qual conjunto de evidências estava disponível no momento da decisão.

## Jornada UX recomendada

1. criar/abrir hipótese;
2. iniciar experimento em owner existente (Lab/Backtests);
3. voltar à hipótese com o ID do run/job quando houver contrato de deep link/proveniência;
4. revisar evidências lado a lado;
5. registrar decisão humana explícita;
6. se aplicável, abrir Gerador preservando versão/configuração auditável;
7. acompanhar lote/aposta real no owner de Meus Jogos;
8. opcionalmente pedir interpretação de IA sobre evidência já identificada.

A UI de pesquisa deve compor links e summaries; não deve incorporar controllers completos de Lab, Backtests, Gerador ou Meus Jogos.

## Sequência de implementação

### Fatia A — raiz da hipótese

- fechar vocabulário de lifecycle/decisão;
- migration forward-only mínima;
- repository/use case/API com integridade;
- testes de persistência e autorização já existentes da aplicação.

### Fatia B — evidência experimental

- começar por um único tipo de evidência persistida com alto valor (backtest run ou Strategy Lab job concluído);
- FK explícita;
- validação de loteria/ownership;
- UI mostra origem e status.

### Fatia C — decisão

- registrar decisão somente depois de evidência associada;
- manter `inconclusiva` como estado válido;
- não computar decisão automaticamente a partir de ranking/p-value.

### Fatia D — aplicação e resultado real

- ligar decisão a lote salvo usando ID existente;
- chegar à aposta real pelo lote;
- preservar financeiro desconhecido até a CAIXA resolver.

### Fatia E — interpretação por IA

- IA recebe contexto composto dos artefatos persistidos;
- persistir `ai_insight`/`evidence_hash` como interpretação associada;
- nunca promover texto da IA a cálculo primário.

## Critérios para não avançar schema

Não abrir migration transversal quando:

- a relação pode ser resolvida usando um ID existente já retornado pelo fluxo;
- o tipo de evidência ainda não possui persistência canônica;
- a UI/uso concreto da relação não está definido;
- a proposta exige JSON polimórfico para contornar FKs;
- a mudança mistura hipótese, execução, aplicação e IA em um único PR.

## Decisão desta fatia

A #66 não precisa começar com uma grande entidade universal de pesquisa. O primeiro conceito realmente ausente é a **hipótese persistida**, com decisão auditável; experimentos/evidências/aplicações devem reutilizar as identidades já existentes e ganhar relações incrementais conforme cada fluxo vertical for implementado.

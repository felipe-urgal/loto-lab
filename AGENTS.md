# AGENTS.md — Guia operacional para agentes de IA

Este arquivo define **como qualquer agente de IA deve trabalhar no Loto Lab**.

Ele não é uma sugestão de estilo. É um contrato de engenharia para reduzir regressões, PRs conflitantes, decisões inconsistentes e mudanças sem validação suficiente.

## Papel esperado

Atue como **Engenheiro Fullstack Sênior**, combinando:

- arquitetura backend e application layer;
- TypeScript/Node.js;
- PostgreSQL e migrations;
- frontend vanilla moderno (HTML, CSS, ES Modules);
- UX/UI e acessibilidade quando a mudança atingir interface;
- segurança de aplicação e supply chain;
- testes, CI/CD e operação;
- revisão de código orientada a risco.

Não execute tarefas mecanicamente. Antes de alterar código, entenda:

1. o comportamento atual;
2. o contrato que não pode regredir;
3. onde deveria existir o ownership da regra;
4. quais testes já protegem o fluxo;
5. quais impactos existem em frontend, backend, banco, API, operação e documentação.

## Princípios do projeto

### Algoritmo calcula; IA interpreta

A IA do produto não escolhe dezenas e não substitui cálculo estatístico/financeiro.

### Anti-leakage é invariável

Em qualquer teste histórico, validação ou experimento, o concurso alvo nunca pode entrar nos dados usados para gerar ou classificar antes da revelação do resultado.

### Auditabilidade antes de conveniência

Seeds, períodos, estratégia, versão, inputs, outputs, custos, prêmios e revisões relevantes devem permanecer reproduzíveis/auditáveis.

### Sem promessa de previsão

Frequência, atraso, pontuação, classificação e comportamento histórico não devem ser apresentados como aumento de probabilidade futura sem modelo/evidência formal válida.

## Regra de ouro do fluxo de desenvolvimento

> **Nenhum PR é considerado pronto apenas porque o CI ficou verde.**
>
> Todo PR precisa de **auto code review final completo no SHA exato que será mergeado**.

O fluxo obrigatório é:

```text
entender issue/estado da main
        ↓
verificar PRs já abertos
        ↓
criar branch a partir da main atual
        ↓
implementar uma fatia pequena/coerente
        ↓
pré-review do diff
        ↓
abrir PR
        ↓
CI + Security + E2E quando aplicável
        ↓
se falhar: investigar log e corrigir causa
        ↓
SHA final verde
        ↓
AUTO CODE REVIEW COMPLETO
        ↓
se houver achado: corrigir + novo ciclo completo
        ↓
registrar review no PR
        ↓
squash merge com SHA travado
        ↓
atualizar issue/docs/roadmap quando necessário
```

## Antes de começar qualquer mudança

### 1. Verifique a fila

Antes de criar branch/PR:

- confira PRs abertos;
- confira a issue relacionada;
- confirme o SHA atual da `main`;
- veja se outra mudança já implementou parte do trabalho.

**Não acumule PRs paralelos sem necessidade.**

Se já houver PR aberto no mesmo fluxo, termine/revise/mergeie esse PR antes de abrir outro, salvo quando o usuário pedir explicitamente trabalho paralelo e os escopos forem realmente independentes.

### 2. Trabalhe sempre sobre a `main` atual

Não baseie novas mudanças em branch antiga ou commit órfão.

Se `main` avançou:

- reconcilie a branch;
- preserve trabalho novo que entrou;
- revalide o diff final contra a `main` atual.

### 3. Leia antes de alterar

Mapeie:

- implementação atual;
- consumidores;
- testes;
- docs relevantes;
- invariantes de domínio;
- APIs/DTOs afetados;
- CSS/JS que realmente possuem ownership do comportamento.

Não use busca incompleta como prova de ausência.

## Tamanho e escopo dos PRs

Prefira **PRs pequenos, verticais, reversíveis e fáceis de revisar**.

Um bom PR responde a uma pergunta clara, por exemplo:

- extrair um use case;
- mover ownership de uma rota;
- consolidar o CSS de uma superfície;
- corrigir uma regra financeira;
- atualizar uma migration por novo contrato;
- redesenhar uma única tela.

Evite:

- rewrite geral;
- “limpeza” ampla sem critério;
- refactor horizontal que altera muitas features de uma vez;
- misturar arquitetura, metodologia, UI e banco no mesmo PR sem necessidade real.

## Pré-review obrigatório antes de abrir PR

Antes de publicar:

- compare a branch contra `main`;
- confira todos os arquivos alterados;
- procure mudanças acidentais fora do escopo;
- confirme que imports/exports públicos continuam compatíveis;
- revise erros, estados vazios e concorrência;
- valide migrations/SQL se houver banco;
- confirme responsividade/acessibilidade se houver UI;
- assegure que testes novos provam comportamento, não apenas sintaxe acidental.

## CI e validação

Nunca mergeie um SHA vermelho, incompleto ou desatualizado.

Comandos locais de referência:

```bash
npm ci
npm run quality:static
npm test
npm run audit:prod
```

Quando a UI/rota pública for afetada:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run e2e:browser
```

O pipeline do GitHub também protege:

- typecheck/lint/higiene de texto;
- cobertura;
- PostgreSQL integration;
- Compose;
- build da imagem;
- smoke;
- HTTP Basic/auth;
- browser E2E;
- CodeQL;
- Dependency Review;
- SBOM;
- scan de vulnerabilidades do container.

### Quando um gate falhar

Não faça retry cego.

1. abra o log do job;
2. identifique a causa raiz;
3. diferencie bug de produto, contrato stale, problema de teste ou infraestrutura;
4. corrija a fonte adequada;
5. não reintroduza código legado apenas para satisfazer teste antigo;
6. não afrouxe E2E/coverage para “deixar verde”;
7. gere novo SHA e revalide tudo.

## Auto code review final — obrigatório

O auto-review acontece **depois de todos os gates relevantes estarem verdes**, no SHA final.

Revise o patch publicado inteiro como se fosse um reviewer independente.

### Checklist geral

- o diff continua dentro do escopo?
- existe código morto ou implementação duplicada?
- ownership ficou mais claro ou apenas mudou de arquivo?
- contratos públicos mudaram sem intenção?
- comportamento anterior foi preservado quando era refactor?
- há edge case não coberto?
- o teste novo pode passar por motivo errado?
- a mudança introduz race condition?
- erros/falhas liberam locks/gates/resources?
- existem imports/ciclos/dependências invertidas?
- há risco de dados incorretos, especialmente financeiro?
- documentação continua verdadeira?

### Backend

- controller está fino?
- regra pertence ao application/domain em vez do HTTP?
- application importa `pg`/persistence concreta indevidamente?
- porta mínima seria suficiente?
- resource lifecycle está correto?
- timeout/cancelamento/gate são liberados em sucesso e falha?
- erro tipado é mapeado sem perder status/contrato?

### Banco

- migration nova é forward-only?
- migration aplicada não foi modificada?
- integridade TS ↔ PostgreSQL continua alinhada?
- transações e locks estão corretos?
- concorrência pode gerar duplicidade/revisão duplicada?
- `NULL` continua distinto de zero/desconhecido quando necessário?

### Frontend / UX/UI

- desktop e mobile permanecem utilizáveis?
- existe overflow horizontal?
- texto funcional respeita >=16px?
- foco e teclado funcionam?
- `prefers-reduced-motion` foi preservado?
- azul continua ação/seleção e verde sucesso/positivo?
- estados loading/empty/error/success estão corretos?
- a UI inventou gráfico/métrica sem dado real?
- `innerHTML` com dados externos está protegido?
- o novo CSS respeita ownership da feature e não mascara hardening necessário?

### Segurança

- nenhum segredo foi versionado ou exposto no browser/log?
- mutações continuam protegidas por origem/auth quando aplicável?
- input continua validado antes de chegar ao domínio/SQL?
- queries continuam parametrizadas?
- dependência nova é realmente necessária?
- não foi criada exceção ampla para scanner/CodeQL/Trivy?

### Metodologia / financeiro

- anti-leakage continua intacto?
- pontuação/classificação não foram confundidas com previsão?
- ROI usa a base financeira correta?
- apostas pendentes não viraram perda artificial?
- prêmio zero continua distinto de prêmio desconhecido?
- controle aleatório/benchmark não foi enfraquecido?

## O que fazer quando o auto-review encontrar algo

**Não mergear.**

1. descreva o achado;
2. corrija na branch;
3. adicione/ajuste teste de regressão quando apropriado;
4. gere novo SHA;
5. rode novamente CI/Security/E2E;
6. repita o auto-review final.

Só o SHA revisado e verde pode ser mergeado.

## Registro do review

Antes do merge, registre no PR um comentário/review indicando:

- SHA revisado;
- escopo do review;
- principais riscos conferidos;
- eventuais achados corrigidos;
- confirmação de CI/Security/E2E verdes;
- ausência de threads bloqueantes.

O autor não pode aprovar o próprio PR no GitHub; use **COMMENT** para registrar o auto-review.

## Merge

Padrão:

- **squash merge**;
- usar o head SHA esperado/travado;
- não mergear se o PR mudou depois do review;
- depois do merge, confirmar o commit em `main`.

Se o head mudar depois do auto-review, o review precisa ser refeito no novo SHA.

## Frontend: direção oficial

A linguagem visual oficial é o **Protótipo 1 — Dark Moderno / Workspace científico compacto**.

Fonte: `docs/design/PROTOTYPE_1_DARK_MODERN.md`.

Guardrails:

- azul = ação, seleção e dado principal;
- verde = sucesso/resultado positivo;
- fundos azul-preto/grafite;
- sem gradiente/glow decorativo excessivo;
- alta densidade controlada;
- texto funcional >=16px;
- gráficos apenas quando dado real justifica;
- mobile não deve ser apenas desktop empilhado;
- acessibilidade faz parte do design, não é acabamento posterior.

Mudanças visuais devem respeitar #121. Arquitetura frontend/TypeScript pertence à #60; arquitetura de informação/jornada pertence à #64.

## Backend: direção arquitetural

Arquitetura alvo:

```text
HTTP / CLI / Scheduler / Worker
          ↓
Application Use Cases
          ↓
Domain / engines
          ↓
Ports
          ↓
PostgreSQL / CAIXA / OpenAI / worker_threads
```

Regras:

- controllers fazem transporte, não regra;
- use case não deve depender de `pg` ou repository concreto quando uma porta mínima resolve;
- composição concreta deve ficar no composition root;
- preserve contratos públicos durante refactors;
- prefira compatibilidade estrutural de interfaces quando suficiente;
- remova implementações legadas mortas após strangler, em PR pequeno próprio se necessário.

A migração restante é rastreada pela #61.

## PostgreSQL e migrations

- migrations são **imutáveis depois de aplicadas**;
- mudanças de schema entram em migration nova;
- preserve checksum e advisory lock;
- use transação quando múltiplas escritas precisam ser atômicas;
- mantenha queries parametrizadas;
- valide invariantes no TypeScript e no PostgreSQL quando defesa em profundidade for valiosa;
- testes integrados devem usar o helper de isolamento de database.

## Concorrência e trabalhos pesados

Para backtests/análises/Lab:

- respeite gate compartilhado;
- timeout e cancelamento precisam terminar worker;
- `AbortSignal` deve propagar;
- gate/resource deve ser liberado em `finally` ou equivalente;
- não aumente concorrência sem medir CPU/heap/tempo;
- enfileirar não deve ser forma de contornar limites do endpoint interativo.

## Documentação

Documentação faz parte do Definition of Done quando comportamento, arquitetura, operação ou UX mudarem.

Fontes principais:

- `README.md` — entrada do projeto;
- `docs/ROADMAP.md` — prioridade e estado real;
- `docs/API.md` — HTTP;
- `docs/WEB.md` — frontend;
- `docs/RELIABILITY.md` — hardening;
- `docs/QUALITY.md` — gates;
- `docs/design/PROTOTYPE_1_DARK_MODERN.md` — direção visual.

Não deixe README/roadmap descrevendo código que já foi removido ou tarefas já concluídas.

`docs/tasks/` pode preservar histórico, mas deve deixar claro quando a tarefa já foi concluída.

## Issues

Issues abertas devem representar trabalho real ainda pendente.

Ao concluir um epic/decisão:

- atualize o corpo com o estado final;
- feche como `completed`;
- mova trabalho remanescente para a issue correta em vez de manter escopo obsoleto.

Não use issue fechada como backlog escondido.

## Branch protection

A `main` ainda não possui branch protection obrigatória (#52). Até essa configuração administrativa ser aplicada, o agente deve tratar as regras deste arquivo como **proteção manual obrigatória**:

- sempre PR;
- CI/Security verdes;
- auto-review final;
- squash merge;
- nunca force-push/deletar `main`.

## Critério de qualidade sênior

Uma mudança não é boa apenas por funcionar no happy path.

Pergunte sempre:

- o que acontece com dado ausente?
- e se a chamada for repetida?
- e se duas chamadas ocorrerem juntas?
- e se o worker falhar no meio?
- e se o usuário navegar durante loading?
- e no mobile?
- e sem OpenAI?
- e com banco parcial?
- e se o resultado financeiro ainda não estiver completo?
- e se um concurso estiver faltando no histórico?
- e se `main` avançar durante o PR?

O objetivo é deixar o sistema **mais simples de entender, mais difícil de quebrar e mais fácil de auditar** após cada PR.

# Loto Lab — 03 Architect

Overlay local do papel `03-architect`. Contrato e autorizações permanecem no `agent-orchestrator`.

Para o Loto Lab:

- preserve o fluxo `Browser -> web -> src/api -> src/application -> engines/domínio -> adapters concretos`;
- `src/api/server.ts` permanece composition root das features HTTP; controllers ficam finos e use cases não ganham interface sem boundary real;
- PostgreSQL é a fonte operacional; JSON permanece restrito a dataset offline/importação/ferramentas específicas;
- IA é provider interpretativo e nunca owner de cálculo crítico, geração, backtest ou financeiro;
- migrations são forward-only, migration aplicada é imutável e checksum/advisory lock precisam permanecer válidos;
- mudanças metodológicas devem preservar anti-leakage, reprodutibilidade e diferenças legítimas entre loterias;
- workers, gates, locks e recursos pesados precisam de ownership, cancelamento e cleanup explícitos.
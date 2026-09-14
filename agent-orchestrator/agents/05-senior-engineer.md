# Loto Lab — 05 Senior Engineer

Overlay local do papel `05-senior-engineer`. Missão, estados e autorizações continuam no `agent-orchestrator`.

Para o Loto Lab:

- leia `AGENTS.md` e os contratos especializados do domínio afetado antes de implementar;
- em análise/geração/backtest, preserve equivalência matemática quando o objetivo for refactor e proteja anti-leakage explicitamente;
- IA não escolhe dezenas nem substitui cálculo crítico; preserve determinismo/auditabilidade de seeds, versões, inputs e outputs;
- desconhecido/`NULL` não vira zero e aposta pendente não vira perda; financeiro deve continuar reproduzível;
- PostgreSQL permanece fonte operacional e migrations aplicadas não são editadas;
- em trabalho pesado, propague cancelamento quando suportado e libere worker/gate/lock em erro, timeout e cancelamento;
- execute os gates aplicáveis e revise o diff final; checkout gravável não amplia push, PR, merge, deploy ou release.
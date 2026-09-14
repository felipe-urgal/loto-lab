# Loto Lab — 06 Reviewer

Overlay local do papel `06-reviewer`. O workflow externo continua responsável por protocolo e transições.

Para o Loto Lab:

- revise o head exato e o diff completo contra a base correta;
- em análise/geração/backtest, procure leakage temporal, mudança matemática acidental, alteração de seed/baseline/metodologia e perda de auditabilidade;
- em financeiro, diferencie pendente, desconhecido/`NULL` e zero e confira custo, prêmio, resultado e ROI sobre a base correta;
- confirme que PostgreSQL continua fonte operacional e que migrations/queries preservam integridade, parametrização e locking;
- revise cancelamento, timeout, gate/worker/lock e cleanup em trabalho pesado;
- confira gates e testes proporcionais ao risco no mesmo head e diferencie evidência local, CI e validação manual;
- não aceite linguagem de previsão que os dados/metodologia não sustentem.
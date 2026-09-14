# Loto Lab — 04 Execution Builder

Overlay local do papel `04-execution-builder`. Não replique aqui o protocolo global do workflow.

Para o Loto Lab, o prompt de execução deve:

- citar `AGENTS.md`, `README.md`, `docs/DEVELOPMENT.md` e a documentação especializada do domínio afetado (`API`, `WEB`, `DATABASE`, `TESTING`, `QUALITY`, `RELIABILITY`, `PRODUCTION`, `AI`, `ANALYSES` conforme necessário);
- explicitar anti-leakage, auditabilidade, baseline/metodologia e diferenças entre loterias quando o escopo tocar análise/geração/backtest;
- separar PostgreSQL operacional de datasets JSON offline;
- exigir regressão/characterization test quando houver risco de vazamento temporal ou mudança matemática não intencional;
- incluir gates de qualidade e validações adicionais proporcionais a banco, segurança, concorrência, frontend ou produção;
- distinguir teste local, CI remoto e validação manual;
- não converter falta de checkout/shell em autorização para escrita remota.
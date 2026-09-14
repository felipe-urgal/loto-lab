# Loto Lab — 07 Maintainer

Overlay local do papel `07-maintainer`. Readiness não implica ação protegida.

Para o Loto Lab:

- revalide branch, head, PR, CI, review e documentação no estado exato considerado para entrega;
- confirme gates aplicáveis ao mesmo head final e preserve evidência de metodologia quando a mudança tocar análises/backtests;
- para banco, confira migration nova, checksum/lock, compatibilidade, backup/restore e saúde operacional conforme o risco;
- para produção, confira Docker/runtime, configuração, health/readiness, recovery e ausência de segredos antes de qualquer promoção;
- confirme que anti-leakage, auditabilidade, desconhecido vs zero e PostgreSQL como fonte operacional continuam preservados;
- merge, deploy, migration operacional e release são ações separadas e exigem autorização própria;
- não use produção real como validação implícita de PR.
# Loto Lab — 01 Discovery

Overlay local do papel `01-discovery`. O protocolo global permanece no `agent-orchestrator`.

Para o Loto Lab:

- investigue implementação, testes, docs e issue antes de reabrir decisão já tomada;
- em análise, geração, backtest ou Strategy Lab, identifique explicitamente a fronteira anti-leakage e o conjunto de dados disponível antes do resultado alvo;
- preserve auditabilidade de seed, período, estratégia, versão, inputs, outputs, custos e prêmios quando o fluxo suporta replay;
- não trate frequência, atraso, score ou ranking histórico como promessa de probabilidade futura;
- diferencie desconhecido/`NULL`, pendente e zero, especialmente em financeiro;
- diferenças legítimas entre Mega-Sena, Lotofácil e Dia de Sorte são domínio e não devem ser escondidas por abstração genérica;
- critérios de sucesso devem ser verificáveis e metodologicamente honestos.
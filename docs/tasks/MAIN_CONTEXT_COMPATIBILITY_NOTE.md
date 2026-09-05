# Nota de compatibilidade do hash principal

Issue: #60

`mainViewFromHash` preserva a semântica histórica: remove `#` e usa `dashboard` apenas quando o hash está vazio. A validação de um valor desconhecido continua sendo responsabilidade do shell, que normaliza a navegação principal para `dashboard`.

Essa separação evita mudar um helper público durante a centralização do catálogo de views/loterias.

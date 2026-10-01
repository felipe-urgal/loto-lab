## Objetivo

<!-- O que muda e por quê? -->

## Escopo

<!-- Principais alterações. -->

## Como validar

- [ ] `npm run check`
- [ ] Testes relevantes executados
- [ ] Fluxo principal validado
- [ ] Erros/regressões relevantes verificados
- [ ] Anti-leakage/reprodutibilidade revisados quando aplicável

Para mudanças em UI/fluxos do Redesign V2:

- [ ] `npm run test:e2e:redesign`
- [ ] Desktop 1440×900, tablet 820×1180 e mobile 390×844 sem overflow estrutural
- [ ] Teclado, foco visível, nomes acessíveis, disabled e alvos mínimos de 44px verificados
- [ ] `prefers-reduced-motion` e feedback assíncrono por live region preservados
- [ ] Loading, vazio, erro/indisponível e sucesso relevantes revisados
- [ ] Capabilities/família da modalidade respeitadas; nenhum controle incompatível foi forçado

Comandos/resultados:

## Risco e rollback

<!-- Dados, metodologia, migration, contrato, performance ou operação irreversível? Como reverter? -->

## Review

- [ ] A solução é a menor que resolve o problema.
- [ ] Responsabilidades continuam claras.
- [ ] Não há abstração sem necessidade concreta.
- [ ] Segurança e metodologia foram consideradas quando aplicável.
- [ ] O diff final foi revisado.

Para mudanças maiores, use docs/TASK_TEMPLATE.md.

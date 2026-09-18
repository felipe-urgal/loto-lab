# Tarefa

## Uso deste template

Este documento ajuda a estruturar problema, fluxo, critérios de aceite, riscos e validação em issues, planejamento ou especificações locais.

Quando o trabalho estiver sendo coordenado pelo `agent-orchestrator`, **não crie uma segunda task operacional neste repositório**. A fonte canônica de estado da execução fica no repositório central:

```text
tasks/loto-lab/<TASK-ID>.md
```

Este template pode fornecer conteúdo para a especificação, mas não mantém `workflow`, `status`, `current_agent`, `next_agent`, autorizações, refs de trabalho ou handoff. Esses campos pertencem exclusivamente à task canônica do `agent-orchestrator`.

## 1. O que e por quê?

- [ ] Criar funcionalidade
- [ ] Ajustar / corrigir bug
- [ ] Analisar / refatorar código

**Problema:** descreva o cenário atual.

**Ganho:** descreva o resultado esperado.

## 2. Como o usuário vê?

**Referência visual:** Figma, print ou descrição quando houver UI.

**Fluxo**

1. O usuário aciona...
2. O sistema processa...
3. O resultado final é...

**Trava-erros e feedback**

- Status:
- Bloqueios:
- Sucesso:
- Erro:

## 3. Critérios de aceite

- [ ] Cenário feliz: dado..., quando..., então...
- [ ] Cenário de erro: dado..., quando..., então...

## 4. Arquitetura e código

- Frontend:
- Backend:
- Persistência/infra:

- [ ] KISS/YAGNI.
- [ ] Responsabilidade com owner claro.
- [ ] Sem abstração prematura.
- [ ] Integrações isoladas quando isso protege o domínio.

## 5. Segurança, performance e metodologia

- Permissão:
- Dados sensíveis:
- Risco de leakage:
- Risco de performance:
- Mitigação:

## 6. Testes e rollback

- [ ] Unitário
- [ ] Integração
- [ ] E2E
- [ ] Manual

**Rollback:** como desfazer ou desativar a mudança.

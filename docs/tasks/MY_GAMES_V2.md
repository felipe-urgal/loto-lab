# Meus jogos 2.0

## Objetivo

Transformar **Meus jogos** em uma tela de gestão com hierarquia progressiva: a lista principal mostra apenas o estado essencial de cada lote; jogos, conferência e ações ficam sob demanda.

## Decisões de UX

- Remover o painel intermediário "Organizar lotes" da primeira camada visual.
- Usar filtros simples: **Todos**, **Apostados**, **Gerados** e **Ocultos**.
- Um lote ocupa uma única linha quando fechado.
- Estado, quantidade de jogos, concurso alvo e data são suficientes na visão compacta.
- Números e ações aparecem apenas após expandir o lote.
- A conferência é renderizada dentro do lote expandido; não existe mais um resultado global solto abaixo da lista.
- **Ocultar** nunca apaga dados. O lote sai da lista principal e pode ser restaurado em **Ocultos**.
- Lotes vinculados a apostas reais também podem ser ocultados; a aposta e o histórico financeiro permanecem intactos.
- "Arquivar/restaurar" continuam como aliases internos de compatibilidade, mas a linguagem do produto é "ocultar/mostrar".
- Controles e texto funcional respeitam a regra global de legibilidade mínima de 16 px.

## Validação

O fluxo de navegador deve provar: lote apostado visível → expandir → ocultar → desaparece da lista principal → aparece em Ocultos → restaurar → volta à lista principal, inclusive em viewport mobile sem overflow horizontal.

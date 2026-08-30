# Protótipo 1 — Dark Moderno

> Direção visual oficial do Loto Lab. Decisão registrada em #120; rollout e consolidação acompanhados por #121.

![Referência visual](./prototype-1-dark-workspace.svg)

## Estado atual

A direção deixou de ser apenas protótipo: o rollout principal já foi aplicado ao produto.

Entre #123 e #133 foram migrados o shell e as superfícies do workspace; #134–#137 iniciaram a consolidação das camadas CSS que ficaram redundantes depois do rollout.

O trabalho restante em #121 é de **consolidação final**, não de redefinição da linguagem:

- remover apenas CSS comprovadamente sem consumidor/redundante;
- absorver overrides corretivos quando a fonte canônica já possui ownership claro;
- revisar contraste, foco, teclado e reduced-motion transversalmente;
- revisar layout shift/performance visual;
- fechar revisão desktop/mobile/UX final.

Mudanças maiores de arquitetura frontend pertencem à #60. Mudanças de jornada/arquitetura de informação pertencem à #64.

## Intenção

Workspace científico compacto para uso prolongado: escuro, técnico, moderno e com alta densidade controlada.

A interface deve facilitar leitura, comparação e ação rápida sem parecer um dashboard genérico pesado e sem usar decoração para compensar ausência de informação real.

## Regras visuais

- fundo geral azul-preto muito escuro;
- superfícies azul-grafite com bordas discretas;
- azul vivo para ação, seleção, contexto ativo e dado principal;
- verde reservado para sucesso/resultado realmente positivo;
- âmbar para pendência/atenção;
- vermelho para erro, risco ou resultado negativo real;
- sem gradientes decorativos e sem glow excessivo;
- radius discreto;
- sombras/elevation mínimos;
- tipografia funcional mínima de 16px;
- títulos contidos e métricas numericamente fortes;
- tabelas densas, gráficos técnicos e filtros compactos;
- gráfico somente quando existe dado real que justifica a visualização.

## Tokens e foundation

A linguagem compartilhada é materializada principalmente em `web/design-system.css`.

A regra arquitetural é:

```text
base histórica/fundação
        ↓
design-system.css
        ↓
CSS funcional da feature
        ↓
*-workspace.css como ownership final da apresentação
```

Nem toda página precisa possuir exatamente a mesma quantidade de folhas. O objetivo é que a **fonte canônica final** seja clara e que nenhuma camada global de correção esconda dívida da feature.

`readability.css`, `readability.js` e `localization.js` já foram removidos. PT-BR e legibilidade nascem na fonte.

## Shell

### Desktop

- sidebar persistente à esquerda;
- item ativo com fundo/indicador azul discreto;
- conteúdo usa a largura disponível sem virar uma parede de cards;
- topbar mínima e contextual;
- páginas compartilham grid, tokens e ritmo vertical.

### Mobile

- não reproduzir sidebar desktop como coluna comprimida;
- navegação compacta apropriada ao viewport;
- cards/tabelas se reorganizam por prioridade, não apenas por empilhamento mecânico;
- ação principal permanece alcançável;
- não deve existir overflow horizontal estrutural.

## Componentes e padrões base

- Button / IconButton;
- Tabs / Segmented Control;
- Card / Panel;
- Metric;
- Input / Select / Checkbox / Radio;
- Badge / Status;
- Table;
- Dialog / Drawer;
- Empty / Loading / Error / Success;
- LotteryBall;
- superfícies de gráfico, legenda e tooltip.

Não existe obrigação de criar um componente abstrato apenas para cumprir a lista. Reuso deve surgir quando houver contrato comum real.

## Hierarquia

1. estado atual / resultado principal;
2. ação principal;
3. comparação/evidência;
4. filtros e controles;
5. detalhe avançado por progressive disclosure.

## Superfícies cobertas

A linguagem visual oficial cobre:

- Painel;
- Análises;
- Gerador;
- Meus Jogos / Apostas Reais;
- Testes históricos;
- Laboratório;
- Estratégias;
- Execuções;
- Agenda / Operações;
- IA;
- dialogs/drawers;
- tabelas, gráficos e formulários;
- loading, empty, error e success.

Cada superfície pode preservar estrutura própria quando isso melhora sua tarefa principal. Consistência não significa tornar todas as páginas o mesmo grid de cards.

## Histórico do rollout

A ordem adotada foi:

1. Foundations / Design System;
2. Shell e navegação;
3. Painel;
4. Análises;
5. Gerador;
6. Meus Jogos / Apostas Reais;
7. Pesquisa — Testes históricos, Laboratório e Estratégias;
8. Operação — Execuções, Agenda e IA;
9. consolidação do legado visual.

A implementação foi fatiada por superfície para manter PRs pequenos e E2E revisável.

## Guardrails de implementação

- esta referência é fonte de verdade da linguagem visual;
- não misturar linguagem dos protótipos descartados;
- não mudar backend/domínio por conveniência visual;
- azul não substitui verde em estado de sucesso;
- dado positivo/negativo deve respeitar semântica, não apenas estética;
- desktop, mobile, teclado, contraste e reduced-motion são requisitos;
- texto funcional não volta abaixo de 16px;
- gráfico/métrica fictícia para preencher layout é proibido;
- CSS novo deve ter ownership de feature claro;
- `hardening` funcional não é removido apenas por nome;
- PRs visuais continuam exigindo CI/E2E + auto code review final no SHA exato antes do merge.

## Critério de conclusão da #121

A consolidação visual está pronta quando:

- não houver override/camada corretiva sem owner claro;
- CSS redundante estiver removido com evidência de ausência de consumidor;
- todas as superfícies mantiverem a linguagem do Protótipo 1;
- browser E2E desktop/mobile continuar verde;
- foco, teclado, contraste e reduced-motion forem revisados transversalmente;
- o produto não depender de uma camada global para corrigir legibilidade/copy;
- mudanças futuras puderem ser feitas na fonte canônica da própria feature.

Relacionadas: #60, #64, #120 e #121.

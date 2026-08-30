# Protótipo 1 — Dark Moderno

> Direção visual oficial do Loto Lab. Decisão registrada em #120; rollout e consolidação concluídos pela #121.

![Referência visual](./prototype-1-dark-workspace.svg)

## Estado atual

A direção deixou de ser apenas protótipo: o rollout e a consolidação visual foram concluídos.

Entre #123 e #133 foram migrados o shell e todas as superfícies principais. Os PRs #134–#142 consolidaram ownership e removeram camadas CSS comprovadamente redundantes; #143 fechou a auditoria transversal de legibilidade, foco por teclado, reduced-motion e comportamento mobile, inclusive corrigindo um overflow horizontal real em Análises sem enfraquecer o E2E.

A #121 está concluída. Trabalho futuro deve respeitar esta linguagem e seguir para a issue que realmente possui o novo escopo:

- arquitetura frontend, TypeScript e primitives compartilhadas: #60;
- arquitetura de informação/jornada: #64;
- Web Vitals e otimizações de performance baseadas em medição: #65.

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

Folhas funcionais adicionais podem permanecer quando possuem responsabilidade real. Em especial, bases funcionais e fallbacks deliberados não são “legado” apenas por coexistirem com um `*-workspace.css`.

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

Não existe obrigação de criar um componente abstrato apenas para cumprir a lista. Reuso deve surgir quando houver contrato comum real. A evolução dessas primitives pertence à #60.

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
9. consolidação do legado visual e ownership;
10. auditoria transversal desktop/mobile e acessibilidade.

A implementação foi fatiada por superfície para manter PRs pequenos e E2E revisável.

### Consolidação final

- #134 — IA assume `ai-workspace.css` como owner canônico;
- #135 — Agenda assume `agenda-workspace.css`;
- #136 — Laboratório absorve `lab.css`/`lab-v2.css`;
- #137 — Estratégias e Execuções deixam o antigo `experiments.css`;
- #139 — hardening visual de Análises é absorvido no workspace canônico;
- #140 — assets legados de diversidade do Gerador são removidos;
- #141 — status visual do Painel é absorvido no scope canônico;
- #142 — explainability visual do Gerador é absorvida no workspace, preservando o módulo funcional;
- #143 — auditoria transversal final em navegador real, com desktop/mobile, foco visível, reduced-motion, piso tipográfico e ausência de overflow estrutural.

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

## Evidência de conclusão da #121

A consolidação visual foi encerrada porque:

- overrides/camadas corretivas sem owner claro foram absorvidos ou removidos quando havia evidência;
- folhas que permanecem possuem responsabilidade funcional, estrutural ou fallback explícita;
- todas as superfícies mantêm a linguagem do Protótipo 1;
- browser E2E desktop/mobile ficou verde no SHA final do #143;
- foco por teclado, texto funcional >=16px, reduced-motion e overflow horizontal passaram a ter auditoria transversal em navegador real;
- contraste e semântica de estados continuam protegidos pelos tokens/contratos dos workspaces;
- o produto não depende de camada global para corrigir legibilidade ou copy;
- mudanças futuras podem ser feitas na fonte canônica da própria feature.

Performance percebida continua protegida pelo lifecycle e E2E. Medições quantitativas de LCP/INP/CLS e otimizações baseadas em evidência pertencem à #65, não reabrem a #121.

Relacionadas: #60, #64, #65, #120 e #121.

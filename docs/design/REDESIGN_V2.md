# Redesign V2 — contrato visual e arquitetura de informação

Status: aprovado para rollout  
Issue: #297  
Atualizado em: 2026-10-01

## Objetivo

Este documento é a fonte de verdade do Redesign V2. Ele consolida as decisões aprovadas antes do rollout das issues #298, #304, #306 e #308.

O produto deve priorizar uma experiência minimalista, consistente e orientada às três tarefas principais. Mudanças de cálculo, persistência, regras de loteria, auditoria ou capabilities não pertencem a este contrato.

## Arquitetura de informação

A navegação primária tem exatamente três destinos, nesta ordem:

1. **Painel**
2. **Análises**
3. **Gerar jogos**

Não existe item ou agrupamento "Avançado".

As superfícies antigas deixam de ser destinos principais. Funcionalidades ainda necessárias devem ser absorvidas pelas três telas sem apagar dados, APIs, motores ou contratos técnicos usados internamente.

### Política para rotas antigas

| Origem antiga | Destino funcional | Regra de rollout |
| --- | --- | --- |
| Meus jogos / Resultados / Conferência | Painel | jogos salvos e conferência aparecem no Painel |
| Agenda | Painel | mostrar apenas pendências, frescor e próximos eventos úteis |
| Execuções | Painel | mostrar somente falhas/estado que exijam ação do usuário |
| Testes históricos / Backtests | Análises | preservar evidência útil sob progressive disclosure |
| Laboratório | Análises | absorver apenas análise que continue relevante |
| Estratégias | Análises / Gerar jogos | exposição depende da jornada e da capability |
| IA | Análises | interpretação é complementar; cálculo crítico continua determinístico |

Durante o rollout, deep links antigos devem redirecionar para o destino funcional correspondente. Não devem terminar em tela vazia, erro ou navegação órfã.

## Direção visual

### Princípios

- fundo grafite e superfícies escuras;
- violeta como cor de seleção, foco e ação principal;
- poucos contêineres; preferir espaçamento e divisórias quando um card não acrescentar hierarquia;
- títulos claros e textos secundários legíveis;
- uma ação principal evidente por contexto;
- informação técnica sob demanda, sem dominar a primeira dobra;
- ausência de dado nunca deve ser apresentada como zero.

### Tokens base

Os tokens vivem em `web/design-system.css`.

| Papel | Token | Valor |
| --- | --- | --- |
| Fundo | `--bg` | `#08111d` |
| Sidebar | `--sidebar` | `#09131f` |
| Superfície | `--surface` | `#0f1b29` |
| Superfície elevada | `--surface-2` | `#132235` |
| Texto | `--text` | `#edf5ff` |
| Texto secundário | `--muted` | `#91a4ba` |
| Ação principal | `--accent` | `#7c3aed` |
| Ação/seleção clara | `--accent-strong` | `#c4b5fd` |
| Seleção suave | `--accent-soft` | `rgba(124, 58, 237, 0.16)` |
| Raio padrão | `--radius` | `12px` |
| Raio compacto | `--radius-sm` | `8px` |
| Largura da sidebar | `--sidebar-width` | `220px` |
| Conteúdo amplo | `--content-max-width` | `1280px` |
| Leitura | `--content-reading-width` | `760px` |
| Controle mínimo | `--control-min-size` | `44px` |

A escala de espaçamento compartilhada é 4, 8, 12, 16, 20, 24, 32 e 40 px, exposta pelos tokens `--space-1` a `--space-10`.

Contraste mínimo validado para os papéis principais:

- botão primário `#7c3aed` com texto branco: 5.70:1;
- texto de seleção `#c4b5fd` sobre `#08111d`: 10.26:1;
- texto principal `#edf5ff` sobre `#08111d`: 17.24:1;
- texto secundário `#91a4ba` sobre `#08111d`: 7.42:1.

## Layouts aprovados

### Painel

A tela é centrada na modalidade selecionada.

Primeira camada:

- seleção de modalidade;
- último resultado, concurso/data e dezenas quando a modalidade for numérica;
- próximo concurso/evento quando disponível;
- ação principal compatível com a capability da modalidade.

Segunda camada:

- jogos salvos;
- status de conferência;
- resultados recentes;
- pendências;
- frescor dos dados e falhas recuperáveis quando exigirem ação.

Não destacar ROI histórico, cobertura técnica ou métricas agregadas como resumo principal. Resultados reais e simulações devem permanecer semanticamente separados.

### Análises

Direção aprovada: **Mapa único das dezenas** para modalidades numéricas.

- grade ordenada das dezenas;
- filtros por grupo;
- categoria comunicada por texto além de cor;
- seleção de uma dezena abre seus indicadores;
- comparação continua disponível;
- referência do concurso e aviso sobre probabilidade permanecem visíveis;
- metodologia e detalhes técnicos ficam sob progressive disclosure.

Não espalhar métricas analíticas pelo restante do produto.

### Gerar jogos

Direção aprovada: **Mesa de montagem**.

Fluxo principal:

**configurar → gerar prévia → revisar → salvar**

No desktop:

- grade de dezenas como área central para modalidades numéricas;
- configuração e resumo em área lateral;
- Fixar, Excluir e Automática com estados explícitos;
- filtros e metodologia/auditoria recolhíveis;
- ação principal para gerar prévia auditável;
- revisão obrigatória antes de salvar.

Alterar configuração invalida a prévia. Salvar deve persistir exatamente o conteúdo revisado.

## Responsividade

Os breakpoints existentes permanecem como contrato inicial:

- **desktop:** acima de 900 px;
- **compacto/tablet:** 681–900 px;
- **mobile:** até 680 px.

### Desktop

- sidebar persistente;
- conteúdo com largura controlada conforme a tarefa;
- evitar grids que ocupem largura extra sem ganho de leitura.

### Tablet

- navegação pode ser reduzida a ícones, preservando nome acessível;
- controles e conteúdo não podem depender de hover;
- nenhuma informação essencial deve exigir rolagem horizontal da página.

### Mobile

A navegação deve conter somente os três destinos principais.

- uma coluna para a hierarquia principal;
- controles com alvo mínimo de 44 × 44 px;
- seletor de modalidade substitui grupos de abas quando necessário;
- grades numéricas adaptam número de colunas sem reduzir legibilidade/toque;
- configuração do Gerador pode virar resumo expansível acima da grade;
- CTA principal permanece acessível no fluxo vertical;
- respeitar safe area quando houver navegação fixa.

## Capabilities

A interface não deve presumir que toda modalidade é uma lista plana de dezenas.

- grade numérica somente para modalidades que a suportam;
- campos secundários, colunas, trevos, time ou prognósticos devem usar renderização específica;
- controles incompatíveis ficam ausentes, não apenas desabilitados;
- ausência de agenda, custo, prêmio ou dado financeiro não é erro quando a capability não existir;
- desconhecido/indisponível nunca vira zero.

## Estados

Toda superfície de rollout deve prever:

- loading sem layout shift desnecessário;
- vazio com explicação e próxima ação quando houver;
- erro com contexto suficiente e recuperação segura quando possível;
- indisponível/sem capability sem aparência de falha;
- sucesso assíncrono com feedback não dependente apenas de cor.

## Acessibilidade

- navegação completa por teclado;
- foco visível usando `--accent-strong`;
- `aria-current="page"` no destino ativo;
- texto ou ícone semântico além de cor para categorias/status;
- respeitar `prefers-reduced-motion`;
- não ocultar informação essencial em tooltip/hover;
- evitar overflow horizontal estrutural;
- manter labels e nomes acessíveis quando a navegação exibir apenas ícones.

A validação transversal e E2E pertence à #308, mas cada issue de rollout deve preservar estes guardrails.

## Limites das issues de rollout

- **#298:** navegação de três itens, política de redirecionamento e novo Painel.
- **#304:** Gerar jogos conforme Mesa de montagem e fluxo de prévia/revisão/salvamento.
- **#306:** Análises como única superfície analítica.
- **#308:** gate responsivo, visual e acessível.

Este contrato não autoriza remover persistência, dados históricos, jobs, estratégias, backtests, APIs ou motores que ainda sejam necessários internamente.

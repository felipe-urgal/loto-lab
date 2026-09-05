# Protótipo de jornada e arquitetura de informação

Issue: #64

Status: protótipo de decisão antes de implementação multissuperfície.

## Objetivo

Reduzir troca de contexto sem apagar capacidades, quebrar deep links ou transformar o produto em um fluxo rígido. A jornada de referência é:

```text
Entender → Experimentar → Aplicar → Acompanhar → Operar
```

O protótipo não propõe uma navegação nova só por estética. Cada movimento precisa aproximar uma ação de seu contexto de decisão e preservar a auditabilidade científica do Loto Lab.

## Princípios

1. **Contexto primeiro.** A ação aparece onde a dúvida nasce; páginas especializadas continuam acessíveis quando o trabalho exige profundidade.
2. **Sem duplicação funcional.** Contextualizar significa criar entradas e resumos, não copiar controllers, formulários ou regras para outra tela.
3. **Deep links permanecem estáveis.** `/#backtests`, `/lab`, `/jobs`, `/ai` e demais rotas atuais continuam válidas durante a evolução.
4. **Algoritmo calcula; IA interpreta.** IA nunca vira atalho para escolher dezenas ou substituir evidência quantitativa.
5. **Histórico não vira previsão.** Backtests e Laboratório continuam explicitando que resultados passados não aumentam a probabilidade futura de uma combinação válida.
6. **Desktop e mobile têm hierarquia própria.** Menos troca de contexto não pode significar empilhar uma tela inteira dentro de outra no mobile.
7. **Acessibilidade é parte do fluxo.** Foco visível, teclado, reduced-motion, headings e alvos de interação seguem os contratos atuais.

## Inventário atual

A navegação canônica possui quatro superfícies primárias no app principal — Painel, Análises, Gerar jogos e Meus jogos — e superfícies especializadas acessíveis pelo grupo adicional: Testes históricos, Laboratório, Estratégias, Execuções, Agenda e IA.

A estrutura técnica já favorece evolução incremental: o shell possui ownership TypeScript, as features possuem owners próprios e os arquivos JavaScript públicos são boundaries de asset. Portanto, a reorganização deve compor links/context cards e contratos existentes em vez de fundir implementações.

## Protótipo A — contexto sem remoção de rotas

Este é o protótipo recomendado.

### 1. Entender — Painel + Análises

**Painel** continua a porta de entrada operacional. Deve responder rapidamente:

- qual loteria/escopo está ativo;
- quão atual é a base;
- qual é o último concurso conhecido;
- se existem resultados financeiros incompletos;
- quais ações recentes merecem atenção.

**Análises** permanece a superfície técnica de leitura histórica. Nenhuma ação de aplicação deve ser escondida dentro dos gráficos. O próximo passo explícito é escolher entre:

- `Experimentar no Laboratório` quando a pergunta é sobre hipótese/estratégia;
- `Gerar jogos` quando a intenção é aplicar uma configuração já compreendida.

### 2. Experimentar — Laboratório como hub de evidência

O Laboratório torna-se o contexto principal para experimentos, sem absorver controllers alheios.

No resultado de um experimento, o workspace oferece duas saídas contextuais:

- **Testar historicamente** — abre `/#backtests` com contexto suficiente para o usuário entender qual hipótese/estratégia originou a ação quando o contrato permitir, sem duplicar o formulário de Backtests dentro do Lab;
- **Ver execução** — quando a operação é assíncrona, direciona ao job correspondente em `/jobs`.

`/#backtests` continua rota de primeira classe e pode ser aberta diretamente. A diferença é que deixa de ser uma ilha na jornada: passa a existir também como ação contextual do Laboratório.

### 3. Aplicar — Gerador

O Gerador continua dono de `plano → prévia congelada → save exato`.

A contextualização desejada é somente de proveniência:

```text
Hipótese/estratégia avaliada
        ↓
resultado/evidência consultada
        ↓
Gerar jogos
        ↓
Preview ID + seed + auditoria do lote
```

Não deve existir botão do tipo “usar a melhor estratégia automaticamente” se isso esconder a decisão do usuário ou transformar ranking histórico em promessa preditiva.

### 4. Acompanhar — Meus jogos + Agenda

**Meus jogos** continua dono do lifecycle de lotes, conferência, comparação, apostas reais e financeiro.

Ações com dimensão temporal podem apontar para **Agenda**, mas Agenda não replica cards financeiros nem estado de lotes. O vínculo deve ser semântico: “há algo a fazer/quando”, enquanto Meus jogos responde “qual o estado/resultado deste lote ou aposta”.

### 5. Operar — Execuções + estado operacional

`/jobs` continua a superfície de inspeção operacional completa, porém deixa de depender apenas da navegação global para ser descoberta.

Toda feature que iniciar trabalho assíncrono deve, quando houver `jobId`, oferecer ação direta `Ver execução`. A página de Execuções deve oferecer caminho de volta à origem quando o contrato do job contiver origem segura e estável.

Isso reduz o padrão atual:

```text
iniciar operação → abrir menu Mais → Execuções → localizar job
```

para:

```text
iniciar operação → Ver execução
```

sem mover a implementação de jobs para várias features.

## IA: evidência contextual, não destino obrigatório

A IA permanece disponível em `/ai`, mas o papel recomendado é interpretativo e contextual.

Quando houver evidência persistida válida, superfícies como Laboratório podem oferecer `Interpretar evidência com IA`, levando o usuário à IA com a loteria/resultado identificável pelo contrato existente ou por uma extensão futura explícita.

A IA deve mostrar a proveniência da evidência usada e separar:

- fatos calculados/persistidos;
- interpretação textual;
- limitações da amostra/metodologia.

Não entra neste protótipo qualquer fluxo em que a IA selecione dezenas, altere o plano do Gerador ou fabrique uma conclusão na ausência de evidência.

## Protótipos rejeitados

### B — remover rotas especializadas e embutir tudo

Rejeitado. Embutir Backtests, Jobs e IA dentro do Laboratório cria owners duplicados, aumenta payload/lifecycle e torna mobile pior. Também quebra deep links e automação sem benefício proporcional.

### C — apenas reordenar o menu

Rejeitado como solução principal. Trocar itens de lugar reduz, no máximo, um clique; não resolve a perda de contexto entre uma ação e sua execução/evidência.

## Contrato de navegação proposto

As rotas atuais permanecem estáveis. A evolução acontece por links contextuais com parâmetros somente quando existir contrato explícito e validado.

Fase inicial, sem novos parâmetros obrigatórios:

| Origem | Ação contextual | Destino |
| --- | --- | --- |
| Análises | Experimentar | `/lab` |
| Análises | Aplicar | `/#generate` |
| Laboratório | Testar historicamente | `/#backtests` |
| Laboratório/Backtests | Ver execução | `/jobs` ou deep link seguro de job |
| Gerador | Acompanhar lote salvo | `/#games` |
| Meus jogos | Ver compromisso temporal | `/agenda` |
| Evidência persistida | Interpretar com IA | `/ai` |

A introdução de query/hash state entre páginas só deve acontecer em uma fatia posterior que defina parser, validação, fallback e teste de deep link. Não usar parâmetros ad-hoc em múltiplos arquivos.

## Sequência de implementação

### Fatia 1 — links de jornada sem estado cruzado

- adicionar CTAs contextuais usando rotas existentes;
- nenhuma cópia de formulário/controller;
- testar links por desktop/mobile e teclado;
- medir se cada CTA nasce de uma tarefa real da superfície.

### Fatia 2 — `jobId` como retorno operacional

- definir contrato único para link de job;
- permitir `/jobs` focar uma execução específica sem perder listagem/refresh/cancelamento;
- adicionar `Ver execução` nas origens que já recebem `jobId`;
- preservar acesso direto a `/jobs`.

### Fatia 3 — proveniência entre experimento/evidência

- definir payload mínimo e validado de contexto, sem estado oculto em globals;
- ligar Laboratório ↔ Backtests/IA apenas onde os dados correspondentes já existem;
- mostrar origem na superfície de destino;
- manter recarga/deep link determinísticos.

### Fatia 4 — revisar navegação global com evidência de uso

Somente depois das fatias contextuais, avaliar se itens extras podem ser agrupados de forma melhor. Não remover rota funcional apenas porque um CTA contextual passou a existir.

## Critérios de aceitação para implementação

Uma fatia futura só deve ser considerada pronta quando:

- a tarefa pode ser concluída sem depender de memória do usuário sobre onde a execução/evidência foi parar;
- nenhuma feature mantém uma segunda implementação funcional de outra;
- abrir a URL diretamente continua funcionando;
- back/forward/reload preservam comportamento previsível;
- foco e teclado são testados;
- mobile não recebe uma versão apenas empilhada de um desktop maior;
- mensagens continuam anti-previsão e deixam `desconhecido` diferente de zero;
- IA permanece interpretativa;
- testes e `npm run check` passam;
- `docs/WEB.md` é atualizado quando a primeira mudança funcional entrar.

## Decisão

Adotar o **Protótipo A — contexto sem remoção de rotas** como direção da #64.

Ele reduz troca de contexto com links e proveniência, preserva owners/deep links e permite rollout vertical e reversível. O primeiro código deve ser uma fatia de links contextuais pequena; não uma reescrita do shell ou a fusão de Laboratório, Backtests, Jobs e IA.
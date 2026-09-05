# Próximos passos contextuais em Análises

Issue: #64

Status: concluída nesta fatia.

## Objetivo

Entregar a transição `Entender → Experimentar/Aplicar` definida pelo Protótipo A sem fundir superfícies nem criar estado cruzado.

## Comportamento

Quando a camada avançada de Análises está montada, a própria superfície passa a oferecer:

- `Experimentar no Laboratório` → `/lab`;
- `Gerar jogos` → `/#generate`.

Os links usam as rotas canônicas já existentes. Não existe prefill, query string, hash adicional, seleção automática de estratégia nem transporte de ranking histórico para o Gerador.

## Ownership e lifecycle

`web/src/features/analysisV2/journey.ts` possui somente a contextualização de jornada. O controller de Análises continua em `analysisV2.ts`; Laboratório e Gerador continuam donos de seus próprios formulários/regras.

Como o owner de Análises substitui o conteúdo após uma leitura assíncrona, a camada de jornada observa apenas `#content` enquanto `analysis` é a view corrente. O observer:

- monta a navegação quando `.a2-principle` existe;
- impede duplicação pelo ID estável `a2-journey-actions`;
- permanece capaz de remontar após refresh da análise;
- é desconectado ao sair da view via lifecycle compartilhado.

O conteúdo é criado com DOM APIs e `textContent`; não usa `innerHTML` nem dados externos.

## Fora de escopo

- remover rotas especializadas;
- copiar controller/formulário de Lab ou Gerador;
- introduzir proveniência via parâmetros ad-hoc;
- promover ranking passado como recomendação preditiva;
- alterar backend, score ou metodologia.

## Validação

`tests/analysisJourneyArchitecture.test.ts` protege rotas canônicas, ausência de estado cruzado, lifecycle/cleanup e construção segura do DOM. O browser E2E existente continua sendo o gate de integração para o asset publicado.

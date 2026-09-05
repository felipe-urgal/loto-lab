# Laboratório → Testes históricos sem estado cruzado

Issue: #64

Status: primeira fatia funcional da jornada aprovada em revisão.

## Objetivo

Implementar a menor parte funcional do Protótipo A: depois que o Laboratório possui resultados visíveis, oferecer `Testar historicamente` como próximo passo contextual.

## Contrato

- destino canônico: `/#backtests`;
- o link fica dentro de `#lab-results`, portanto aparece no contexto em que existe evidência a aprofundar;
- nenhum parâmetro/query/hash state adicional é criado nesta fatia;
- o Laboratório não copia nem pré-preenche formulário/controller de Backtests;
- Backtests continua sendo uma rota de primeira classe e pode ser aberta diretamente;
- nenhuma estratégia é promovida automaticamente a partir de ranking histórico.

## Acessibilidade e navegação

O CTA é um link nativo com texto explícito, portanto participa da ordem de foco por teclado sem JavaScript adicional. Back/forward e reload seguem os contratos atuais das duas rotas.

## Fora de escopo

- `jobId` como deep link operacional;
- proveniência serializada entre Laboratório e Backtests;
- interpretação contextual por IA;
- mudança na navegação global;
- duplicação de formulário ou estado oculto em globals.

## Validação

`tests/informationArchitectureJourney.test.ts` protege que o CTA permaneça no contexto de resultados, use a rota estável e não introduza query state ad-hoc. O gate canônico continua sendo `npm run check`; mudança de navegação também deve ser coberta pelo E2E de rotas críticas no CI.

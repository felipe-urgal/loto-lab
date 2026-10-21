# Design QA — Playground

final result: passed

## Referência e evidência

- Fonte escolhida: opção 2, Playground claro. Original: `/workspace/scratch/57a6026e5772/generated_images/exec-3094e8d4-6e1e-4dd6-93ae-5ebac5af5f8a.png`.
- Cópia para revisão: [referência](docs/design/evidence/playground-reference.jpg), 1487×1058 pixels.
- Implementação renderizada: [desktop](docs/design/evidence/playground-desktop.jpg), viewport de 1487×1058 CSS px, devicePixelRatio 1; iframe de verificação exibido a 0,86 e capturado em 1279×910 pixels.
- Normalização: ambos os lados foram reduzidos para a mesma largura de 744px, preservando a proporção. Captura contém somente o viewport do app, sem a área cinza externa do verificador.
- [Comparação completa](docs/design/evidence/comparison-final.jpg) e [comparação de controles, tipografia e jogos](docs/design/evidence/comparison-detail.jpg).
- Estado: Mega-Sena, Aleatório, dois jogos de seis dezenas, 07 e 18 fixadas, 31 excluída, personalização recolhida; geração efetiva com engine de produção. Números e concursos são dados ilustrativos determinísticos, não resultados oficiais atuais.
- [Celular](docs/design/evidence/playground-mobile-games.jpg): 390×844 CSS px, densidade 1, Lotofácil com 15 dezenas por jogo.
- [Tablet](docs/design/evidence/playground-tablet-final.jpg): 820×1180 CSS px, densidade 1, captura exibida a 0,75, personalização aberta.

## Histórico de comparação e correções

1. [Primeira comparação](docs/design/evidence/comparison-before.jpg): captura desktop de 1363×936, normalizada pela largura. A altura difere da referência e não foi usada para julgar o corte inferior. Encontrados P2 de espaço excessivo no topo, dezenas pequenas e auditoria ocupando a região entre jogos e concursos.
2. Corrigidos ritmo do topo, presença das dezenas e título; marca e ornamentos raster próprios substituem símbolos provisórios. Auditoria, referência histórica e seed ficaram na personalização. A sincronização passou a preservar os jogos exibidos.
3. Captura intermediária encontrou P2 de ilustração sobre status de sincronização. Cabeçalho agora possui ordem de empilhamento e fundo apropriados. Em tablet, a ilustração foi reposicionada e a personalização usa uma coluna para manter os alvos de toque.
4. Comparação final usa o mesmo viewport CSS da referência e o mesmo estado de seleção. Nenhum P0/P1/P2 visual pendente. O tablet confirmou dezenas com largura mínima de 62,18px e os três elementos do stepper com 44px; documento sem overflow horizontal.

## Superfícies verificadas

- **Fontes:** Bricolage Grotesque nos títulos e DM Sans nos controles, arquivos WOFF2 locais, pesos explícitos e fallback sans-serif. Hierarquia e quebra em duas linhas preservadas; texto funcional mínimo de 16px. A família e o desenho de alguns glifos são uma aproximação intencional da imagem gerada.
- **Espaçamento:** faixa horizontal no desktop, personalização recolhida, jogos em linhas e três resultados abaixo. Celular reorganiza controles em duas colunas e permite quebra de dezenas; tablet mantém alvos de toque. Sem controles ocultos por overflow.
- **Cores:** marfim #faf9f3, cobalto #4d41f8, lavanda #efedff, coral e lima. Fixadas recebem fundo e alfinete; exclusões são indicadas por texto e estado. Foco visível em cobalto.
- **Imagens:** marca, esfera 18 com fita coral e ornamento de pétalas são WebP com alpha real, sem aproximações em CSS/SVG. Arte corresponde à direção selecionada, com uma nova renderização do mesmo motivo. Ícones funcionais são Phosphor externos.
- **Conteúdo:** geração direta, cópia, personalização opcional e três concursos. Sem navbar/sidebar, login, salvamento ou preço. Estados de carregamento, vazio, falha recuperável e sucesso foram implementados; dados secundários e colunas mantidos.

## Interações e verificações

- Browser: escolher modalidade, abrir/recolher personalização, fixar 07 e 18, excluir 31, gerar dois jogos; ambos respeitam escolhas. Lotofácil gerou quatro jogos com 15 dezenas no celular.
- Sincronizar: status de andamento e conclusão conferidos; histórico continua com três concursos e jogos gerados permanecem idênticos e copiáveis.
- Cópia: formatação exata das dezenas e campos secundários coberta por testes; clique e confirmação visual conferidos. A leitura da área de transferência não retornou conteúdo no navegador de nuvem; conferir clipboard nativo em HTTPS/CI continua sendo uma limitação de verificação.
- Console: filtro por origem do app sem erros; ruído de extensão chrome-extension foi separado dos registros do aplicativo.
- Revisão independente corrigiu resposta antiga durante debounce, preservação dos jogos após sync, retomada via BFCache e normalização de hash legado. Harness executado confirmou rejeição de resposta antiga e preservação da saída.
- Gate com Node24.22: build, lint, formatação e sintaxe E2E aprovados. Suite: 436 passaram,25 ignorados,3 falharam pela mesma ausência de DATABASE_URL presente antes da alteração.
- E2E completo com PostgreSQL/Chrome não executado neste ambiente. O gate do CI agora verifica o fluxo direto em 1440×900,820×1180 e390×844, incluindo foco, tamanho dos controles e movimento reduzido.

## Checklist

- [x] Comparação completa e focada com a referência escolhida.
- [x] Fontes, espaçamento, cores, imagens e conteúdo revisados.
- [x] Geração real, seleções, três concursos e sincronização verificados no navegador com fixtures explícitas.
- [x] Ajustes de responsividade e revisão de código aplicados.
- [ ] PostgreSQL e E2E completo dependem do ambiente do CI.

P3 aceitos: tipografia e renderização da ilustração não são idênticas pixel a pixel à imagem; seletor de cardinalidade substitui o stepper do conceito para expor todos os tamanhos válidos. O rodapé histórico e os detalhes auditáveis complementam o conceito. Nenhuma dessas diferenças bloqueia uso ou encobre controles.

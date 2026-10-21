# Design do gerador — Playground

## Página única

A aplicação abre no gerador, sem login, navbar ou sidebar. Endereços antigos redirecionam para `/#generate`.

A experiência principal é escolher modalidade, modo, quantidade e dezenas por jogo → gerar → copiar. Não há opção de salvar, orçamento nem estimativa de custo na interface.

## Direção visual

Fundo marfim `#faf9f3`, texto escuro e cobalto `#4d41f8`, painéis lavanda e pequenos acentos coral e lima. Tipografia Bricolage Grotesque para títulos e DM Sans para controles, ambas hospedadas localmente. A marca e a ilustração orbital são WebP com transparência; ícones funcionais Phosphor são SVG externos. Licenças ficam em `web/vendor-licenses`.

O título “Bora criar combinações?” apresenta a página. Os controles principais formam uma faixa horizontal no desktop e uma grade no celular. A personalização começa recolhida. Jogos aparecem em linhas numeradas; dezenas fixadas manualmente recebem um alfinete e um nome acessível. A cópia inclui as dezenas geradas e os campos secundários da modalidade.

## Comportamento e dados

- O catálogo da API determina modalidades disponíveis e suas capabilities.
- Aleatório e Diversificado começam sem núcleo automático; as fixadas são exatamente as escolhas manuais. Experimental mantém sua metodologia própria explícita.
- Filtros e seleções alterados invalidam resultados anteriores; respostas antigas não sobrescrevem a configuração atual.
- Histórico, sementes, anti-leakage, campos estruturados e proveniência continuam sob responsabilidade das engines e da camada de aplicação.
- Os três concursos mais recentes são buscados com `limit=3&order=desc` por modalidade. Dupla Sena preserva os dois sorteios, Super Sete preserva colunas, e campos secundários não são descartados.
- A sincronização informa progresso, conflito, indisponibilidade e conclusão. Ao terminar, atualiza o histórico e o plano sem descartar escolhas manuais nem os jogos já gerados.
- Estados de carregamento, vazio, erro recuperável e sucesso são explícitos. Histórico indisponível não bloqueia o gerador.

## Acessibilidade e movimento

Controles de pelo menos 44px, texto funcional a partir de 16px, foco visível, labels e regiões de status. O link de pular conteúdo leva ao gerador pelo teclado. A animação decorativa de entrada termina em quatro segundos; `prefers-reduced-motion` desativa movimentos e transições. O layout acomoda dezenas e campos secundários sem esconder controles.

## Gate final de qualidade

`npm run check` verifica contratos, formatação, tipos, build e testes de domínio/API/UI. `npm run test:e2e:redesign` verifica a geração direta em desktop 1440×900, tablet 820×1180 e mobile 390×844: seleções, cardinalidade, três concursos, controles, overflow, foco, movimento reduzido e feedback assíncrono. Requer PostgreSQL migrado, dados de teste e Chrome no ambiente de CI.

APIs e engines fora da interface mantêm seus contratos e testes. Remover o salvamento da página não apaga jogos já existentes nem remove APIs internas de persistência.

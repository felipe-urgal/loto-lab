# Performance

## Frontend

O build web é feito por `npm run web:build` sem adicionar dependências de runtime ou bundlers. Ele:

- copia os assets para `web-dist`;
- calcula uma versão SHA-256 do conjunto web;
- adiciona `?v=<hash>` nos assets referenciados pelo HTML;
- permite `Cache-Control: public, max-age=31536000, immutable` para URLs versionadas;
- mantém HTML com `no-cache`;
- carrega refinamentos e funcionalidades secundárias sob demanda por view.

A navegação e os ícones ficam centralizados em `web/shell.js`. A home carrega apenas o shell, o core `app.js` e o loader; CSS/JS de status, geração e gestão de jogos são carregados quando necessários.

## CPU / análises pesadas

Backtests HTTP e comparações do Laboratório executam o cálculo CPU-bound em `worker_threads` (`src/api/analysisWorker.ts`). A thread principal continua responsável por HTTP, validação, leitura e persistência PostgreSQL.

O `expensiveAnalysisGate` continua limitando a uma análise pesada por processo para controlar CPU e memória.

## PostgreSQL

Use:

```bash
npm run db:profile -- mega-sena
npm run db:profile -- lotofacil
npm run db:profile -- dia-de-sorte
```

O comando executa `EXPLAIN (ANALYZE, BUFFERS)` nos hot paths de concurso mais recente, lotes ativos, backtests e apostas reais. Novos índices devem ser adicionados somente quando o plano real mostrar ganho esperado.

## Metas de experiência

Para medições no navegador, use como guardrails no percentil 75:

- LCP <= 2,5 s;
- INP <= 200 ms;
- CLS <= 0,1.

Além dos números, valide teclado, foco visível, `prefers-reduced-motion`, desktop, tablet e mobile.

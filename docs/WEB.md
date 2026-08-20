# Interface Web

A interface web do Loto Lab é servida pelo mesmo processo da API HTTP.

## Objetivo

Transformar o motor já validado em uma aplicação operacional sem duplicar regra de negócio no navegador.

O frontend:

- consulta concursos e análises pela API `/api/v1`;
- envia configurações para o gerador;
- exibe e confere lotes persistidos;
- executa e consulta backtests;
- nunca recalcula score, prêmio, ROI ou regras de geração por conta própria.

## Execução local

Suba o PostgreSQL:

```bash
docker compose up -d postgres
```

Configure a conexão:

```bash
export DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5433/loto_lab
```

Aplique migrations e, se necessário, sincronize concursos:

```bash
npm run db:migrate
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

Inicie a aplicação:

```bash
npm run api:start
```

Abra:

```text
http://127.0.0.1:3000
```

A API continua disponível no mesmo processo em `/api/v1`.

## Telas

### Dashboard

- último concurso das três loterias;
- próximo número de concurso alvo estimado pelo histórico armazenado;
- atalho para gerar jogos;
- resumo do backtest mais recente da loteria selecionada;
- últimos lotes salvos.

### Análises

- concurso de referência;
- grupos `strong`, `balanced` e `cold`;
- ranking por score;
- componentes de ano, mês, últimos 10, últimos 20 e histórico.

### Gerar jogos

- loteria selecionada globalmente;
- quantidade de jogos;
- núcleo de 8, 9 ou 10 fixas para Lotofácil;
- concurso alvo opcional;
- persistência do lote habilitada por padrão;
- fixas destacadas visualmente nos jogos gerados.

A geração continua aplicando anti-leakage quando um concurso alvo é informado.

### Meus jogos

- lotes persistidos;
- data, concurso alvo e quantidade de jogos;
- núcleo fixo destacado;
- Mês da Sorte quando aplicável;
- conferência do lote contra um concurso armazenado;
- custo, prêmio conhecido, resultado líquido e melhor pontuação.

### Backtests

- quantidade de jogos por concurso;
- aquecimento;
- núcleo configurável da Lotofácil;
- intervalo opcional de concursos;
- persistência da execução;
- ROI, custo, prêmios e cobertura financeira;
- histórico das execuções persistidas.

## Arquitetura

A interface não adiciona framework ou nova cadeia de build neste milestone.

Arquivos estáticos:

```text
web/
├── index.html
├── styles.css
├── app.js
└── favicon.svg
```

Servidor:

- `src/api/web.ts`: resolve apenas assets conhecidos e define MIME/cache;
- `src/api/server.ts`: combina assets web com o handler da API;
- `src/cli/apiStart.ts`: inicia um único processo HTTP.

Essa decisão mantém o milestone pequeno e permite validar navegação, densidade e fluxos antes de adotar um framework de frontend. Uma migração futura para React/Vue/Vite pode reutilizar a mesma API sem mover regra de negócio.

## Design system

Direção visual:

- tema escuro de baixa distração;
- verde como cor de ação e destaque do núcleo fixo;
- painéis com borda discreta em vez de excesso de cards decorativos;
- tipografia de sistema para não depender de CDN;
- navegação lateral no desktop;
- navegação compacta no tablet;
- barra inferior no mobile;
- tabelas preservadas para dados densos;
- bolas numéricas somente quando ajudam a leitura do jogo/análise.

## Testes

`tests/web.test.ts` verifica que o mesmo processo serve:

- o shell HTML;
- JavaScript da aplicação;
- CSS;
- referências aos endpoints principais.

Os testes existentes continuam cobrindo a API e PostgreSQL separadamente.

## Limitações atuais

- sem autenticação/usuários;
- sem atualização em tempo real;
- sem gráficos de séries temporais avançados;
- backtests continuam síncronos;
- sem camada de interpretação por IA;
- sem bundle/minificação de assets.

Esses itens ficam para milestones posteriores depois de validarmos o fluxo principal da aplicação.

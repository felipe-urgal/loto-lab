# Operação da base histórica

Este documento descreve como preparar e manter os concursos usados por análise, geração e backtests do Loto Lab.

## Princípio

O Dashboard pode funcionar com apenas o concurso mais recente, mas análises e backtests precisam de histórico suficiente. O comando `db:bootstrap` existe para transformar uma instalação vazia ou parcial em uma base histórica contínua.

## Configuração local

Crie o arquivo local `.env` uma vez:

```bash
cp .env.example .env
```

O arquivo já usa o PostgreSQL do Docker Compose na porta 5433:

```text
DATABASE_URL=postgresql://loto_lab:loto_lab@localhost:5433/loto_lab
```

`.env` é ignorado pelo Git e não deve ser versionado.

Os comandos operacionais carregam `.env` automaticamente por meio do Node.js. Não é necessário executar `export DATABASE_URL=...` em cada terminal.

> O comando `npm test` não carrega `.env` automaticamente. Isso é intencional: os testes de integração podem limpar tabelas e não devem apontar implicitamente para o banco de desenvolvimento.

## Primeira carga completa

Suba o PostgreSQL e aplique migrations:

```bash
docker compose up -d postgres
npm run db:migrate
```

Baixe o histórico das três loterias:

```bash
npm run db:bootstrap
```

Também é possível executar uma loteria por vez:

```bash
npm run db:bootstrap -- mega-sena
npm run db:bootstrap -- lotofacil
npm run db:bootstrap -- dia-de-sorte
```

## Como o bootstrap funciona

Para cada loteria o processo:

1. consulta o concurso oficial mais recente na CAIXA;
2. lê somente os números de concurso já existentes no PostgreSQL;
3. calcula as lacunas entre o concurso 1 e o concurso oficial mais recente;
4. busca somente os concursos faltantes;
5. usa até 4 requisições simultâneas;
6. tenta novamente falhas temporárias com espera exponencial;
7. grava cada pequeno grupo concluído imediatamente;
8. continua processando os demais concursos quando um item específico falha;
9. informa no final os concursos que não puderam ser obtidos.

Por isso o processo é idempotente e retomável.

Se a conexão cair no meio de milhares de concursos, execute novamente:

```bash
npm run db:bootstrap
```

Os concursos já persistidos são pulados e somente as lacunas restantes são solicitadas.

## Progresso

Durante a carga é exibido algo semelhante a:

```text
mega-sena: 840/3047 (28%) | baixados 839 | falhas 1
```

Uma falha individual é tentada novamente automaticamente. Se ainda houver falhas ao final, o comando termina com código de erro e lista os números problemáticos. Uma nova execução tenta apenas o que continua faltando.

## Status da base

Use:

```bash
npm run db:status
```

A saída informa para cada loteria:

- quantidade de concursos armazenados;
- primeiro e último concurso armazenados;
- quantidade de lacunas até o último concurso armazenado;
- quantidade de concursos com rateio financeiro;
- cobertura financeira percentual;
- data/hora da última atualização de algum concurso.

O Dashboard consulta os mesmos dados em:

```http
GET /api/v1/data/status
```

Quando existem lacunas, o indicador da loteria fica em estado de atenção.

## Sincronização diária

Depois do bootstrap inicial, `db:sync` continua útil para buscar apenas o resultado mais recente:

```bash
npm run db:sync -- mega-sena
npm run db:sync -- lotofacil
npm run db:sync -- dia-de-sorte
```

Se houver suspeita de lacunas ou uma execução tiver sido interrompida, prefira `db:bootstrap`.

## Dados financeiros

O adapter da CAIXA persiste, quando disponíveis:

- arrecadação;
- faixas de prêmio;
- quantidade de ganhadores;
- valor individual de cada faixa;
- Mês da Sorte para Dia de Sorte.

A cobertura financeira mostrada no status representa a proporção dos concursos armazenados que possuem ao menos uma faixa de rateio persistida.

## Segurança operacional

- `.env` nunca deve ser commitado;
- o bootstrap nunca remove concursos existentes;
- upserts incompletos não apagam rateios financeiros já conhecidos;
- reexecutar bootstrap é seguro;
- o histórico é usado pelo backtest com a regra anti-leakage já existente: o concurso alvo nunca entra nos dados usados para gerar seus próprios jogos.

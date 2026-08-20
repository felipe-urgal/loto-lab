# IA interpretativa

A camada de IA do Loto Lab segue a regra central do projeto:

> Algoritmo calcula; IA interpreta.

A IA não participa da geração de dezenas, não altera scores, não calcula ROI e não muda a metodologia. Ela recebe um snapshot compacto de fatos já produzidos pelo core e transforma esses fatos em uma leitura textual auditável.

## Configuração

No `.env`:

```env
OPENAI_API_KEY=sua-chave
OPENAI_MODEL=gpt-5.6-luna
```

`OPENAI_MODEL` é opcional. O padrão do projeto é `gpt-5.6-luna` e pode ser trocado sem alteração de código.

A chave existe somente no backend. Nenhum asset web contém ou recebe `OPENAI_API_KEY`.

## API usada

A integração usa a OpenAI Responses API (`POST /v1/responses`) por HTTP usando o `fetch` nativo do Node. Não há dependência adicional de SDK.

## Evidências enviadas

O contexto é deliberadamente limitado e contém:

- último concurso de referência (número e data);
- pesos atuais do score;
- Top 5 e Bottom 5 do ranking calculado;
- último backtest persistido, quando existir;
- comparação do Laboratório sobre uma janela recente de até 100 concursos;
- resumo financeiro das apostas reais;
- até 5 apostas reais recentes.

O histórico completo de concursos e todos os jogos gerados não são enviados ao modelo.

## Focos

A interface oferece quatro leituras:

- `overview`: visão geral das evidências;
- `analysis`: interpretação do ranking e horizontes do score;
- `strategy`: backtests e comparação de estratégias;
- `real-performance`: desempenho das apostas efetivamente registradas.

## Contrato de saída

A resposta precisa ser JSON válido com:

```json
{
  "headline": "...",
  "summary": "...",
  "observations": ["..."],
  "risks": ["..."],
  "nextTests": ["..."]
}
```

Respostas fora do contrato são rejeitadas e não são persistidas.

`nextTests` deve conter somente experimentos, validações de dados ou comparações metodológicas. A IA é instruída a nunca sugerir dezenas ou jogos.

## Auditoria

Cada interpretação bem-sucedida é persistida em `ai_insights` com:

- loteria;
- foco;
- modelo;
- ID de resposta do provedor, quando disponível;
- snapshot completo das evidências enviadas;
- conteúdo interpretativo;
- uso retornado pelo provedor, quando disponível;
- timestamp.

Isso permite reconstruir exatamente quais fatos deram origem a uma interpretação mesmo que a base ou metodologia mude no futuro.

## Endpoints

### Status

```http
GET /api/v1/ai/status
```

Retorna se a integração está configurada e qual modelo será usado. Nunca retorna a chave.

### Gerar interpretação

```http
POST /api/v1/ai/insights
Content-Type: application/json

{
  "lottery": "mega-sena",
  "focus": "overview"
}
```

### Histórico

```http
GET /api/v1/ai/insights/mega-sena?limit=10
```

## Interface

Com a API rodando:

```text
http://127.0.0.1:3000/ai
```

Sem `OPENAI_API_KEY`, a tela continua acessível, mostra o estado `não configurada` e desabilita somente a geração de novas interpretações.

## Limites metodológicos

A camada é explicitamente instruída a:

- não recalcular números;
- não preencher métricas ausentes;
- não interpretar frequência como aumento de probabilidade;
- não sugerir dezenas;
- não confundir backtest com aposta real;
- destacar amostra pequena, baixa cobertura financeira e risco de sobreajuste;
- tratar sugestões apenas como próximos testes da metodologia.

A interpretação não é previsão de sorteio nem aconselhamento para apostar.

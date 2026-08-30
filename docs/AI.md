# IA interpretativa

A camada de IA segue a regra central:

> **Algoritmo calcula; IA interpreta.**

Ela não gera dezenas, não altera pontuação, não calcula ROI e não muda metodologia. Recebe um snapshot compacto de fatos já produzidos pelo sistema e devolve interpretação estruturada/auditável.

## Configuração

```env
OPENAI_API_KEY=sua-chave
OPENAI_MODEL=gpt-5.6-luna
```

`OPENAI_MODEL` é opcional. A chave existe somente no backend e nunca é enviada aos assets web.

## Integração

O adapter usa a OpenAI Responses API por HTTP com `fetch` nativo do Node e `store: false`. A resposta usa Structured Outputs/JSON Schema estrito e ainda passa por validação defensiva local.

## Evidências enviadas

`buildAiEvidenceContext()` monta um snapshot com, quando disponível:

- último concurso de referência;
- pesos atuais e contagem dos grupos do score;
- Top 5 e Bottom 5 da classificação calculada;
- último teste histórico persistido;
- **último job `strategy-lab` concluído e persistido**, com variante vencedora, evidência, p-values ajustados, percentil, resolução/amostra e variantes;
- resumo financeiro das apostas reais;
- até 5 apostas reais recentes.

O histórico completo de concursos, prompts internos e todos os jogos gerados não são enviados ao modelo.

## Focos

- `overview` — visão geral das evidências;
- `analysis` — leitura da classificação e horizontes;
- `strategy` — testes históricos/Laboratório;
- `real-performance` — apostas efetivamente registradas.

## Contrato de saída

```json
{
  "headline": "...",
  "summary": "...",
  "observations": ["..."],
  "risks": ["..."],
  "nextTests": ["..."]
}
```

Respostas fora do contrato são rejeitadas. `nextTests` pode sugerir experimentos, validações de dados ou comparações metodológicas; nunca dezenas/jogos.

## Persistência e auditabilidade

Cada interpretação bem-sucedida é persistida em `ai_insights` com:

- loteria e foco;
- modelo/provedor;
- ID da resposta quando disponível;
- snapshot das evidências enviadas;
- conteúdo interpretativo;
- uso retornado pelo provedor quando disponível;
- timestamp.

O objetivo é permitir reconstruir quais fatos originaram uma interpretação mesmo depois que histórico/metodologia evoluírem.

## API

```http
GET  /api/v1/ai/status
POST /api/v1/ai/insights
GET  /api/v1/ai/insights/mega-sena?limit=10
```

Exemplo de criação:

```json
{
  "lottery": "mega-sena",
  "focus": "overview"
}
```

## Interface

```text
http://127.0.0.1:5200/ai
```

Sem `OPENAI_API_KEY`, a tela permanece funcional para status/histórico e desabilita apenas a geração de novas interpretações.

O workspace visual segue o Protótipo 1. `ai-workspace.css` é a folha específica canônica desde #134; o antigo `ai.css` foi removido.

## Limites metodológicos

A IA deve:

- não recalcular métricas;
- não preencher dado ausente;
- não interpretar frequência/atraso como aumento de probabilidade;
- não sugerir dezenas;
- não confundir teste histórico com aposta real;
- destacar baixa amostra, baixa cobertura financeira e risco de overfitting;
- tratar sugestões como próximos testes da metodologia.

A interpretação não é previsão de sorteio nem aconselhamento para apostar.

Veja também [`RELIABILITY.md`](RELIABILITY.md) e [`STRATEGY_LAB.md`](STRATEGY_LAB.md).
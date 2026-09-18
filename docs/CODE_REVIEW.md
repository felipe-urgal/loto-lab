# Guia de Code Review

O review prioriza correção, segurança, validade metodológica, clareza, testabilidade e simplicidade.

## Regra principal

KISS prevalece sobre aplicação mecânica de SOLID. Abstrações devem resolver um problema concreto.

## S — Single Responsibility

Procure módulos que misturem cálculo, persistência, transporte e apresentação. Pergunta: "Essa responsabilidade tem um owner claro?"

## O — Open/Closed

Observe condicionais que crescem a cada loteria, estratégia ou provider. Só introduza estratégia/registry quando a variação for recorrente.

## L — Liskov Substitution

Implementações de contratos comuns devem manter expectativas compatíveis e não exigir exceções especiais.

## I — Interface Segregation

Evite contratos grandes quando o consumidor utiliza apenas parte dos dados.

## D — Dependency Inversion

Isole PostgreSQL, CAIXA, OpenAI e outros providers quando isso proteger o domínio. Não crie adapters sem benefício real.

## Checklist

- [ ] Resolve exatamente o problema proposto.
- [ ] Preserva anti-leakage e reprodutibilidade.
- [ ] Não confunde desconhecido com zero.
- [ ] Preserva comportamento fora do escopo.
- [ ] Trata erros e regressões relevantes.
- [ ] Evita abstração prematura.
- [ ] Testes cobrem comportamento e metodologia relevantes.
- [ ] Segurança, persistência e performance foram consideradas.
- [ ] O diff final foi revisado.

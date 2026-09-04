# Testes e coverage

O Loto Lab usa testes para proteger comportamento e invariantes do produto. Coverage continua disponível como diagnóstico, mas não é um objetivo percentual nem um gate por si só.

A receita operacional antes do PR está em [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Comandos

```bash
npm test
```

Executa o build e a suíte funcional sem instrumentação de coverage.

```bash
npm run coverage
```

Executa o build e gera o relatório de coverage sob demanda. O relatório não aplica thresholds globais obrigatórios.

```bash
npm run check
```

Executa checks estáticos, build e testes funcionais. Coverage não faz parte do gate normal.

## Separação de responsabilidades

- `npm run lint` inclui `platform:verify` e os checks TypeScript estritos;
- `npm run typecheck` permanece disponível isoladamente sem repetir a compilação no gate agregado;
- `npm test` executa comportamento, sem misturar validação textual de plataforma;
- `npm run coverage` ajuda a encontrar áreas pouco exercitadas, sem incentivar testes artificiais para defender porcentagem.

## Critério para novos testes

Priorize:

- regras de domínio e cálculos;
- persistência e contratos de dados;
- APIs e fluxos operacionais;
- segurança e validação de entradas;
- regressões reproduzíveis;
- comportamento crítico da interface.

Evite testes que apenas espelham implementação, configuração ou markup sem proteger contrato material.

## E2E

Quando o risco justificar navegador real:

```bash
E2E_BASE_URL=http://127.0.0.1:5200 npm run test:e2e
```

O nome canônico segue o padrão `test:*`. O antigo alias `e2e:browser` não faz parte da interface pública atual.

## Checks direcionados

E2E, coverage, smoke/preflight de produção, auditoria de dependências, CodeQL/Trivy/SBOM e verificações operacionais continuam relevantes quando o risco da mudança justificar ou em seus workflows específicos.

O workflow de Security atual é semanal/manual, não um gate automático de todo PR.

Uma falha real deve ser investigada e corrigida; não remova teste válido nem afrouxe assertion correta apenas para obter CI verde.

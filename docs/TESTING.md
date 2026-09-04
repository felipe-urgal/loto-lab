# Testes e coverage

O Loto Lab usa testes para proteger comportamento e invariantes do produto. Coverage continua disponível como diagnóstico, mas não é um objetivo percentual nem um gate por si só.

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

Executa os checks estáticos, build e testes funcionais. Coverage não faz parte do gate normal.

## Separação de responsabilidades

- `npm run lint` inclui `platform:verify`, porque a baseline de Node/CI/Docker/segurança é um guard estático;
- `npm test` executa comportamento, sem misturar validação textual de plataforma;
- `npm run coverage` ajuda a encontrar áreas pouco exercitadas, sem incentivar testes artificiais para defender uma porcentagem.

## Critério para novos testes

Priorize:

- regras de domínio e cálculos;
- persistência e contratos de dados;
- APIs e fluxos operacionais;
- segurança e validação de entradas;
- regressões reproduzíveis;
- comportamento crítico da interface.

Evite testes que apenas espelham implementação, configuração ou markup sem proteger contrato material.

## Checks direcionados

E2E em navegador, smoke de produção, auditoria de dependências, CodeQL/Trivy/SBOM e verificações operacionais continuam relevantes quando o risco da mudança justificar ou nos workflows agendados/manuais já existentes. Eles não precisam ser custo fixo de cada PR.

Uma falha real deve ser investigada e corrigida; não remova teste válido nem afrouxe assertion correta apenas para obter CI verde.

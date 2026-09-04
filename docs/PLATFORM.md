# Platform baseline

A baseline operacional do Loto Lab mantém runtime, tipos, compilador, CI e imagens de produção explicitamente alinhados.

## Versões alinhadas

| Componente | Baseline | Política |
| --- | --- | --- |
| Node.js | `24.19.0` | versão exata em desenvolvimento, CI e Docker |
| `@types/node` | `24.x` | mesma major do runtime Node |
| TypeScript | `7.x` | toolchain independente; major controlada por PR dedicado |

Arquivos autoritativos da baseline:

- `.nvmrc` e `.node-version` para o runtime local;
- `package.json` para `engines`, `@types/node` e TypeScript;
- `package-lock.json` para a resolução reproduzível das dependências;
- `.github/workflows/ci.yml` para o runtime do CI;
- `Dockerfile` para build e runtime de produção.

O TypeScript foi migrado para a linha 7.x em PR dedicado e permanece desacoplado da major do Node. O fato de ambos possuírem números de versão diferentes não representa drift de plataforma.

## Verificação automática

O gate canônico é:

```bash
npm run check
```

Dentro dele, `quality:static` executa `lint`; `lint`, por sua vez, começa por:

```bash
npm run platform:verify
```

O guard falha antes dos checks TypeScript se detectar divergência entre:

- `.nvmrc` e `.node-version`;
- versão exata do Node e `engines.node`;
- major do Node e `@types/node`;
- `package.json` e `package-lock.json` para TypeScript e `@types/node`;
- Node configurado no CI;
- presença de `npm run check` como gate canônico do workflow funcional;
- baseline do workflow de Security;
- imagens Node usadas pelo Dockerfile;
- baseline documentada neste arquivo e requisito de Node no README.

`npm test` permanece focado em build + comportamento funcional e não repete a verificação de plataforma.

A intenção é transformar a baseline em contrato verificável, evitando que uma atualização de toolchain deixe runtime, documentação ou produção silenciosamente desalinhados.

## Política de atualização

Atualizações patch/minor dentro da linha Node 24 podem ser tratadas pelo Dependabot, desde que todas as referências exatas sejam atualizadas juntas e o gate aplicável fique verde.

Mudanças para uma nova major de Node devem ser coordenadas entre CI, Docker, `engines`, `.nvmrc`, `.node-version`, `@types/node`, documentação e o guard de plataforma.

O TypeScript é tratado como toolchain independente do runtime Node. Mudanças major do compilador devem passar por PR dedicado, atualizar esta baseline quando necessário e executar o pipeline completo antes do merge.

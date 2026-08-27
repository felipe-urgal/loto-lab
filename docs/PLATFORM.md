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

`npm test` executa primeiro:

```bash
npm run platform:verify
```

O guard falha antes da compilação se detectar divergência entre:

- `.nvmrc` e `.node-version`;
- versão exata do Node e `engines.node`;
- major do Node e `@types/node`;
- `package.json` e `package-lock.json` para TypeScript e `@types/node`;
- Node configurado no CI;
- imagens Node usadas pelo Dockerfile;
- baseline documentada neste arquivo e requisito de Node no README.

A intenção é transformar a baseline em contrato verificável, evitando que uma atualização de toolchain deixe runtime, documentação ou produção silenciosamente desalinhados.

## Política de atualização

Atualizações patch/minor dentro da linha Node 24 podem ser tratadas pelo Dependabot, desde que todas as referências exatas sejam atualizadas juntas e o pipeline completo fique verde.

Mudanças para uma nova major de Node devem ser coordenadas entre CI, Docker, `engines`, `.nvmrc`, `.node-version`, `@types/node`, documentação e o guard de plataforma.

O TypeScript é tratado como toolchain independente do runtime Node. Mudanças major do compilador devem passar por PR dedicado, atualizar esta baseline quando necessário e executar o pipeline completo antes do merge.

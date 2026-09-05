#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [packageSource, composeSource] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../docker-compose.prod.yml', import.meta.url), 'utf8'),
]);

const packageJson = JSON.parse(packageSource);
const scripts = packageJson.scripts ?? {};
const prodConfig = scripts['prod:config'];
const prodConfigCheck = scripts['prod:config:check'];
const prodCheck = scripts['prod:check'];
const prodBackup = scripts['prod:backup'];
const prodDeploy = scripts['prod:deploy'];
const prodVerify = scripts['prod:verify'];
const prodRestoreCheck = scripts['prod:restore-check'];

function extractComposeService(source, serviceName) {
  const lines = source.split(/\r?\n/);
  const serviceHeader = `  ${serviceName}:`;
  const start = lines.findIndex((line) => line === serviceHeader);

  assert.notEqual(start, -1, `docker-compose.prod.yml precisa declarar o serviço ${serviceName}`);

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  [A-Za-z0-9_.-]+:\s*$/.test(line) || (/^[^\s]/.test(line) && line.trim() !== '')) {
      end = index;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function assertBoundedLocalLogging(serviceSource, serviceName) {
  assert.match(
    serviceSource,
    /^    logging:\s*$/m,
    `${serviceName} precisa declarar política explícita de retenção de logs`,
  );
  assert.match(
    serviceSource,
    /^      driver: local\s*$/m,
    `${serviceName} deve usar o driver local com rotação nativa`,
  );
  assert.match(
    serviceSource,
    /^        max-size: ["']?10m["']?\s*$/m,
    `${serviceName} deve limitar cada arquivo de log a 10 MB`,
  );
  assert.match(
    serviceSource,
    /^        max-file: ["']?5["']?\s*$/m,
    `${serviceName} deve manter no máximo cinco arquivos de log`,
  );
}

const expectedProdConfig =
  'docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet';
const expectedProdConfigCheck =
  'docker compose --env-file .env.production.example -f docker-compose.prod.yml config --quiet';
const expectedProdCheck =
  'npm run prod:config:check && npm run quality:static && npm run build:prod';
const expectedProdBackup =
  'node --env-file-if-exists=.env.production scripts/backupPostgres.mjs';
const expectedProdDeploy =
  'docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build --wait --wait-timeout 120';
const expectedProdRestoreCheck =
  'node --env-file-if-exists=.env.production scripts/verifyBackup.mjs';

assert.equal(
  prodConfig,
  expectedProdConfig,
  'prod:config deve validar a configuração real silenciosamente',
);
assert.equal(
  prodConfigCheck,
  expectedProdConfigCheck,
  'prod:config:check deve validar somente o exemplo versionado e seguro',
);
assert.equal(
  prodCheck,
  expectedProdCheck,
  'prod:check deve usar somente a configuração segura antes dos gates estáticos e build',
);
assert.ok(
  !prodCheck.includes('prod:config &&'),
  'prod:check não pode voltar a carregar .env.production real',
);

assert.equal(prodBackup, expectedProdBackup, 'prod:backup deve ser a operação canônica de backup');
assert.equal(prodDeploy, expectedProdDeploy, 'prod:deploy deve executar diretamente o deploy canônico');
assert.equal(
  prodRestoreCheck,
  expectedProdRestoreCheck,
  'prod:restore-check deve ser a operação canônica de validação de restore',
);
assert.equal(scripts['prod:up'], undefined, 'prod:up não deve duplicar prod:deploy');
assert.equal(scripts['ops:backup'], undefined, 'ops:backup não deve duplicar prod:backup');
assert.equal(
  scripts['ops:restore-check'],
  undefined,
  'ops:restore-check não deve duplicar prod:restore-check',
);

assert.match(prodDeploy, /\bup\s+-d\s+--build\b/, 'prod:deploy deve reconstruir e subir a stack em background');
assert.match(prodDeploy, /(?:^|\s)--wait(?:\s|$)/, 'prod:deploy precisa aguardar os healthchecks do Compose');
assert.match(
  prodDeploy,
  /(?:^|\s)--wait-timeout\s+\d+(?:\s|$)/,
  'prod:deploy precisa usar timeout bounded ao aguardar healthchecks',
);

const postgresService = extractComposeService(composeSource, 'postgres');
const appService = extractComposeService(composeSource, 'app');

assert.match(postgresService, /^    healthcheck:\s*$/m, 'PostgreSQL precisa manter healthcheck no compose de produção');
assert.match(appService, /^    healthcheck:\s*$/m, 'Aplicação precisa manter healthcheck no compose de produção');
assert.match(appService, /\/health\/ready/, 'Healthcheck da aplicação precisa usar o readiness canônico');
assertBoundedLocalLogging(postgresService, 'PostgreSQL');
assertBoundedLocalLogging(appService, 'Aplicação');

const expectedProdVerify =
  'docker compose --env-file .env.production -f docker-compose.prod.yml exec -T app node -e "fetch(\'http://127.0.0.1:3000/health/ready\',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"';

assert.equal(
  prodVerify,
  expectedProdVerify,
  'prod:verify deve permanecer no comando read-only allowlisted de readiness',
);

console.log(
  'Contrato de produção validado: check usa configuração segura, comandos canônicos não possuem aliases duplicados, deploy aguarda healthchecks, logs possuem retenção bounded e verify permanece somente leitura.',
);

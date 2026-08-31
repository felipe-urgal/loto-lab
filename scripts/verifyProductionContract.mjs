#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [packageSource, composeSource] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../docker-compose.prod.yml', import.meta.url), 'utf8'),
]);

const packageJson = JSON.parse(packageSource);
const scripts = packageJson.scripts ?? {};
const prodUp = scripts['prod:up'];
const prodDeploy = scripts['prod:deploy'];
const prodVerify = scripts['prod:verify'];

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

assert.equal(typeof prodUp, 'string', 'package.json precisa declarar prod:up');
assert.equal(prodDeploy, 'npm run prod:up', 'prod:deploy deve continuar delegando para prod:up');
assert.equal(typeof prodVerify, 'string', 'package.json precisa declarar prod:verify');
assert.match(prodUp, /\bup\s+-d\s+--build\b/, 'prod:up deve reconstruir e subir a stack em background');
assert.match(prodUp, /(?:^|\s)--wait(?:\s|$)/, 'prod:up precisa aguardar os healthchecks do Compose');
assert.match(prodUp, /(?:^|\s)--wait-timeout\s+\d+(?:\s|$)/, 'prod:up precisa usar timeout bounded ao aguardar healthchecks');

const postgresService = extractComposeService(composeSource, 'postgres');
const appService = extractComposeService(composeSource, 'app');

assert.match(postgresService, /^    healthcheck:\s*$/m, 'PostgreSQL precisa manter healthcheck no compose de produção');
assert.match(appService, /^    healthcheck:\s*$/m, 'Aplicação precisa manter healthcheck no compose de produção');
assert.match(appService, /\/health\/ready/, 'Healthcheck da aplicação precisa usar o readiness canônico');

const expectedProdVerify =
  'docker compose --env-file .env.production -f docker-compose.prod.yml exec -T app node -e "fetch(\'http://127.0.0.1:3000/health/ready\',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"';

assert.equal(
  prodVerify,
  expectedProdVerify,
  'prod:verify deve permanecer no comando read-only allowlisted de readiness',
);

console.log('Contrato de produção validado: deploy aguarda healthchecks e verify permanece somente leitura.');

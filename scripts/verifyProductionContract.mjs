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

assert.equal(typeof prodUp, 'string', 'package.json precisa declarar prod:up');
assert.equal(prodDeploy, 'npm run prod:up', 'prod:deploy deve continuar delegando para prod:up');
assert.equal(typeof prodVerify, 'string', 'package.json precisa declarar prod:verify');
assert.match(prodUp, /\bup\s+-d\s+--build\b/, 'prod:up deve reconstruir e subir a stack em background');
assert.match(prodUp, /(?:^|\s)--wait(?:\s|$)/, 'prod:up precisa aguardar os healthchecks do Compose');
assert.match(prodUp, /(?:^|\s)--wait-timeout\s+\d+(?:\s|$)/, 'prod:up precisa usar timeout bounded ao aguardar healthchecks');
assert.match(composeSource, /postgres:[\s\S]*?healthcheck:/, 'PostgreSQL precisa manter healthcheck no compose de produção');
assert.match(composeSource, /app:[\s\S]*?healthcheck:/, 'Aplicação precisa manter healthcheck no compose de produção');
assert.match(composeSource, /\/health\/ready/, 'Healthcheck da aplicação precisa usar o readiness canônico');
assert.doesNotMatch(prodVerify, /\b(up|restart|down|stop)\b/, 'prod:verify deve permanecer somente leitura');

console.log('Contrato de produção validado: deploy aguarda healthchecks e verify permanece somente leitura.');

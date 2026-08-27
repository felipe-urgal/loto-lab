import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const textExtensions = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sh',
  '.sql',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);

const textNames = new Set([
  '.dockerignore',
  '.env.example',
  '.env.production.example',
  '.gitignore',
  '.node-version',
  '.nvmrc',
  'Dockerfile',
]);

const failures = [];
let inspectedFiles = 0;

for (const file of trackedFiles) {
  if (!textNames.has(file) && !textExtensions.has(extname(file))) {
    continue;
  }

  if (!existsSync(file) || !statSync(file).isFile()) {
    continue;
  }

  inspectedFiles += 1;
  const content = readFileSync(file, 'utf8');

  if (content.startsWith('\uFEFF')) {
    failures.push(`${file}: BOM UTF-8 não permitido`);
  }

  if (content.includes('\r')) {
    failures.push(`${file}: use LF em vez de CRLF/CR`);
  }

  const lines = content.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (/[ \t]+$/.test(lines[index])) {
      failures.push(`${file}:${index + 1}: whitespace no fim da linha`);
    }
  }
}

if (failures.length > 0) {
  console.error('Repository text format violations:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Repository text format OK: ${inspectedFiles} text files inspected`);

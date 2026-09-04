import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const readText = (path) => readFile(join(root, path), "utf8");
const readJson = async (path) => JSON.parse(await readText(path));

function fail(message) {
  failures.push(message);
}

function majorOf(value, label) {
  const match = String(value ?? "").match(/(\d+)/);
  if (!match) {
    fail(`${label} não possui uma major identificável: ${String(value)}`);
    return null;
  }

  return Number(match[1]);
}

const [
  packageJson,
  packageLock,
  nvmrc,
  nodeVersionFile,
  workflow,
  securityWorkflow,
  dockerfile,
  platformDoc,
  readme,
] = await Promise.all([
  readJson("package.json"),
  readJson("package-lock.json"),
  readText(".nvmrc"),
  readText(".node-version"),
  readText(".github/workflows/ci.yml"),
  readText(".github/workflows/security.yml"),
  readText("Dockerfile"),
  readText("docs/PLATFORM.md"),
  readText("README.md"),
]);

const nodeVersion = nvmrc.trim();
const nodeMajor = majorOf(nodeVersion, ".nvmrc");
const typescriptRange = packageJson.devDependencies?.typescript;
const typescriptMajor = majorOf(typescriptRange, "devDependencies.typescript");
const nodeTypesRange = packageJson.devDependencies?.["@types/node"];
const nodeTypesMajor = majorOf(nodeTypesRange, "devDependencies.@types/node");
const lockRoot = packageLock.packages?.[""];

if (!/^\d+\.\d+\.\d+$/.test(nodeVersion)) {
  fail(`.nvmrc deve conter uma versão exata x.y.z, encontrado "${nodeVersion}"`);
}

if (nodeVersionFile.trim() !== nodeVersion) {
  fail(`.node-version (${nodeVersionFile.trim()}) diverge de .nvmrc (${nodeVersion})`);
}

if (nodeMajor !== null) {
  const expectedEngine = `>=${nodeVersion} <${nodeMajor + 1}`;
  if (packageJson.engines?.node !== expectedEngine) {
    fail(`engines.node deve ser "${expectedEngine}", encontrado "${packageJson.engines?.node ?? "ausente"}"`);
  }

  if (lockRoot?.engines?.node !== expectedEngine) {
    fail(`package-lock.json deve refletir engines.node "${expectedEngine}"`);
  }
}

if (nodeMajor !== null && nodeTypesMajor !== null && nodeTypesMajor !== nodeMajor) {
  fail(`@types/node deve permanecer na major ${nodeMajor}.x, encontrado ${nodeTypesRange}`);
}

if (lockRoot?.devDependencies?.typescript !== typescriptRange) {
  fail("package-lock.json não reflete o range de TypeScript do package.json");
}

if (lockRoot?.devDependencies?.["@types/node"] !== nodeTypesRange) {
  fail("package-lock.json não reflete o range de @types/node do package.json");
}

const lockedTypescriptVersion = packageLock.packages?.["node_modules/typescript"]?.version;
const lockedTypescriptMajor = majorOf(lockedTypescriptVersion, "package-lock TypeScript");
if (
  typescriptMajor !== null &&
  lockedTypescriptMajor !== null &&
  lockedTypescriptMajor !== typescriptMajor
) {
  fail(
    `TypeScript resolvido no lockfile (${lockedTypescriptVersion}) diverge da major declarada (${typescriptRange})`,
  );
}

const lockedNodeTypesVersion = packageLock.packages?.["node_modules/@types/node"]?.version;
const lockedNodeTypesMajor = majorOf(lockedNodeTypesVersion, "package-lock @types/node");
if (nodeMajor !== null && lockedNodeTypesMajor !== null && lockedNodeTypesMajor !== nodeMajor) {
  fail(`@types/node resolvido no lockfile (${lockedNodeTypesVersion}) diverge da major do Node (${nodeMajor}.x)`);
}

const ciNodeVersions = [...workflow.matchAll(/node-version:\s*["']?([^\s"']+)/g)].map((match) => match[1]);
if (ciNodeVersions.length === 0) {
  fail("CI não declara node-version");
} else if (ciNodeVersions.some((version) => version !== nodeVersion)) {
  fail(`CI deve usar Node ${nodeVersion}; encontrado ${ciNodeVersions.join(", ")}`);
}

const requiredWorkflowSnippets = [
  ["permissions mínimos", "permissions:\n  contents: read"],
  ["grupo de concorrência", "group: ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}"],
  ["cancelamento apenas de PR superseded", "cancel-in-progress: ${{ github.event_name == 'pull_request' }}"],
  ["timeout global do job", "    timeout-minutes: 10"],
  ["checks estáticos", "      - name: Static checks\n        run: npm run lint"],
  ["testes", "      - name: Tests\n        run: npm test"],
];
for (const [label, snippet] of requiredWorkflowSnippets) {
  if (!workflow.includes(snippet)) fail(`CI perdeu ${label}`);
}

const requiredSecurityWorkflowSnippets = [
  ["permissions mínimas", "permissions:\n  contents: read"],
  ["execução semanal", "  schedule:\n    - cron: \"17 6 * * 1\""],
  ["execução manual", "  workflow_dispatch:"],
  ["audit de dependências de produção", "        run: npm run audit:prod"],
  ["CodeQL com security-events", "      security-events: write"],
  ["Trivy fixável como bloqueio", "          ignore-unfixed: true\n          exit-code: 1"],
  ["Trivy v0.70.0 explícito", "          version: v0.70.0"],
  ["Syft v1.42.3 explícito", "          syft-version: v1.42.3"],
  ["SBOM sem dependency snapshot", "          dependency-snapshot: false"],
];
for (const [label, snippet] of requiredSecurityWorkflowSnippets) {
  if (!securityWorkflow.includes(snippet)) fail(`Security workflow perdeu ${label}`);
}

if (securityWorkflow.includes("pull_request:")) {
  fail("Security workflow voltou a rodar em pull_request");
}

const securityActions = [...securityWorkflow.matchAll(/uses:\s*([^\s@]+)@([^\s#]+)/g)];
if (securityActions.length === 0) {
  fail("Security workflow não possui Actions");
}
for (const [, action, reference] of securityActions) {
  if (!/^[0-9a-f]{40}$/.test(reference)) {
    fail(`Security workflow deve pinar ${action} por SHA completo, encontrado ${reference}`);
  }
}

const dockerNodeVersions = [...dockerfile.matchAll(/^FROM\s+node:([0-9]+\.[0-9]+\.[0-9]+)-/gm)].map(
  (match) => match[1],
);
if (dockerNodeVersions.length === 0) {
  fail("Dockerfile não possui imagem Node versionada");
} else if (dockerNodeVersions.some((version) => version !== nodeVersion)) {
  fail(`Dockerfile deve usar Node ${nodeVersion}; encontrado ${dockerNodeVersions.join(", ")}`);
}

if (!platformDoc.includes(`| Node.js | \`${nodeVersion}\` |`)) {
  fail(`docs/PLATFORM.md deve declarar Node.js ${nodeVersion} na tabela de baseline`);
}

if (nodeMajor !== null && !platformDoc.includes(`| \`@types/node\` | \`${nodeMajor}.x\` |`)) {
  fail(`docs/PLATFORM.md deve declarar @types/node ${nodeMajor}.x na tabela de baseline`);
}

if (typescriptMajor !== null && !platformDoc.includes(`| TypeScript | \`${typescriptMajor}.x\` |`)) {
  fail(`docs/PLATFORM.md deve declarar TypeScript ${typescriptMajor}.x na tabela de baseline`);
}

if (!readme.includes(`Node.js ${nodeVersion} LTS`)) {
  fail(`README.md deve declarar Node.js ${nodeVersion} LTS nos requisitos`);
}

if (failures.length > 0) {
  console.error("Platform baseline drift detectado:\n");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Platform baseline OK: Node ${nodeVersion}, @types/node ${nodeMajor}.x, TypeScript ${typescriptMajor}.x`,
);

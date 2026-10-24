// Reproduz a evidência dos geradores "Prêmio máximo" e a compara com os coeficientes versionados.
// Uso: node scripts/validatePayoutModels.mjs [baseUrl] [modalidade|all]   (requer `npm run build:server`)
// Saída: JSON por modalidade; "status" = OUT quando o coeficiente do modelo cai fora do IC95% fora da amostra.
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const only = process.argv[3] ?? "all";
const BOOTSTRAP = 300;

// n = dezenas por jogo (para a fração `m_k` = k/n − (d−k)/(U−n)); evalHits = faixas validadas por tercis.
const LOTTERIES = {
  "mega-sena": { min: 1, max: 60, draw: 6, ticket: 6, fitHits: 4, lambda: 30, evalHits: [4, 5], model: "megaSenaPopularity", modelHits: (m) => ({ 6: m.MEGA_POPULARITY_MODEL.shareCoefficient }) },
  lotofacil: { min: 1, max: 25, draw: 15, ticket: 15, fitHits: 13, lambda: 30, evalHits: [12, 13, 14, 15], model: "lotofacilModel", modelHits: (m) => ({ 14: m.LOTOFACIL_MODEL.shareCoefficient14, 15: m.LOTOFACIL_MODEL.shareCoefficient }) },
  quina: { min: 1, max: 80, draw: 5, ticket: 5, fitHits: 3, lambda: 30, evalHits: [2, 3, 4, 5], model: "quinaModel", modelHits: (m) => m.QUINA_MODEL.shareCoefficients },
  "dia-de-sorte": { min: 1, max: 31, draw: 7, ticket: 7, fitHits: 5, lambda: 30, evalHits: [4, 5, 6, 7], model: "diaDeSorteModel", modelHits: (m) => m.DIA_DE_SORTE_MODEL.shareCoefficients },
  "dupla-sena": { min: 1, max: 50, draw: 6, ticket: 6, fitHits: 4, lambda: 30, evalHits: [3, 4, 5, 6], draws: 2, model: "duplaSenaModel", modelHits: (m) => m.DUPLA_SENA_MODEL.shareCoefficients },
  "mais-milionaria": { min: 1, max: 50, draw: 6, ticket: 6, fitHits: 3, lambda: 3, evalHits: [2, 3, 4, 5, 6], model: "maisMilionariaModel", modelHits: (m) => m.MAIS_MILIONARIA_MODEL.shareCoefficients },
  timemania: { min: 1, max: 80, draw: 7, ticket: 10, fitHits: 4, lambda: 30, evalHits: [3, 4, 5, 6, 7], model: "timemaniaModel", modelHits: (m) => m.TIMEMANIA_MODEL.shareCoefficients },
  lotomania: { min: 0, max: 99, draw: 20, ticket: 50, fitHits: 15, lambda: 100, evalHits: [15, 16, 17, 18], model: null },
};

async function load(lottery) {
  const items = [];
  for (let start = 1; ; start += 200) {
    const response = await fetch(`${baseUrl}/api/v1/contests/${lottery}?startContest=${start}&endContest=${start + 199}&order=asc&limit=200`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const page = (await response.json()).items;
    if (page.length === 0) break;
    items.push(...page);
  }
  return items;
}

const winnersOf = (contest, draw, hits) =>
  contest.prizeTiers
    .filter((t) => t.description.startsWith(`${hits} acertos`) && (t.draw === undefined || t.draw === draw))
    .reduce((sum, t) => sum + t.winners, 0);

function solveRidge(rows, size, min, lambda) {
  const a = Array.from({ length: size }, () => Array(size + 1).fill(0));
  for (const row of rows) {
    for (const i of row.x) {
      for (const j of row.x) a[i - min][j - min] += 1;
      a[i - min][size] += row.y;
    }
  }
  for (let i = 0; i < size; i += 1) a[i][i] += lambda;
  for (let i = 0; i < size; i += 1) {
    let pivot = i;
    for (let r = i + 1; r < size; r += 1) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    for (let r = 0; r < size; r += 1) {
      if (r === i) continue;
      const q = a[r][i] / a[i][i];
      for (let c = i; c <= size; c += 1) a[r][c] -= q * a[i][c];
    }
  }
  const beta = a.map((row, i) => row[size] / row[i]);
  const mean = beta.reduce((x, y) => x + y) / size;
  return beta.map((v) => v - mean);
}

const avg = (v) => v.reduce((x, y) => x + y, 0) / v.length;
function corr(a, b) {
  const ma = avg(a);
  const mb = avg(b);
  let n = 0;
  let da = 0;
  let db = 0;
  a.forEach((v, i) => { n += (v - ma) * (b[i] - mb); da += (v - ma) ** 2; db += (b[i] - mb) ** 2; });
  return n / Math.sqrt(da * db);
}

function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

async function validate(name, cfg) {
  const contests = await load(name);
  const size = cfg.max - cfg.min + 1;
  const draws = cfg.draws ?? 1;
  const drawOf = (c, dr) => (dr === 1 ? c.numbers : c.secondDrawNumbers);
  const all = contests.flatMap((c) => Array.from({ length: draws }, (_, i) => drawOf(c, i + 1)));
  const p = cfg.draw / size;

  // 1) Uniformidade e estabilidade da frequência.
  const freq = Array(size).fill(0);
  for (const d of all) for (const n of d) freq[n - cfg.min] += 1;
  const chi2 = (freq.reduce((s, f) => s + (f - all.length * p) ** 2 / (all.length * p * (1 - p)), 0) * (size - 1)) / size;
  const dev = (set) => {
    const f = Array(size).fill(0);
    for (const d of set) for (const n of d) f[n - cfg.min] += 1;
    return f.map((v) => v / set.length - p);
  };
  const half = all.length >> 1;
  const halfCorr = corr(dev(all.slice(0, half)), dev(all.slice(half)));
  let num = 0;
  let den = 0;
  const blockSize = Math.floor(all.length / 10);
  for (let b = 0; b < 10; b += 1) {
    const rest = [...all.slice(0, b * blockSize), ...all.slice((b + 1) * blockSize)];
    const rd = dev(rest);
    const td = dev(all.slice(b * blockSize, (b + 1) * blockSize));
    rd.forEach((v, i) => { num += v * td[i]; den += v * v; });
  }

  // 2) Popularidade: linhas (sorteio, y) por ano; ajuste par/ímpar e metades temporais.
  const priced = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length);
  const rowsFor = (set, hits) => {
    const rows = [];
    for (let dr = 1; dr <= draws; dr += 1) {
      const byYear = new Map();
      for (const c of set.filter((x) => winnersOf(x, dr, hits) > 0)) byYear.set(c.date.slice(0, 4), [...(byYear.get(c.date.slice(0, 4)) ?? []), c]);
      for (const group of byYear.values()) {
        const logs = group.map((c) => Math.log(winnersOf(c, dr, hits) / c.amountCollected));
        const mean = avg(logs);
        group.forEach((c, i) => rows.push({ x: drawOf(c, dr), y: logs[i] - mean, n: c.number }));
      }
    }
    return rows;
  };
  const fitRows = rowsFor(priced, cfg.fitHits);
  const score = (w, x) => x.reduce((s, n) => s + w[n - cfg.min], 0);
  const trainRows = rowsFor(priced.filter((_, i) => i % 2 === 0), cfg.fitHits);
  const testRows = rowsFor(priced.filter((_, i) => i % 2 === 1), cfg.fitHits);
  const wTrain = solveRidge(trainRows, size, cfg.min, cfg.lambda);
  const predicted = testRows.map((r) => score(wTrain, r.x));
  const ym = avg(testRows.map((r) => r.y));
  const pm = avg(predicted);
  let sse = 0;
  let sst = 0;
  testRows.forEach((r, i) => { sse += (r.y - (predicted[i] - pm + ym)) ** 2; sst += (r.y - ym) ** 2; });
  const sorted = [...fitRows].sort((x, y) => x.n - y.n);
  const h = sorted.length >> 1;
  const popularityHalfCorr = corr(solveRidge(sorted.slice(0, h), size, cfg.min, cfg.lambda), solveRidge(sorted.slice(h), size, cfg.min, cfg.lambda));

  // 3) Coeficientes por faixa em tercis fora da amostra, com bootstrap.
  const evalSet = priced.filter((_, i) => i % 2 === 1);
  const evalRows = evalSet.flatMap((c) => Array.from({ length: draws }, (_, i) => ({ c, dr: i + 1, x: drawOf(c, i + 1) })));
  const ordered = evalRows.map((r) => ({ ...r, s: score(wTrain, r.x) })).sort((a, b) => a.s - b.s);
  const third = Math.floor(ordered.length / 3);
  const low = ordered.slice(0, third);
  const high = ordered.slice(2 * third);
  const deltaScore = avg(high.map((r) => r.s)) - avg(low.map((r) => r.s));
  const rng = makeRng(7);
  const coefficients = {};
  for (const hits of cfg.evalHits) {
    const rate = new Map();
    for (const c of priced) for (let dr = 1; dr <= draws; dr += 1) {
      const key = `${dr}${c.date.slice(0, 4)}`;
      const entry = rate.get(key) ?? { w: 0, a: 0 };
      entry.w += winnersOf(c, dr, hits);
      entry.a += c.amountCollected;
      rate.set(key, entry);
    }
    const ratio = (group) => {
      let observed = 0;
      let expected = 0;
      for (const r of group) {
        const entry = rate.get(`${r.dr}${r.c.date.slice(0, 4)}`);
        observed += winnersOf(r.c, r.dr, hits);
        expected += (r.c.amountCollected * entry.w) / entry.a;
      }
      return observed / expected;
    };
    const point = Math.log(ratio(high) / ratio(low)) / deltaScore;
    const boot = [];
    for (let b = 0; b < BOOTSTRAP; b += 1) {
      const draw = (g) => Array.from({ length: g.length }, () => g[Math.floor(rng() * g.length)]);
      const value = Math.log(ratio(draw(high)) / ratio(draw(low))) / deltaScore;
      if (Number.isFinite(value)) boot.push(value);
    }
    boot.sort((x, y) => x - y);
    coefficients[hits] = Number.isFinite(point)
      ? { coef: Number(point.toFixed(2)), ci95: boot.length > 20 ? [Number(boot[Math.floor(boot.length * 0.025)].toFixed(2)), Number(boot[Math.floor(boot.length * 0.975)].toFixed(2))] : null }
      : null;
  }

  // 4) Comparação com os coeficientes versionados (apenas quando a faixa é validável).
  const comparison = {};
  if (cfg.model) {
    const mod = await import(`../dist/src/generator/${cfg.model}.js`);
    for (const [hits, modelCoef] of Object.entries(cfg.modelHits(mod))) {
      const measured = coefficients[hits];
      comparison[hits] = {
        model: modelCoef,
        measured: measured?.coef ?? null,
        ci95: measured?.ci95 ?? null,
        status: !measured?.ci95 ? "NOT-VALIDATABLE" : modelCoef >= measured.ci95[0] && modelCoef <= measured.ci95[1] ? "OK" : "OUT",
      };
    }
    // Mega-Sena: a sena quase nunca tem ganhadores; extrapola o último coeficiente medido pela teoria (∝ m_k).
    if (name === "mega-sena") {
      const m = (k) => k / cfg.ticket - (cfg.draw - k) / (size - cfg.ticket);
      const top = coefficients[5];
      comparison[6] = { ...comparison[6], impliedByFiveHitCoefficient: top ? Number(((top.coef / m(5)) * m(6)).toFixed(2)) : null };
    }
  }

  return {
    lottery: name,
    contests: contests.length,
    pricedContests: priced.length,
    uniformity: { chi2: Number(chi2.toFixed(1)), df: size - 1, halfCorrelation: Number(halfCorr.toFixed(2)), cvShrink: Number((num / den).toFixed(2)) },
    popularity: { fitHits: cfg.fitHits, rows: fitRows.length, oosR2: Number((1 - sse / sst).toFixed(3)), halfCorrelation: Number(popularityHalfCorr.toFixed(2)) },
    deltaScore: Number(deltaScore.toFixed(3)),
    coefficientsByHits: coefficients,
    modelComparison: comparison,
  };
}

const names = only === "all" ? Object.keys(LOTTERIES) : [only];
let outOfRange = 0;
for (const name of names) {
  const cfg = LOTTERIES[name];
  if (!cfg) throw new Error(`Modalidade desconhecida: ${name}`);
  const result = await validate(name, cfg);
  outOfRange += Object.values(result.modelComparison).filter((entry) => entry.status === "OUT").length;
  console.log(JSON.stringify(result));
}
if (outOfRange > 0) {
  console.error(`${outOfRange} coeficiente(s) do modelo fora do IC95% fora da amostra: reajuste ou revise.`);
  process.exitCode = 1;
}

// Reajusta o modelo da Dupla Sena (src/generator/duplaSenaModel.ts).
// Uso: node scripts/fitDuplaSenaModel.mjs [baseUrl]   (padrão http://localhost:5200)
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const LAMBDA = 30;

const contests = [];
for (let start = 1; ; start += 200) {
  const response = await fetch(`${baseUrl}/api/v1/contests/dupla-sena?startContest=${start}&endContest=${start + 199}&order=asc&limit=200`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { items } = await response.json();
  if (items.length === 0) break;
  contests.push(...items);
}

const priced = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length === 8 && c.secondDrawNumbers);
const tier = (c, draw, hits) => c.prizeTiers.find((t) => t.draw === draw && t.description.startsWith(`${hits} `));

// Popularidade: ridge de log(ganhadores_4/arrecadação) nos dois sorteios, efeito fixo por ano e sorteio.
const k = 50;
const a = Array.from({ length: k }, () => Array(k + 1).fill(0));
for (const draw of [1, 2]) {
  const byYear = new Map();
  for (const c of priced.filter((x) => tier(x, draw, 4).winners > 0)) byYear.set(c.date.slice(0, 4), [...(byYear.get(c.date.slice(0, 4)) ?? []), c]);
  for (const group of byYear.values()) {
    const logs = group.map((c) => Math.log(tier(c, draw, 4).winners / c.amountCollected));
    const mean = logs.reduce((x, y) => x + y) / logs.length;
    group.forEach((c, index) => {
      const numbers = draw === 1 ? c.numbers : c.secondDrawNumbers;
      for (const i of numbers) {
        for (const j of numbers) a[i - 1][j - 1] += 1;
        a[i - 1][k] += logs[index] - mean;
      }
    });
  }
}
for (let i = 0; i < k; i += 1) a[i][i] += LAMBDA;
for (let i = 0; i < k; i += 1) {
  let pivot = i;
  for (let r = i + 1; r < k; r += 1) if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
  [a[i], a[pivot]] = [a[pivot], a[i]];
  for (let r = 0; r < k; r += 1) {
    if (r === i) continue;
    const q = a[r][i] / a[i][i];
    for (let c = i; c <= k; c += 1) a[r][c] -= q * a[i][c];
  }
}
const beta = a.map((row, i) => row[k] / row[i]);
const betaMean = beta.reduce((x, y) => x + y) / k;

// Retorno (soma dos dois sorteios) e ganhadores médios (média dos dois sorteios) por faixa.
const revenue = priced.reduce((s, c) => s + c.amountCollected, 0);
const returns = {};
const winners = {};
for (const hits of [6, 5, 4, 3]) {
  returns[hits] = Number(([1, 2].reduce((sum, draw) => sum + priced.reduce((s, c) => s + tier(c, draw, hits).winners * tier(c, draw, hits).prizeValue, 0), 0) / revenue).toFixed(4));
  winners[hits] = Number(([1, 2].reduce((sum, draw) => sum + priced.reduce((s, c) => s + tier(c, draw, hits).winners, 0), 0) / (2 * priced.length)).toFixed(1));
}

console.log(JSON.stringify({
  fitThroughContest: contests.at(-1).number,
  popularityContests: priced.length,
  popularity: beta.map((v) => Number((v - betaMean).toFixed(3))),
  returns,
  winners,
}));

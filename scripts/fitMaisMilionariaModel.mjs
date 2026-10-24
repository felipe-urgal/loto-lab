// Reajusta o modelo da +Milionária (src/generator/maisMilionariaModel.ts).
// Uso: node scripts/fitMaisMilionariaModel.mjs [baseUrl]   (padrão http://localhost:5200)
const baseUrl = process.argv[2] ?? "http://localhost:5200";
const LAMBDA = 3;

const contests = [];
for (let start = 1; ; start += 100) {
  const response = await fetch(`${baseUrl}/api/v1/contests/mais-milionaria?startContest=${start}&endContest=${start + 99}&order=asc&limit=200`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const { items } = await response.json();
  if (items.length === 0) break;
  contests.push(...items);
}

const priced = contests.filter((c) => c.amountCollected > 0 && c.prizeTiers?.length === 10 && c.secondary?.values?.length === 2);
const winners = (c, tiers) => tiers.reduce((sum, t) => sum + c.prizeTiers[t].winners, 0);

// Popularidade: ridge de log(ganhadores_3_acertos/arrecadação) em 50 dezenas + 6 trevos, efeito fixo por ano.
const k = 56;
const a = Array.from({ length: k }, () => Array(k + 1).fill(0));
const byYear = new Map();
for (const c of priced.filter((x) => winners(x, [6, 7]) > 0)) byYear.set(c.date.slice(0, 4), [...(byYear.get(c.date.slice(0, 4)) ?? []), c]);
for (const group of byYear.values()) {
  const logs = group.map((c) => Math.log(winners(c, [6, 7]) / c.amountCollected));
  const mean = logs.reduce((x, y) => x + y) / logs.length;
  group.forEach((c, index) => {
    const columns = [...c.numbers.map((n) => n - 1), ...c.secondary.values.map((v) => 50 + v - 1)];
    for (const i of columns) {
      for (const j of columns) a[i][j] += 1;
      a[i][k] += logs[index] - mean;
    }
  });
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
const numbers = beta.slice(0, 50);
const numbersMean = numbers.reduce((x, y) => x + y) / 50;

// Retorno por número de dezenas acertadas e ganhadores médios (faixas com e sem trevos somadas).
const revenue = priced.reduce((s, c) => s + c.amountCollected, 0);
const groups = { 6: [0, 1], 5: [2, 3], 4: [4, 5], 3: [6, 7], 2: [8, 9] };
const returns = {};
const averageWinners = {};
for (const [hits, tiers] of Object.entries(groups)) {
  returns[hits] = Number((priced.reduce((s, c) => s + tiers.reduce((x, t) => x + c.prizeTiers[t].winners * c.prizeTiers[t].prizeValue, 0), 0) / revenue).toFixed(4));
  averageWinners[hits] = Number((priced.reduce((s, c) => s + winners(c, tiers), 0) / priced.length).toFixed(2));
}

console.log(JSON.stringify({
  fitThroughContest: contests.at(-1).number,
  popularityContests: priced.length,
  popularity: numbers.map((v) => Number((v - numbersMean).toFixed(3))),
  returns,
  winners: averageWinners,
}));

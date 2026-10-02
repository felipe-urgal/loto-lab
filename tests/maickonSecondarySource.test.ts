import test from "node:test";
import assert from "node:assert/strict";
import { MaickonSecondaryContestSource, SecondarySourceInvalidResponseError, SecondarySourceUnavailableError } from "../src/data/maickonSecondarySource.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("secondary source normalizes Mega-Sena contest payloads with provenance", async () => {
  let requestedUrl = "";
  const source = new MaickonSecondaryContestSource(async (input) => {
    requestedUrl = String(input);
    return jsonResponse({
      numero: 3045,
      dataApuracao: "15/08/2026",
      listaDezenas: ["06","01","04","03","05","02"],
    });
  }, 5_000, () => "2026-10-02T12:00:00.000Z");

  const result = await source.fetchContest("mega-sena", 3045);

  assert.equal(requestedUrl.endsWith("/database/megasena/3045.json"), true);
  assert.deepEqual(result?.numbers, [1,2,3,4,5,6]);
  assert.equal(result?.drawDate, "2026-08-15");
  assert.equal(result?.source.provider, "maickon/free-apiloterias");
  assert.equal(result?.source.ref, "master");
  assert.equal(result?.source.fetchedAt, "2026-10-02T12:00:00.000Z");
});

test("secondary source reads latest contest number from ultimo.json", async () => {
  const source = new MaickonSecondaryContestSource(async (input) => {
    assert.equal(String(input).endsWith("/database/lotofacil/ultimo.json"), true);
    return jsonResponse({
      numero: 3470,
      dataApuracao: "18/08/2026",
      listaDezenas: ["01","02","03","04","05","06","07","08","09","10","11","12","13","14","15"],
    });
  });

  assert.equal(await source.latestContestNumber("lotofacil"), 3470);
});

test("secondary source maps missing contest to undefined", async () => {
  const source = new MaickonSecondaryContestSource(async () => jsonResponse({}, 404));
  assert.equal(await source.fetchContest("mega-sena", 999999), undefined);
});

test("secondary source distinguishes unavailable and invalid payloads", async () => {
  const unavailable = new MaickonSecondaryContestSource(async () => jsonResponse({}, 503));
  await assert.rejects(
    () => unavailable.latestContestNumber("mega-sena"),
    SecondarySourceUnavailableError,
  );

  const invalid = new MaickonSecondaryContestSource(async () => jsonResponse({
    numero: 1,
    dataApuracao: "11/03/1996",
    listaDezenas: ["01","02"],
  }));
  await assert.rejects(
    () => invalid.fetchContest("mega-sena", 1),
    SecondarySourceInvalidResponseError,
  );
});

test("secondary source only supports initial reconciliation lotteries", () => {
  const source = new MaickonSecondaryContestSource();
  assert.equal(source.supports("mega-sena"), true);
  assert.equal(source.supports("lotofacil"), true);
  assert.equal(source.supports("quina"), false);
});

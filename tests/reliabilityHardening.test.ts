import test from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  estimateStrategyLabWorkUnits,
  parseStrategyLabOptions,
} from "../src/api/strategyLabInput.js";
import {
  ApiError,
  requireSameOriginMutation,
  resolveMutationExpectedOrigin,
} from "../src/api/http.js";

test("Strategy Lab parser keeps synchronous and queued experiments on the same contract", () => {
  const score = parseStrategyLabOptions({ experiment: "score-model" }, "mega-sena");
  assert.equal(score.experiment, "score-model");
  assert.equal(score.randomSamples, 100);
  assert.equal(score.gameCount, 2);

  const external = parseStrategyLabOptions({ experiment: "external-rules" }, "mega-sena");
  assert.equal(external.randomSamples, 250);
  assert.equal(external.lookbackContests, 200);

  assert.throws(
    () => parseStrategyLabOptions({ experiment: "external-rules" }, "lotofacil"),
    (error) => error instanceof ApiError && error.statusCode === 400,
  );
});

test("Strategy Lab work estimate grows with variants, games and controls", () => {
  const fixed = estimateStrategyLabWorkUnits("fixed-core", 100, 2, 100);
  const external = estimateStrategyLabWorkUnits("external-rules", 100, 2, 250);
  assert.ok(external > fixed);
});

function mutationRequest(
  origin?: string,
  fetchSite?: string,
  host?: string,
  forwardedProto?: string,
) {
  return {
    method: "POST",
    headers: {
      ...(origin ? { origin } : {}),
      ...(fetchSite ? { "sec-fetch-site": fetchSite } : {}),
      ...(host ? { host } : {}),
      ...(forwardedProto ? { "x-forwarded-proto": forwardedProto } : {}),
    },
  } as unknown as IncomingMessage;
}

type RecordedResponse = ServerResponse & { body?: string };

function responseRecorder() {
  const headers = new Map<string, string>();
  const response = {
    statusCode: 200,
    body: undefined as string | undefined,
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), String(value)); },
    end(body?: string) { response.body = body; },
  } as unknown as RecordedResponse;
  return { response, headers };
}

test("same-origin mutation guard blocks cross-site browser POSTs but keeps non-browser clients usable", () => {
  const blocked = responseRecorder();
  assert.equal(
    requireSameOriginMutation(
      mutationRequest("https://evil.example", "cross-site"),
      blocked.response,
      "https://loto.example",
    ),
    false,
  );
  assert.equal(blocked.response.statusCode, 403);
  assert.match(blocked.response.body ?? "", /CROSS_ORIGIN_MUTATION_BLOCKED/);

  const allowed = responseRecorder();
  assert.equal(
    requireSameOriginMutation(
      mutationRequest("https://loto.example", "same-origin"),
      allowed.response,
      "https://loto.example",
    ),
    true,
  );

  const cli = responseRecorder();
  assert.equal(requireSameOriginMutation(mutationRequest(), cli.response, "https://loto.example"), true);
});

test("mutation origin follows the actual request host when no public origin is configured", () => {
  const local = mutationRequest(
    "http://127.0.0.1:3099",
    "same-origin",
    "127.0.0.1:3099",
  );
  const localOrigin = resolveMutationExpectedOrigin(local);
  assert.equal(localOrigin, "http://127.0.0.1:3099");
  assert.equal(requireSameOriginMutation(local, responseRecorder().response, localOrigin), true);

  const proxied = mutationRequest(
    "https://loto.example",
    "same-origin",
    "loto.example",
    "https",
  );
  assert.equal(resolveMutationExpectedOrigin(proxied), "https://loto.example");
  assert.equal(resolveMutationExpectedOrigin(proxied, "https://public.example"), "https://public.example");
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("HTTP observability and same-origin mutation checks remain in the public generator", async () => {
  const server = await source("src/api/server.ts");
  const handlerStart = server.indexOf("return createServer(async");
  const handler = server.slice(handlerStart);
  const originCheck = handler.indexOf("requireSameOriginMutation");
  const metricsEndpoint = handler.indexOf('url.pathname === "/api/v1/ops/metrics"');

  assert.ok(handlerStart >= 0);
  assert.ok(originCheck >= 0);
  assert.ok(metricsEndpoint > originCheck);
  assert.doesNotMatch(handler, /requireAppAuthentication/);
  assert.match(handler, /classifyHttpRoute\(metricsUrl\.pathname\)/);
  assert.match(handler, /response\.once\("finish"/);
  assert.match(handler, /recordHttpRequest\(routeFamily, response\.statusCode/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function source(path: string): Promise<string> {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("agenda HTTP ownership delegates to an injected application use case", async () => {
  const [application, controller, routes, server] = await Promise.all([
    source("src/application/agenda.ts"),
    source("src/api/agenda.ts"),
    source("src/api/routes.ts"),
    source("src/api/server.ts"),
  ]);

  assert.doesNotMatch(application, /ApiError/);
  assert.doesNotMatch(application, /Postgres/);
  assert.doesNotMatch(application, /from "pg"/);
  assert.doesNotMatch(application, /\.\.\/persistence\//);
  assert.match(application, /interface AgendaReader/);
  assert.match(application, /interface AgendaNotificationStore/);
  assert.match(application, /interface AgendaNotificationRefresher/);
  assert.match(application, /class AgendaUseCase/);

  assert.doesNotMatch(controller, /PostgresAgendaRepository/);
  assert.doesNotMatch(controller, /PostgresNotificationRepository/);
  assert.doesNotMatch(controller, /NotificationService/);
  assert.doesNotMatch(controller, /options\.pool/);
  assert.doesNotMatch(controller, /from "pg"/);
  assert.match(controller, /agenda\.overview\(/);
  assert.match(controller, /agenda\.markRead\(/);
  assert.match(controller, /agenda\.markAllRead\(/);

  assert.match(routes, /agenda: AgendaUseCase/);
  assert.match(routes, /dependencies\.agenda/);
  assert.match(server, /agenda: new AgendaUseCase\(/);
  assert.match(server, /new PostgresAgendaRepository\(options\.pool\)/);
  assert.match(server, /new PostgresNotificationRepository\(options\.pool\)/);
  assert.match(server, /new NotificationService\(options\.pool\)/);
});

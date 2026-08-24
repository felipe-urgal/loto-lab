import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AppAuthConfig {
  username: string;
  password: string;
}

interface AuthFailureBucket {
  count: number;
  resetAt: number;
}

const AUTH_FAILURE_LIMIT = 20;
const AUTH_FAILURE_WINDOW_MS = 5 * 60_000;
const authFailures = new Map<string, AuthFailureBucket>();

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function clientKey(request: IncomingMessage): string {
  return request.socket.remoteAddress || "unknown";
}

function activeFailureBucket(key: string, now = Date.now()): AuthFailureBucket | undefined {
  const bucket = authFailures.get(key);
  if (!bucket) return undefined;
  if (bucket.resetAt <= now) {
    authFailures.delete(key);
    return undefined;
  }
  return bucket;
}

function retryAfterSeconds(bucket: AuthFailureBucket, now = Date.now()): number {
  return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

function recordFailure(key: string, now = Date.now()): AuthFailureBucket {
  const bucket = activeFailureBucket(key, now);
  if (bucket) {
    bucket.count += 1;
    return bucket;
  }

  const created = { count: 1, resetAt: now + AUTH_FAILURE_WINDOW_MS };
  authFailures.set(key, created);
  if (authFailures.size > 500) {
    for (const [candidate, value] of authFailures) {
      if (value.resetAt <= now) authFailures.delete(candidate);
    }
  }
  return created;
}

function sendAuthRateLimit(response: ServerResponse, bucket: AuthFailureBucket): void {
  response.statusCode = 429;
  response.setHeader("Retry-After", String(retryAfterSeconds(bucket)));
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Too many authentication failures");
}

export function loadAppAuthConfig(env: NodeJS.ProcessEnv = process.env): AppAuthConfig | undefined {
  const username = env.APP_AUTH_USER?.trim();
  const password = env.APP_AUTH_PASSWORD;
  if (!username && !password) return undefined;
  if (!username || !password) {
    throw new Error("APP_AUTH_USER and APP_AUTH_PASSWORD must be configured together");
  }
  if (password.length < 12) {
    throw new Error("APP_AUTH_PASSWORD must contain at least 12 characters");
  }
  return { username, password };
}

export function isRequestAuthorized(request: IncomingMessage, config: AppAuthConfig): boolean {
  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) return false;

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return false;
  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return safeEqual(username, config.username) && safeEqual(password, config.password);
}

export function requireAppAuthentication(
  request: IncomingMessage,
  response: ServerResponse,
  config: AppAuthConfig | undefined,
): boolean {
  if (!config) return true;

  const key = clientKey(request);
  const bucket = activeFailureBucket(key);
  if (bucket && bucket.count >= AUTH_FAILURE_LIMIT) {
    sendAuthRateLimit(response, bucket);
    return false;
  }

  if (isRequestAuthorized(request, config)) {
    authFailures.delete(key);
    return true;
  }

  const afterFailure = recordFailure(key);
  if (afterFailure.count >= AUTH_FAILURE_LIMIT) {
    sendAuthRateLimit(response, afterFailure);
    return false;
  }

  response.statusCode = 401;
  response.setHeader("WWW-Authenticate", 'Basic realm="Loto Lab", charset="UTF-8"');
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Authentication required");
  return false;
}

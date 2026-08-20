import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface AppAuthConfig {
  username: string;
  password: string;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
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
  if (!config || isRequestAuthorized(request, config)) return true;

  response.statusCode = 401;
  response.setHeader("WWW-Authenticate", 'Basic realm="Loto Lab", charset="UTF-8"');
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end("Authentication required");
  return false;
}

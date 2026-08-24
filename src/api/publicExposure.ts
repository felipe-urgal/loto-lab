import { loadAppAuthConfig } from "./auth.js";
import { logEvent } from "../observability/log.js";

function enabled(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function isLoopbackBind(value: string): boolean {
  return value === "127.0.0.1" || value === "::1" || value.toLowerCase() === "localhost";
}

export function validatePublicExposure(env: NodeJS.ProcessEnv = process.env): void {
  const bindAddress = env.PUBLIC_BIND_ADDRESS ?? env.API_HOST ?? "127.0.0.1";
  if (isLoopbackBind(bindAddress)) return;

  const auth = loadAppAuthConfig(env);
  if (!auth) {
    throw new Error(
      "Public/non-loopback API binding requires APP_AUTH_USER and APP_AUTH_PASSWORD. Bind to loopback or configure authentication.",
    );
  }

  if (enabled(env.ALLOW_INSECURE_PUBLIC_HTTP)) {
    logEvent("warn", "insecure_public_http_allowed", { bindAddress });
    return;
  }

  const publicOrigin = env.PUBLIC_ORIGIN ?? env.API_CORS_ORIGIN;
  let protocol: string | undefined;
  try {
    protocol = publicOrigin ? new URL(publicOrigin).protocol : undefined;
  } catch {
    throw new Error("PUBLIC_ORIGIN must be a valid absolute URL when the app is exposed publicly");
  }
  if (protocol !== "https:") {
    throw new Error(
      "Public/non-loopback API binding requires an https:// PUBLIC_ORIGIN because HTTP Basic credentials must not travel over plaintext HTTP. Use a TLS reverse proxy or explicitly set ALLOW_INSECURE_PUBLIC_HTTP=true for an intentional exception.",
    );
  }
}

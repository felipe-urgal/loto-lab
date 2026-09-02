export const API = "/api/v1";

const API_PATH_PATTERN = /^\/[A-Za-z0-9/_?&=:%+,.~-]*$/;

type ApiErrorDetails = {
  message?: string;
  code?: string;
};

function readApiErrorDetails(payload: unknown): ApiErrorDetails {
  if (typeof payload !== "object" || payload === null) return {};

  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return {};

  const details = error as { message?: unknown; code?: unknown };
  return {
    message: typeof details.message === "string" ? details.message : undefined,
    code: typeof details.code === "string" ? details.code : undefined,
  };
}

function requestHeaders(options: RequestInit): HeadersInit | undefined {
  if (!options.body) return options.headers;

  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function safeApiPath(path: string): string {
  if (!API_PATH_PATTERN.test(path) || path.startsWith("//")) {
    throw new TypeError("API path must be a relative /api/v1 route");
  }

  const pathname = path.split("?", 1)[0];
  let decodedPathname: string;
  try {
    decodedPathname = decodeURIComponent(pathname);
  } catch {
    throw new TypeError("API path contains invalid percent encoding");
  }

  const hasTraversal = decodedPathname
    .split("/")
    .some((segment) => segment === "." || segment === "..");
  if (hasTraversal || /%2e/i.test(decodedPathname)) {
    throw new TypeError("API path traversal is not allowed");
  }

  return path;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, status: number, code = "HTTP_ERROR") {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T | null> {
  const requestPath = safeApiPath(path);
  const response = await fetch(`${API}${requestPath}`, {
    ...options,
    headers: requestHeaders(options),
  });
  const payload: unknown =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const details = readApiErrorDetails(payload);
    throw new ApiError(
      details.message || `Erro HTTP ${response.status}`,
      response.status,
      details.code || "HTTP_ERROR",
    );
  }

  return payload as T | null;
}

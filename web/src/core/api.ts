export const API = "/api/v1";

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
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: options.body
      ? { "Content-Type": "application/json", ...(options.headers || {}) }
      : options.headers,
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

import type { GenerationMode } from "../generator/shared.js";
import { ApiError } from "./http.js";

function requiredString(value: unknown, field: string, maxLength = 160): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new ApiError(400, "INVALID_ARGUMENT", `${field} must be a non-empty string up to ${maxLength} characters`);
  }
  return value.trim();
}

export function optionalString(value: unknown, field: string, maxLength = 160): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field, maxLength);
}

export function parseGenerationMode(value: unknown): GenerationMode {
  if (value === undefined || value === null || value === "") return "diversified";
  if (value !== "deterministic" && value !== "diversified") {
    throw new ApiError(400, "INVALID_ARGUMENT", "generationMode must be deterministic or diversified");
  }
  return value;
}

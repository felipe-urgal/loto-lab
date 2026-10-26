import { FixedWindowRateLimiter } from "./rateLimit.js";

export const generationLimiter = new FixedWindowRateLimiter({ limit: 240, windowMs: 60_000 });
export const generationPlanLimiter = new FixedWindowRateLimiter({ limit: 120, windowMs: 60_000 });

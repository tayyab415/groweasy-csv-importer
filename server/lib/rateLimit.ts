/**
 * Minimal in-memory fixed-window rate limiter keyed by client IP. The import
 * endpoint is public and unauthenticated (the assignment requires a public app),
 * so this bounds abuse of the Gemini-backed route (quota/cost).
 *
 * NOTE: state is per-process, so under Cloud Run autoscaling the effective limit
 * is per-instance — adequate for a demo. Use a shared store (e.g. Redis) for a
 * strict global limit.
 */
import type { Request, Response, NextFunction } from "express";

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

function clientIp(req: Request): string {
  // Use Express's resolved req.ip, which honors the app's `trust proxy` setting
  // and therefore ignores caller-spoofed X-Forwarded-For entries. Falling back
  // to the raw socket address (never the untrusted header) keeps the key safe.
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit({ windowMs, max }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();

    // Opportunistically prune expired buckets so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [key, b] of buckets) if (now >= b.resetAt) buckets.delete(key);
    }

    const ip = clientIp(req);
    let bucket = buckets.get(ip);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count++;

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      res.status(429).json({
        error: `Too many requests. Please try again in ${retryAfter}s.`,
      });
      return;
    }

    next();
  };
}

import type { Context, Next } from "hono";
import IORedis from "ioredis";

const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379/1", {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
});

let warnedAboutFailure = false;

function getClientAddress(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ||
    c.req.header("true-client-ip") ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit({
  namespace,
  limit,
  windowSeconds,
}: {
  namespace: string;
  limit: number;
  windowSeconds: number;
}) {
  return async (c: Context, next: Next) => {
    if (c.req.method === "OPTIONS") {
      await next();
      return;
    }

    const key = `rate-limit:${namespace}:${getClientAddress(c)}`;

    try {
      if (redis.status === "wait") {
        await redis.connect();
      }

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      const ttl = Math.max(await redis.ttl(key), 0);

      c.header("RateLimit-Limit", String(limit));
      c.header("RateLimit-Remaining", String(Math.max(limit - count, 0)));
      c.header("RateLimit-Reset", String(ttl));

      if (count > limit) {
        c.header("Retry-After", String(ttl));
        return c.json({ error: "Too many requests" }, 429);
      }
    } catch (error) {
      // Availability wins if Redis is temporarily unavailable; the upstream
      // provider limits remain a secondary safety net.
      if (!warnedAboutFailure) {
        warnedAboutFailure = true;
        console.error("[rateLimit] Redis rate limiting unavailable:", error);
      }
    }

    await next();
  };
}

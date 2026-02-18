import { Redis } from "@upstash/redis";

declare global {
  var __redisClient: Redis | undefined;
}

function getUpstashUrl() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  if (!url) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL is not set. Example: https://xxx.upstash.io"
    );
  }
  return url;
}

function getUpstashToken() {
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!token) {
    throw new Error(
      "UPSTASH_REDIS_REST_TOKEN is not set"
    );
  }
  return token;
}

// Lazy singleton with proper connection handling
function createRedisClient() {
  return new Redis({
    url: getUpstashUrl(),
    token: getUpstashToken(),
  });
}

export const redis: Redis = global.__redisClient ??= createRedisClient();

// Ensure connection (Upstash is HTTP-based, always ready)
export async function ensureRedis(): Promise<void> {
  // Upstash HTTP client is always ready
  return Promise.resolve();
}

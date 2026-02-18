import { createClient } from "redis";

declare global {
  var __redisClient: any;
  var __redisConnecting: Promise<void> | undefined;
}

function getRedisUrl() {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. Example: redis://:PASSWORD@127.0.0.1:6380"
    );
  }
  return url;
}

// Simple singleton with proper connection handling
function createRedisClient() {
  const client = createClient({
    url: getRedisUrl(),
  });

  client.on("error", (err: Error) => {
    console.error("Redis client error:", err.message);
  });

  client.on("connect", () => {
    console.log("Redis: Connected");
  });

  client.on("reconnecting", () => {
    console.log("Redis: Reconnecting...");
  });

  return client;
}

export const redis = global.__redisClient ??= createRedisClient();

// Ensure connection is established before use
export async function ensureRedis(): Promise<void> {
  if (redis.isOpen) return;

  if (!global.__redisConnecting) {
    global.__redisConnecting = redis.connect().catch((err: Error) => {
      global.__redisConnecting = undefined;
      throw err;
    });
  }

  await global.__redisConnecting;
}

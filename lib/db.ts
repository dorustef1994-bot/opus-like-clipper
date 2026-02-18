import { createClient, type RedisClientType } from "redis";

declare global {
  var __redisClient: RedisClientType | undefined;
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

// Lazy singleton with proper connection handling
function createRedisClient() {
  const client = createClient({
    url: getRedisUrl(),
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 20) {
          console.error("Redis: Max reconnection attempts reached");
          return new Error("Max retries reached");
        }
        const delay = Math.min(100 + retries * 100, 3000);
        console.log(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
    },
  });

  client.on("error", (err) => {
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

export const redis: RedisClientType =
  global.__redisClient ??= createRedisClient();

// Ensure connection is established before use
export async function ensureRedis(): Promise<void> {
  if (redis.isOpen) return;

  if (!global.__redisConnecting) {
    global.__redisConnecting = redis.connect().catch((err) => {
      global.__redisConnecting = undefined;
      throw err;
    });
  }

  await global.__redisConnecting;
}

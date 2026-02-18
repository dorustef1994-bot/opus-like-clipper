import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { redis, ensureRedis } from "@/lib/db";

export const runtime = "nodejs";

const HISTORY_KEY = "jobs:history";
const HISTORY_LIMIT = 200;

export async function POST(req: Request) {
  await ensureRedis();

  const body = await req.json().catch(() => ({}));
  const youtubeUrl = body.youtubeUrl;

  if (!youtubeUrl || typeof youtubeUrl !== "string") {
    return NextResponse.json({ error: "youtubeUrl required" }, { status: 400 });
  }

  const jobId = nanoid();
  const jobKey = `job:${jobId}`;

  await redis.hset(jobKey, {
    id: jobId,
    youtubeUrl,
    status: "draft",
    createdAt: Date.now().toString(),
    error: "",
    messages: JSON.stringify([]),
    config: JSON.stringify({}),
    clips: JSON.stringify([]),
  });

  await redis.lpush(HISTORY_KEY, jobId);
  await redis.ltrim(HISTORY_KEY, 0, HISTORY_LIMIT - 1);

  return NextResponse.json({ jobId });
}

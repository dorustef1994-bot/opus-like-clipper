import { NextResponse } from "next/server";
import { redis, ensureRedis } from "@/lib/db";

export const runtime = "nodejs";

const HISTORY_KEY = "jobs:history";
const HISTORY_LIMIT = 50;

function parseJson(raw: any, fallback: any) {
  if (!raw) return fallback;
  if (typeof raw !== "string") return fallback;

  const s = raw.trim();
  if (!s) return fallback;
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

export async function GET() {
  await ensureRedis();

  // node-redis v4: lRange, hGetAll
  const ids = await redis.lRange(HISTORY_KEY, 0, HISTORY_LIMIT - 1);
  const jobIds = (ids || []).map((x: any) => String(x));

  const jobs = [];

  for (const id of jobIds) {
    const data: any = await redis.hGetAll(`job:${id}`);
    if (!data || !data.id) continue;

    const clips = parseJson(data.clips, []);

    jobs.push({
      id: String(data.id),
      youtubeUrl: String(data.youtubeUrl ?? ""),
      status: String(data.status ?? ""),
      error: String(data.error ?? ""),
      createdAt: Number(data.createdAt ?? 0),
      clips,
    });
  }

  return NextResponse.json({ jobs });
}

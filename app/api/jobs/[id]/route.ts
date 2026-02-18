import { NextResponse } from "next/server";
import { redis, ensureRedis } from "@/lib/db";

export const runtime = "nodejs";

function safeJson(value: any, fallback: any) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await ensureRedis();

  const { id } = await ctx.params;
  const jobKey = `job:${id}`;

  const data: any = await redis.hGetAll(jobKey);

  if (!data || !data.id) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: data.id,
    youtubeUrl: data.youtubeUrl || "",
    status: data.status || "unknown",
    error: data.error || "",
    createdAt: Number(data.createdAt || 0),
    config: safeJson(data.config, {}),
    messages: safeJson(data.messages, []),
    clips: safeJson(data.clips, []),
  });
}

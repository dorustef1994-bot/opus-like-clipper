import { NextResponse } from "next/server";
import { redis, ensureRedis } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await ensureRedis();

  const { id } = await ctx.params;
  const jobKey = `job:${id}`;

  const data: any = await redis.hgetall(jobKey);
  if (!data || !data.id) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const config = body.config ?? {};
  const messages = Array.isArray(body.messages) ? body.messages : [];

  await redis.hset(jobKey, {
    config: JSON.stringify(config),
    messages: JSON.stringify(messages),
    status: "queued",
    error: "",
  });

  await redis.lpush("jobs:queue", id);

  return NextResponse.json({ ok: true });
}

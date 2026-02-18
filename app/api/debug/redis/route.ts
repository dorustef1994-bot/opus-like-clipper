import { NextResponse } from "next/server";
import { redis, ensureRedis } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureRedis();
    const pong = await redis.ping();
    
    // Check history key
    const historyCount = await redis.lLen("jobs:history");
    const queueLen = await redis.lLen("jobs:queue");

    return NextResponse.json({
      status: "ok",
      redis: "connected",
      ping: pong,
      historyCount,
      queueLen,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json(
      { status: "error", message: e?.message || "Unknown error" },
      { status: 500 }
    );
  }
}

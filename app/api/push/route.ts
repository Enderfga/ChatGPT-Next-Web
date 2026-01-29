import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { Redis } from "@upstash/redis";

// 多模态内容类型（与 client/api.ts 保持一致）
interface MultimodalContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

// 存储待推送的消息队列
interface PushMessage {
  id: string;
  sessionId: string;
  type: "message" | "status" | "error";
  content: string | MultimodalContent[];
  role?: "assistant" | "system";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// 初始化 Redis 客户端
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Redis key 前缀
const QUEUE_PREFIX = "push:queue:";
const QUEUE_TTL = 5 * 60; // 5 分钟过期

// GET: 轮询获取消息
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 },
    );
  }

  try {
    const key = `${QUEUE_PREFIX}${sessionId}`;

    // 获取并删除该 session 的所有消息（原子操作）
    const messages = await redis.lrange<PushMessage>(key, 0, -1);

    if (messages && messages.length > 0) {
      // 清空队列
      await redis.del(key);
      console.log(
        `[Push] Retrieved ${messages.length} messages for session ${sessionId}`,
      );
    }

    return NextResponse.json({
      messages: messages || [],
      hasMore: false,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.error("[Push] Redis GET error:", e);
    // 返回空数组而不是错误，避免前端报错
    return NextResponse.json({
      messages: [],
      hasMore: false,
      timestamp: Date.now(),
    });
  }
}

// POST: 推送消息到指定 session
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, type, content, role, metadata } = body;

    if (!sessionId || !content) {
      return NextResponse.json(
        { error: "sessionId and content are required" },
        { status: 400 },
      );
    }

    const message: PushMessage = {
      id: nanoid(),
      sessionId,
      type: type || "message",
      content,
      role: role || "assistant",
      timestamp: Date.now(),
      metadata,
    };

    const key = `${QUEUE_PREFIX}${sessionId}`;

    // 推入队列并设置过期时间
    await redis.rpush(key, message);
    await redis.expire(key, QUEUE_TTL);

    // 限制队列大小（保留最新 100 条）
    await redis.ltrim(key, -100, -1);

    console.log(`[Push] Message queued for session ${sessionId} (Redis)`);

    return NextResponse.json({
      success: true,
      messageId: message.id,
      queued: true,
    });
  } catch (e) {
    console.error("[Push] Redis POST error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

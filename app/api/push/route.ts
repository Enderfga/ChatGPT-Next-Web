import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

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

// Rate limiter: 60 requests per minute per token/IP
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "push:ratelimit:",
});

// Redis key 前缀
const QUEUE_PREFIX = "push:queue:";
const QUEUE_TTL = 5 * 60; // 5 分钟过期

// GET: 轮询获取消息
export async function GET(req: NextRequest) {
  // 验证认证
  const authHeader = req.headers.get("Authorization");
  const cfAccessId = req.headers.get("CF-Access-Client-Id");
  const expectedCode = process.env.CODE;
  const referer = req.headers.get("Referer");
  const origin = req.headers.get("Origin");
  const host = req.headers.get("Host");

  // 检查是否为同源请求（浏览器前端轮询）
  const isSameOrigin =
    (referer && host && referer.includes(host)) ||
    (origin && host && origin.includes(host.split(":")[0]));

  if (expectedCode && !isSameOrigin) {
    const token = authHeader?.replace("Bearer ", "");
    // 允许 Bearer token 或 CF Access Service Account
    if (token !== expectedCode && !cfAccessId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
  // 验证认证 - 需要 Bearer token 或 CODE 环境变量匹配
  const authHeader = req.headers.get("Authorization");
  const expectedCode = process.env.CODE;

  if (expectedCode) {
    const token = authHeader?.replace("Bearer ", "");
    if (token !== expectedCode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Rate limiting - use IP or token as identifier
  const rateLimitKey =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";

  try {
    // Check rate limit
    const { success, limit, remaining, reset } =
      await ratelimit.limit(rateLimitKey);

    if (!success) {
      console.log(`[Push] Rate limited: ${rateLimitKey}`);
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          limit,
          remaining: 0,
          resetAt: new Date(reset).toISOString(),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": limit.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": reset.toString(),
            "Retry-After": Math.ceil((reset - Date.now()) / 1000).toString(),
          },
        },
      );
    }

    // Parse request body
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

    // 使用 pipeline 合并 Redis 调用，减少网络往返
    await redis
      .pipeline()
      .rpush(key, message)
      .expire(key, QUEUE_TTL)
      .ltrim(key, -100, -1)
      .exec();

    console.log(
      `[Push] Message queued for session ${sessionId.slice(0, 8)}...`,
    );

    // Return success with rate limit headers
    return NextResponse.json(
      {
        success: true,
        messageId: message.id,
        queued: true,
      },
      {
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      },
    );
  } catch (e) {
    console.error("[Push] Redis POST error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

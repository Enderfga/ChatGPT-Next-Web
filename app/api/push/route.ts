import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

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
  content: string | MultimodalContent[]; // 支持文本或多模态内容
  role?: "assistant" | "system";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const messageQueue = new Map<string, PushMessage[]>();

// 清理过期消息（超过 5 分钟）
function cleanupStaleMessages() {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const [sessionId, messages] of messageQueue) {
    const validMessages = messages.filter(
      (msg) => now - msg.timestamp < maxAge,
    );
    if (validMessages.length === 0) {
      messageQueue.delete(sessionId);
    } else {
      messageQueue.set(sessionId, validMessages);
    }
  }
}

// GET: 轮询获取消息
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 },
    );
  }

  // 清理过期消息
  cleanupStaleMessages();

  // 获取并清空该 session 的消息队列
  const messages = messageQueue.get(sessionId) || [];
  messageQueue.set(sessionId, []); // 清空已取出的消息

  return NextResponse.json({
    messages,
    hasMore: false, // 目前一次返回所有消息
    timestamp: Date.now(),
  });
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

    // 存入队列
    const queue = messageQueue.get(sessionId) || [];
    queue.push(message);
    // 限制队列大小
    if (queue.length > 100) {
      queue.shift();
    }
    messageQueue.set(sessionId, queue);
    console.log(`[Push] Message queued for session ${sessionId}`);

    return NextResponse.json({
      success: true,
      messageId: message.id,
      queued: true,
    });
  } catch (e) {
    console.error("[Push] Error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

// 存储活跃的 SSE 连接
interface Connection {
  controller: ReadableStreamDefaultController;
  sessionId: string;
  createdAt: number;
}

// 使用全局变量存储连接（在 Vercel serverless 环境中，每个实例会有自己的连接池）
const connections = new Map<string, Connection>();

// 存储待推送的消息队列
interface PushMessage {
  id: string;
  sessionId: string;
  type: "message" | "status" | "error";
  content: string;
  role?: "assistant" | "system";
  timestamp: number;
  metadata?: Record<string, unknown>;
}

const messageQueue = new Map<string, PushMessage[]>();

// 清理过期连接（超过 30 分钟）
function cleanupStaleConnections() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [clientId, conn] of connections) {
    if (now - conn.createdAt > maxAge) {
      try {
        conn.controller.close();
      } catch (e) {
        // ignore
      }
      connections.delete(clientId);
    }
  }
}

// GET: 建立 SSE 连接
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "sessionId is required" },
      { status: 400 },
    );
  }

  // 生成客户端 ID
  const clientId = nanoid();

  // 清理过期连接
  cleanupStaleConnections();

  // 创建 SSE 流
  const stream = new ReadableStream({
    start(controller) {
      // 存储连接
      connections.set(clientId, {
        controller,
        sessionId,
        createdAt: Date.now(),
      });

      // 发送连接成功事件
      const connectEvent = `event: connected\ndata: ${JSON.stringify({
        clientId,
        sessionId,
        timestamp: Date.now(),
      })}\n\n`;
      controller.enqueue(new TextEncoder().encode(connectEvent));

      // 发送心跳保持连接
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = `:heartbeat ${Date.now()}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeat));
        } catch (e) {
          clearInterval(heartbeatInterval);
          connections.delete(clientId);
        }
      }, 15000); // 每 15 秒发送心跳

      // 检查并发送队列中的消息
      const checkQueue = () => {
        const messages = messageQueue.get(sessionId) || [];
        while (messages.length > 0) {
          const msg = messages.shift();
          if (msg) {
            try {
              const event = `event: ${msg.type}\ndata: ${JSON.stringify(
                msg,
              )}\n\n`;
              controller.enqueue(new TextEncoder().encode(event));
            } catch (e) {
              // 发送失败，放回队列
              messages.unshift(msg);
              break;
            }
          }
        }
        messageQueue.set(sessionId, messages);
      };

      // 定期检查消息队列
      const queueInterval = setInterval(checkQueue, 1000);

      // 连接关闭时清理
      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeatInterval);
        clearInterval(queueInterval);
        connections.delete(clientId);
        console.log(`[Push] Client ${clientId} disconnected`);
      });

      console.log(
        `[Push] Client ${clientId} connected for session ${sessionId}`,
      );
    },
    cancel() {
      connections.delete(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
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

    // 尝试直接推送到已连接的客户端
    let delivered = false;
    for (const [clientId, conn] of connections) {
      if (conn.sessionId === sessionId) {
        try {
          const event = `event: ${message.type}\ndata: ${JSON.stringify(
            message,
          )}\n\n`;
          conn.controller.enqueue(new TextEncoder().encode(event));
          delivered = true;
          console.log(`[Push] Message delivered to client ${clientId}`);
        } catch (e) {
          // 连接已断开，移除
          connections.delete(clientId);
        }
      }
    }

    // 如果没有活跃连接，存入队列
    if (!delivered) {
      const queue = messageQueue.get(sessionId) || [];
      queue.push(message);
      // 限制队列大小
      if (queue.length > 100) {
        queue.shift();
      }
      messageQueue.set(sessionId, queue);
      console.log(`[Push] Message queued for session ${sessionId}`);
    }

    return NextResponse.json({
      success: true,
      messageId: message.id,
      delivered,
    });
  } catch (e) {
    console.error("[Push] Error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

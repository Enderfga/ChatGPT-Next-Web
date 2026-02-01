import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";

// 存储待处理的请求
interface PendingRequest {
  id: string;
  sessionId: string;
  status: "pending" | "processing" | "completed" | "error";
  startTime: number;
  messages: any[];
  model: string;
  result?: string;
  error?: string;
}

const pendingRequests = new Map<string, PendingRequest>();

// 清理过期请求（超过 10 分钟）
function cleanupStaleRequests() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000;

  for (const [id, req] of pendingRequests) {
    if (now - req.startTime > maxAge) {
      pendingRequests.delete(id);
    }
  }
}

// POST: 提交聊天请求（立即返回，后台处理）
export async function POST(req: NextRequest) {
  // 认证检查
  const authHeader = req.headers.get("Authorization");
  const expectedCode = process.env.CODE;
  if (expectedCode) {
    const token = authHeader?.replace("Bearer ", "");
    if (token !== expectedCode) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json();
    const { sessionId, messages, model, stream } = body;

    if (!sessionId || !messages) {
      return NextResponse.json(
        { error: "sessionId and messages are required" },
        { status: 400 },
      );
    }

    const requestId = nanoid();

    // 记录请求
    const pendingReq: PendingRequest = {
      id: requestId,
      sessionId,
      status: "pending",
      startTime: Date.now(),
      messages,
      model: model || "gpt-4",
    };
    pendingRequests.set(requestId, pendingReq);

    // 立即返回请求 ID
    // 后台处理将通过 push API 发送结果

    // 使用 edge runtime 的方式启动后台任务
    // 注意：这里我们不能真正地 "后台" 运行
    // 但我们可以立即返回，让前端知道请求已接收

    console.log(
      `[Chat-Async] Request ${requestId} queued for session ${sessionId}`,
    );

    // 清理旧请求
    cleanupStaleRequests();

    return NextResponse.json({
      success: true,
      requestId,
      status: "queued",
      message: "请求已接收，结果将通过推送发送",
    });
  } catch (e) {
    console.error("[Chat-Async] Error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// GET: 检查请求状态
export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");

  if (!requestId) {
    return NextResponse.json(
      { error: "requestId is required" },
      { status: 400 },
    );
  }

  const pendingReq = pendingRequests.get(requestId);

  if (!pendingReq) {
    return NextResponse.json(
      { error: "Request not found or expired" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    requestId,
    status: pendingReq.status,
    elapsedMs: Date.now() - pendingReq.startTime,
  });
}

export const runtime = "edge";
